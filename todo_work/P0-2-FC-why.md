用

```read_file
{"target_file":"/Users/liuhui36/Desktop/agent-work/ai-agent-mvp/src/agent/planner.ts"}
```

```read_file
{"target_file":"/Users/liuhui36/Desktop/agent-work/ai-agent-mvp/src/agent/types.ts"}
```

I

好，这条我详细讲一下。核心问题在 [`src/agent/planner.ts:113-138`](/Users/liuhui36/Desktop/agent-work/ai-agent-mvp/src/agent/planner.ts#L113-138)。

## 当前做法（手工 parse）

看 planner.ts:20-36：

```ts
return `你是一个 AI Agent...
请严格按照以下 JSON 格式输出你的决策（不要输出其他内容）：
{"type":"tool","name":"工具名","input":{...参数}}
或
{"type":"finish","output":"最终回答内容"}`;
```

然后在 `plan()` 里 (planner.ts:122-137)：

```ts
const content = resp.choices[0].message.content ?? '';
const jsonMatch = content.match(/\{[\s\S]*\}/);   // 正则从自由文本里"捞"JSON
if (!jsonMatch) return { type: 'finish', output: content };
try {
  const parsed = JSON.parse(jsonMatch[0]) as Action;
  ...
} catch {
  return { type: 'finish', output: content };     // 静默降级
}
```

**本质：让 LLM 用自然语言字符串"假装"结构化输出，再用字符串处理把它还原成对象。**

## 这样为什么脆弱

以下是**真实会出问题**的情况，且当前代码都会静默降级为 `finish`（把工具调用意图丢失）：

**Case 1 · Markdown 围栏**
LLM 很爱输出：
````
好的，我调用天气工具：
```json
{"type":"tool","name":"getWeather","input":{"city":"北京"}}
```
````
`/\{[\s\S]*\}/` 会**贪婪匹配**到最后一个 `}`，如果 LLM 前后还有大括号（比如说明"参数是一个对象 `{...}`"），就会连错。

**Case 2 · 嵌套 JSON 中出现字符串大括号**
```json
{"type":"tool","name":"search","input":{"query":"如何写 {jsx} 组件"}}
```
LLM 想解释花括号语法时，`input` 里就带 `{`。当前正则用的是 `[\s\S]*`（贪婪），第一个 `{` 到最后一个 `}` 拿到的还是对的；但**如果 LLM 在 JSON 前后还带解释文字并且里面有 `}`**（如"这里 `}` 是闭合符号"），就会把外面的 `}` 当结尾，parse 直接失败。

**Case 3 · 多个 JSON 并存**
LLM 有时会先给一个示范再给真答案：
```
比如可以这样：{"type":"tool","name":"getWeather","input":{"city":"东京"}}
所以我调用：{"type":"tool","name":"getWeather","input":{"city":"北京"}}
```
贪婪匹配拿到的是从第一个 `{` 到最后一个 `}` 之间的全部内容，parse 一定失败 → **静默降级为 finish，等于告诉用户"任务完成"，但其实什么工具都没跑**。

**Case 4 · 字段名/类型漂移**
LLM 输出 `{"action":"tool", "tool":"getWeather", "args":{"city":"北京"}}`，格式对但字段名不对。[`planner.ts:130-131`](/Users/liuhui36/Desktop/agent-work/ai-agent-mvp/src/agent/planner.ts#L130-131) 只检查 `type in parsed && 'name' in parsed`——不匹配 → 又静默降级为 finish。

**Case 5 · input 参数不符合 schema**
即使 JSON 结构对了，`input` 里的字段是否符合工具的 `schema` 也没人校验。比如 `getWeather` 要 `city`，LLM 给了 `location`，代码照样把它传给 tool 的 `run()`，工具内部才崩。

**每一种失败，用户看到的都是"Agent 直接返回一句话"，没有任何调用工具**——这就是"鲁棒性差"的具体含义。

## 原生 function-calling 的做法

OpenAI 兼容 API（包括 DashScope 上的 Qwen 和 DeepSeek）都支持在请求里传 `tools` 字段，LLM 会在**独立字段** `message.tool_calls` 里返回结构化调用：

```ts
const resp = await provider.chat({
  messages,
  tools: tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,   // JSON Schema 直接对应
    },
  })),
  tool_choice: 'auto',
});

const msg = resp.choices[0].message;
if (msg.tool_calls?.length) {
  for (const call of msg.tool_calls) {
    // call.id, call.function.name, call.function.arguments (JSON string)
    const input = JSON.parse(call.function.arguments);
    // 执行工具，把结果作为 role='tool' 消息回填，带 tool_call_id
  }
} else {
  return { type: 'finish', output: msg.content ?? '' };
}
```

## 迁移后带来的改进

| 维度 | 手工 parse（当前） | 原生 function-calling |
|------|---------------------|-------------------------|
| 结构可靠性 | 字符串里"捞" JSON，Case 1–5 都可能失败 | LLM 端保证 `tool_calls` 结构化返回 |
| 参数校验 | 无 | 供应商侧按 JSON Schema 校验；本地可再用 Ajv 二次校验 |
| 并行工具调用 | 只能一次一个 | `tool_calls[]` 支持一次多个，可并行执行 |
| System prompt | 要塞进"你必须输出 JSON"的约束和示例 | prompt 里不再提工具，纯粹描述任务；工具描述由 `tools` 字段带过去 |
| 消息回填 | 用 `role: 'user'` 塞 "工具返回结果：..."（planner.ts:79-80，语义错） | 用规范的 `role: 'tool'` + `tool_call_id`，LLM 理解得更好 |
| 失败降级 | 静默 finish，用户不知情 | 明确区分"LLM 拒绝调用"和"LLM 结构错误" |

## 一个直接的验证方法

如果你想**亲眼看到**当前实现会出问题：

在 [`planner.ts:118`](/Users/liuhui36/Desktop/agent-work/ai-agent-mvp/src/agent/planner.ts#L118) 之后临时加一行 `console.log('[LLM_RAW]', content);`，跑几个刁钻的 query，比如：

```bash
curl -N -X POST http://localhost:3131/agent/run \
  -H 'content-type: application/json' \
  -d '{"input":"介绍一下 JSON 格式，然后帮我查北京天气"}'
```

大概率你会看到 LLM 在讲 JSON 时输出了 `{...}` 样例，正则把示范和真调用一起匹配了 → parse 失败 → 静默 finish → 天气工具**没跑**，但用户以为回答完了。

这就是这一条 P0 的根本动机：**把"字符串协议"换成"字段协议"，让协议层由 SDK 和模型保证，而不是由我们脆弱的正则+try/catch 保证**。

ReportID: 91055773-519b-458f-9ae4-578b0c72b5e5
ConversationID: 8db9a9f7-d9f5-4770-b900-9909ed318a32
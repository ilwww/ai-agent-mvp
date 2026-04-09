/**
 * AI Node 服务集成测试
 * 运行前请确保服务已启动：pnpm dev / pnpm start
 *
 * 用法：pnpm test
 */

const BASE = 'http://localhost:3131';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

/**
 * 读取完整 SSE 流，返回 { lines, hasDone }
 *
 * 关键：使用 buffer 累积跨 chunk 的不完整行，
 * 只有遇到 \n 后才将完整行 push 进结果，避免残缺行。
 */
async function readSSE(res: Response): Promise<{ lines: string[]; hasDone: boolean }> {
  const lines: string[] = [];
  let hasDone = false;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // 流关闭：flush decoder，处理 buffer 中最后一行（若有）
        buffer += decoder.decode();
        const trimmed = buffer.trimEnd();
        if (trimmed) lines.push(trimmed);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      // 按 \n 切分，最后一段可能不完整，留回 buffer
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;
        lines.push(trimmed);
        if (trimmed === 'data: [DONE]') hasDone = true;
      }
      if (hasDone) break;
    }
  } finally {
    reader.releaseLock();
  }
  return { lines, hasDone };
}

// ─────────────────────────────────────────────
// Case 1: GET /health
// ─────────────────────────────────────────────
console.log('\n[1] GET /health');
{
  const res = await fetch(`${BASE}/health`);
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('status === "ok"', body.status === 'ok');
  assert('包含 timestamp', typeof body.timestamp === 'string');
}

// ─────────────────────────────────────────────
// Case 2: POST /chat — Qwen 正常请求（默认模型）
// ─────────────────────────────────────────────
console.log('\n[2] POST /chat — Qwen 正常请求（默认模型）');
{
  const res = await post('/chat', { prompt: '用一句话介绍你自己' });
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('success === true', body.success === true);
  assert('data 为非空字符串', typeof body.data === 'string' && body.data.length > 0);
  assert('包含 cached 字段', typeof body.cached === 'boolean');
  assert('首次请求 cached=false', body.cached === false);
}

// ─────────────────────────────────────────────
// Case 3: POST /chat — 缓存命中
// ─────────────────────────────────────────────
console.log('\n[3] POST /chat — 缓存命中（同一 prompt 第二次请求）');
{
  const res = await post('/chat', { prompt: '用一句话介绍你自己' });
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('cached === true', body.cached === true);
}

// ─────────────────────────────────────────────
// Case 4: POST /chat — 显式指定 model: qwen
// ─────────────────────────────────────────────
console.log('\n[4] POST /chat — 显式指定 model: qwen');
{
  const res = await post('/chat', { prompt: '你好', model: 'qwen' });
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('success === true', body.success === true);
  assert('data 非空', typeof body.data === 'string' && body.data.length > 0);
}

// ─────────────────────────────────────────────
// Case 5: POST /chat — model: deepseek
// ─────────────────────────────────────────────
console.log('\n[5] POST /chat — model: deepseek');
{
  const res = await post('/chat', { prompt: '用一句话自我介绍', model: 'deepseek' });
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('success === true', body.success === true);
  assert('data 非空', typeof body.data === 'string' && body.data.length > 0);
  // deepseek 与 qwen 缓存 key 独立，首次应为 false
  assert('deepseek 首次请求 cached=false', body.cached === false);
}

// ─────────────────────────────────────────────
// Case 6: POST /chat — 不同模型缓存隔离
// ─────────────────────────────────────────────
console.log('\n[6] POST /chat — 不同模型缓存 key 隔离');
{
  // 先用 qwen 请求一次（会写入 qwen 缓存）
  const prompt = '缓存隔离测试_' + Date.now();
  await post('/chat', { prompt, model: 'qwen' });
  // 同 prompt 改用 deepseek，应走 deepseek 缓存（首次 cached=false）
  const res = await post('/chat', { prompt, model: 'deepseek' });
  const body = await res.json();
  assert('deepseek 与 qwen 缓存独立（cached=false）', body.cached === false);
}

// ─────────────────────────────────────────────
// Case 7: POST /chat — 参数校验：缺少 prompt
// ─────────────────────────────────────────────
console.log('\n[7] POST /chat — 缺少 prompt 字段（应返回 400）');
{
  const res = await post('/chat', {});
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 8: POST /chat — 参数校验：prompt 为空字符串
// ─────────────────────────────────────────────
console.log('\n[8] POST /chat — prompt 为空字符串（应返回 400）');
{
  const res = await post('/chat', { prompt: '' });
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 9: POST /chat — 参数校验：多余字段
// ─────────────────────────────────────────────
console.log('\n[9] POST /chat — 包含 additionalProperties（应返回 400）');
{
  const res = await post('/chat', { prompt: '你好', extra: 'field' });
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 10: POST /chat — 参数校验：非法 model 值
// ─────────────────────────────────────────────
console.log('\n[10] POST /chat — model 不在 enum 范围（应返回 400）');
{
  const res = await post('/chat', { prompt: '你好', model: 'gpt-99' });
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 11: POST /chat-stream — Qwen 流式输出
// ─────────────────────────────────────────────
console.log('\n[11] POST /chat-stream — Qwen 流式输出');
{
  const res = await post('/chat-stream', { prompt: '用一句话介绍北京' });
  // 立即启动 body 消费（与服务端写入并发），防止 undici 在连接关闭后丢弃缓冲
  const ssePromise = readSSE(res);
  assert('状态码 200', res.status === 200);
  assert(
    'Content-Type 为 text/event-stream',
    res.headers.get('content-type')?.includes('text/event-stream') ?? false,
  );
  const { lines, hasDone } = await ssePromise;
  assert(
    '收到 data: 格式内容',
    lines.some((l) => l.startsWith('data: ')),
    `实际 lines: ${JSON.stringify(lines)}`,
  );
  assert('以 [DONE] 结束', hasDone, `实际 lines: ${JSON.stringify(lines)}`);
}

// ─────────────────────────────────────────────
// Case 12: POST /chat-stream — DeepSeek 流式输出
// ─────────────────────────────────────────────
console.log('\n[12] POST /chat-stream — DeepSeek 流式输出');
{
  const res = await post('/chat-stream', { prompt: '用一句话介绍上海', model: 'deepseek' });
  const ssePromise = readSSE(res);
  assert('状态码 200', res.status === 200);
  assert(
    'Content-Type 为 text/event-stream',
    res.headers.get('content-type')?.includes('text/event-stream') ?? false,
  );
  const { lines, hasDone } = await ssePromise;
  assert(
    '收到 data: 格式内容',
    lines.some((l) => l.startsWith('data: ')),
    `实际 lines: ${JSON.stringify(lines)}`,
  );
  assert('以 [DONE] 结束', hasDone, `实际 lines: ${JSON.stringify(lines)}`);
}

// ─────────────────────────────────────────────
// Case 13: POST /chat-stream — DeepSeek 思考模式
// ─────────────────────────────────────────────
console.log('\n[13] POST /chat-stream — DeepSeek 思考模式（enableThinking）');
{
  const res = await post('/chat-stream', {
    prompt: '1+1=?',
    model: 'deepseek',
    enableThinking: true,
  });
  const ssePromise = readSSE(res);
  assert('状态码 200', res.status === 200);
  const { lines, hasDone } = await ssePromise;
  assert(
    '包含 event: thinking 事件',
    lines.some((l) => l === 'event: thinking'),
    `实际 lines: ${JSON.stringify(lines)}`,
  );
  assert(
    '包含正式回答 data:',
    lines.some((l) => l.startsWith('data: ') && !l.includes('[DONE]')),
    `实际 lines: ${JSON.stringify(lines)}`,
  );
  assert('以 [DONE] 结束', hasDone, `实际 lines: ${JSON.stringify(lines)}`);
}

// ─────────────────────────────────────────────
// Case 14: POST /chat-stream — 参数校验
// ─────────────────────────────────────────────
console.log('\n[14] POST /chat-stream — 缺少 prompt（应返回 400）');
{
  const res = await post('/chat-stream', {});
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// 汇总
// ─────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`测试完成：${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);

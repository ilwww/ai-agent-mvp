/**
 * AI Node 服务集成测试
 * 运行前请确保服务已启动：npm start / npm run dev
 *
 * 用法：npm test
 */

const BASE = 'http://localhost:3131';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
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
// Case 2: POST /chat 正常请求
// ─────────────────────────────────────────────
console.log('\n[2] POST /chat — 正常请求');
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
// Case 3: POST /chat 缓存命中
// ─────────────────────────────────────────────
console.log('\n[3] POST /chat — 缓存命中（同一 prompt 第二次请求）');
{
  const res = await post('/chat', { prompt: '用一句话介绍你自己' });
  const body = await res.json();
  assert('状态码 200', res.status === 200);
  assert('cached === true', body.cached === true);
}

// ─────────────────────────────────────────────
// Case 4: POST /chat 参数校验 — 缺少 prompt
// ─────────────────────────────────────────────
console.log('\n[4] POST /chat — 缺少 prompt 字段（应返回 400）');
{
  const res = await post('/chat', {});
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 5: POST /chat 参数校验 — prompt 为空字符串
// ─────────────────────────────────────────────
console.log('\n[5] POST /chat — prompt 为空字符串（应返回 400）');
{
  const res = await post('/chat', { prompt: '' });
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 6: POST /chat 参数校验 — 多余字段
// ─────────────────────────────────────────────
console.log('\n[6] POST /chat — 包含 additionalProperties（应返回 400）');
{
  const res = await post('/chat', { prompt: '你好', extra: 'field' });
  assert('状态码 400', res.status === 400);
}

// ─────────────────────────────────────────────
// Case 7: POST /chat-stream 流式输出
// ─────────────────────────────────────────────
console.log('\n[7] POST /chat-stream — 流式输出');
{
  const res = await post('/chat-stream', { prompt: '用一句话介绍北京' });
  assert('状态码 200', res.status === 200);
  assert(
    'Content-Type 为 text/event-stream',
    res.headers.get('content-type')?.includes('text/event-stream'),
  );

  let fullText = '';
  let hasDone = false;

  for await (const chunk of res.body) {
    const text = new TextDecoder().decode(chunk);
    fullText += text;
    if (text.includes('[DONE]')) {
      hasDone = true;
      break;
    }
  }

  assert('收到 data: 格式内容', fullText.includes('data:'));
  assert('以 [DONE] 结束', hasDone);
}

// ─────────────────────────────────────────────
// Case 8: POST /chat-stream 参数校验
// ─────────────────────────────────────────────
console.log('\n[8] POST /chat-stream — 缺少 prompt（应返回 400）');
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

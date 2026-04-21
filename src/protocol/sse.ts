/**
 * @module protocol/sse
 *
 * Server-Sent Events (SSE) 协议工具函数
 *
 * 提供初始化连接、推送事件和关闭连接三个核心操作，
 * 供 Agent runtime 在任务执行过程中向客户端实时推送进度。
 *
 * SSE 数据格式说明：
 * ```
 * event: <事件类型>\n
 * data: <数据行1>\n
 * data: <数据行2>\n   ← 多行数据时每行独立前缀
 * \n                  ← 空行表示一条事件结束
 * ```
 */

import type { ServerResponse } from 'node:http';
import type { SSEEventType } from '../agent/types.js';

/**
 * 初始化 SSE 连接
 *
 * 设置响应头并发送初始 ping 注释帧，使客户端确认连接已建立。
 * 必须在首次调用 sendSSE 之前调用，且只调用一次。
 *
 * 响应头说明：
 * - `Content-Type: text/event-stream` — 告知浏览器/客户端以 SSE 协议解析
 * - `Cache-Control: no-cache` — 禁止中间代理缓存事件流
 * - `Connection: keep-alive` — 保持长连接
 * - `X-Accel-Buffering: no` — 禁止 Nginx 缓冲，确保事件实时到达客户端
 *
 * @param raw Node.js HTTP ServerResponse 对象
 *
 * @example
 * app.get('/api/agent/run', (req, res) => {
 *   initSSE(res);
 *   // 连接建立后客户端收到：": ping\n\n"
 *   sendSSE(res, 'thought', '开始规划任务...');
 * });
 */
export function initSSE(raw: ServerResponse): void {
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // 发送 SSE 注释帧（以 ": " 开头），用于建立连接后的初始心跳
  raw.write(': ping\n\n');
}

/**
 * 向客户端推送一条 SSE 事件
 *
 * 若连接已被销毁（客户端断开），则静默忽略，不会抛出错误。
 * 对于包含换行符的数据（如多行 JSON），会自动拆分为多个 `data:` 行，
 * 符合 SSE 规范要求。
 *
 * @param raw   Node.js HTTP ServerResponse 对象
 * @param event SSE 事件类型（thought / action / result / done / error）
 * @param data  事件数据，字符串直接发送，对象自动序列化为 JSON
 *
 * @example
 * // 推送字符串数据
 * sendSSE(res, 'thought', '第 1 步决策：调用工具 getWeather');
 * // 客户端收到：
 * // event: thought
 * // data: 第 1 步决策：调用工具 getWeather
 * //
 *
 * @example
 * // 推送对象数据（自动 JSON 序列化）
 * sendSSE(res, 'result', { tool: 'getWeather', output: { city: '北京', temperature: 28 } });
 * // 客户端收到：
 * // event: result
 * // data: {"tool":"getWeather","output":{"city":"北京","temperature":28}}
 * //
 *
 * @example
 * // 任务完成事件
 * sendSSE(res, 'done', { output: '北京今天晴，气温 28°C。' });
 */
export function sendSSE(raw: ServerResponse, event: SSEEventType, data: unknown): void {
  // 连接已断开时跳过，避免写入已销毁的流
  if (raw.destroyed) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // 将多行内容拆分，每行加 "data: " 前缀，符合 SSE 多行数据规范
  const encoded = payload
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n');
  raw.write(`event: ${event}\n${encoded}\n\n`);
}

/**
 * 关闭 SSE 连接
 *
 * 若连接尚未销毁则主动调用 res.end() 结束响应。
 * 通常在 Agent 任务完成或发生不可恢复的错误后调用。
 *
 * @param raw Node.js HTTP ServerResponse 对象
 *
 * @example
 * // 发送完成事件后关闭连接
 * sendSSE(res, 'done', { output: '任务完成' });
 * endSSE(res);
 */
export function endSSE(raw: ServerResponse): void {
  if (!raw.destroyed) raw.end();
}

import type { ServerResponse } from 'node:http';
import type { SSEEventType } from '../agent/types.js';

export function initSSE(raw: ServerResponse): void {
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  raw.write(': ping\n\n');
}

export function sendSSE(raw: ServerResponse, event: SSEEventType, data: unknown): void {
  if (raw.destroyed) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const encoded = payload
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n');
  raw.write(`event: ${event}\n${encoded}\n\n`);
}

export function endSSE(raw: ServerResponse): void {
  if (!raw.destroyed) raw.end();
}

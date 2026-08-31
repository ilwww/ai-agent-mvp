import { describe, it, expect } from 'vitest';
import { sanitizeSchema } from '../schema.js';

describe('mcp/sanitizeSchema', () => {
  it('剥离 $schema / $ref / definitions 等不支持关键字', () => {
    const raw = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'x',
      definitions: { Foo: { type: 'string' } },
      type: 'object',
      properties: {
        a: { type: 'string', $ref: '#/definitions/Foo', description: 'A' },
      },
      required: ['a'],
    };
    expect(sanitizeSchema(raw)).toEqual({
      type: 'object',
      properties: { a: { type: 'string', description: 'A' } },
      required: ['a'],
    });
  });

  it('顶层非 object → 包一层空 object', () => {
    expect(sanitizeSchema({ type: 'string' })).toEqual({ type: 'object', properties: {} });
    expect(sanitizeSchema({ anyOf: [{ type: 'string' }] })).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('缺 properties 时补空对象', () => {
    expect(sanitizeSchema({ type: 'object' })).toEqual({ type: 'object', properties: {} });
  });

  it('递归处理嵌套 properties 与 items', () => {
    const raw = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'number', $ref: 'x' } } },
        },
      },
    };
    expect(sanitizeSchema(raw)).toEqual({
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'number' } } },
        },
      },
    });
  });

  it('undefined / 非对象输入 → 空 object schema', () => {
    expect(sanitizeSchema(undefined)).toEqual({ type: 'object', properties: {} });
    expect(sanitizeSchema('nope')).toEqual({ type: 'object', properties: {} });
  });
});

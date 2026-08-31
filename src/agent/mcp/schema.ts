/**
 * MCP 远端 `inputSchema` 清洗。
 *
 * 远端 server 常返回带 `$schema` / `$ref` / `definitions` 的完整 JSON Schema，
 * 或顶层不是 `object` 的 schema。这些会被 OpenAI 兼容接口（DashScope）拒绝，
 * 因此在注册为 function parameters 前统一裁剪为受支持的最小子集。
 */

/** 顶层与嵌套均保留的关键字白名单 */
const ALLOWED_KEYWORDS = new Set([
  'type',
  'description',
  'enum',
  'const',
  'default',
  'properties',
  'required',
  'items',
  'additionalProperties',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 递归裁剪单个 schema 节点，仅保留白名单关键字 */
function pruneNode(node: unknown): Record<string, unknown> {
  if (!isPlainObject(node)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!ALLOWED_KEYWORDS.has(key)) continue;
    if (key === 'properties' && isPlainObject(value)) {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        props[propName] = pruneNode(propSchema);
      }
      out.properties = props;
    } else if (key === 'items') {
      out.items = Array.isArray(value) ? value.map(pruneNode) : pruneNode(value);
    } else if (key === 'additionalProperties' && isPlainObject(value)) {
      out.additionalProperties = pruneNode(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 清洗远端 schema，保证结果是顶层 `type: 'object'` 且不含 `$ref` 等不支持的关键字。
 *
 * @param raw 远端 `inputSchema`（可能为 undefined / 非对象）
 * @returns 可直接作为 function parameters 使用的 schema
 */
export function sanitizeSchema(raw: unknown): Record<string, unknown> {
  const pruned = pruneNode(raw);
  if (pruned.type !== 'object') {
    // 顶层非 object（或缺 type）时包一层空 object，模型将以无参调用
    return { type: 'object', properties: {} };
  }
  if (!isPlainObject(pruned.properties)) {
    pruned.properties = {};
  }
  return pruned;
}

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function matchesType(value: unknown, type: string | undefined): boolean {
  if (!type) return true;
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeOf(value) === 'object';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/** 轻量 JSON Schema 校验（object/string/number/integer/boolean/array + required + enum） */
export function validateArgs(
  schema: Schema,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  if (typeOf(args) !== 'object') return { ok: false, errors: ['参数必须是 JSON 对象'] };
  const value = args as Record<string, unknown>;
  const errors: string[] = [];
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const properties = (schema.properties || {}) as Record<string, Schema>;

  for (const key of required) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      errors.push(`缺少必填参数：${key}`);
    }
  }
  for (const [key, prop] of Object.entries(properties)) {
    if (value[key] === undefined) continue;
    if (!matchesType(value[key], prop.type as string | undefined)) {
      errors.push(`参数 ${key} 类型应为 ${String(prop.type)}`);
      continue;
    }
    if (Array.isArray(prop.enum) && !prop.enum.includes(value[key])) {
      errors.push(`参数 ${key} 必须是 ${prop.enum.join(' / ')} 之一`);
    }
    if (prop.type === 'array' && Array.isArray(value[key]) && prop.items) {
      const itemSchema = prop.items as Schema;
      for (const item of value[key] as unknown[]) {
        if (!matchesType(item, itemSchema.type as string | undefined)) {
          errors.push(`参数 ${key} 的数组元素类型应为 ${String(itemSchema.type)}`);
          break;
        }
      }
    }
    if (prop.type === 'string' && typeof value[key] === 'string') {
      const str = value[key] as string;
      if (typeof prop.maxLength === 'number' && str.length > prop.maxLength) {
        errors.push(`参数 ${key} 超过最大长度 ${prop.maxLength}`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function truncate(value: string, max = 24_000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n…（内容已截断，共 ${value.length} 字符）`;
}

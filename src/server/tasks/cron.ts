/**
 * 标准 5 段 cron：分 时 日 月 周
 * 支持星号、步长、区间与逗号列表。周：0/7 为周日。
 * 时间按「UTC + tzOffsetMinutes」计算，避免依赖系统时区。
 */

type Field = { values: Set<number>; any: boolean };

export type CronSpec = {
  minute: Field;
  hour: Field;
  dayOfMonth: Field;
  month: Field;
  dayOfWeek: Field;
};

function parseField(expr: string, min: number, max: number): Field | null {
  const values = new Set<number>();
  let any = false;
  for (const raw of expr.split(',')) {
    const part = raw.trim();
    if (!part) return null;
    if (part === '*' || part === '?') {
      for (let i = min; i <= max; i++) values.add(i);
      any = true;
      continue;
    }
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) return null;
    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
      any = true;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      start = a;
      end = b;
    } else {
      start = Number(rangePart);
      end = start;
      if (!Number.isInteger(start)) return null;
    }
    if (start < min || end > max || start > end) return null;
    for (let v = start; v <= end; v += step) values.add(v);
  }
  // 周字段 7 等价于 0
  if (!values.size) return null;
  return { values, any };
}

export function parseCron(expr: string): CronSpec | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const dayOfMonth = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12);
  const dowRaw = parseField(fields[4], 0, 7);
  if (!minute || !hour || !dayOfMonth || !month || !dowRaw) return null;
  const dayOfWeekValues = new Set<number>();
  for (const v of dowRaw.values) dayOfWeekValues.add(v === 7 ? 0 : v);
  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek: { values: dayOfWeekValues, any: dowRaw.any && !dowRaw.values.has(7) },
  };
}

export function validateCron(expr: string): string | null {
  if (!expr.trim()) return 'cron 表达式不能为空';
  if (expr.trim().split(/\s+/).length !== 5) return 'cron 需要 5 段：分 时 日 月 周';
  return parseCron(expr) ? null : 'cron 表达式不合法（示例：0 9 * * 1-5）';
}

export function nextCronTime(expr: string, from: Date, tzOffsetMinutes = 0): Date | null {
  const spec = parseCron(expr);
  if (!spec) return null;
  const offsetMs = tzOffsetMinutes * 60_000;
  const cursor = new Date(from.getTime() + offsetMs);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const maxMinutes = 366 * 24 * 60;
  for (let i = 0; i < maxMinutes; i++) {
    const month = cursor.getUTCMonth() + 1;
    const dom = cursor.getUTCDate();
    const dow = cursor.getUTCDay();
    if (
      spec.minute.values.has(cursor.getUTCMinutes()) &&
      spec.hour.values.has(cursor.getUTCHours()) &&
      spec.month.values.has(month)
    ) {
      const domAny = spec.dayOfMonth.any;
      const dowAny = spec.dayOfWeek.any;
      const domMatch = spec.dayOfMonth.values.has(dom);
      const dowMatch = spec.dayOfWeek.values.has(dow);
      const dayMatch =
        domAny && dowAny
          ? true
          : domAny
            ? dowMatch
            : dowAny
              ? domMatch
              : domMatch || dowMatch;
      if (dayMatch) return new Date(cursor.getTime() - offsetMs);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

export function describeCron(expr: string): string {
  const spec = parseCron(expr);
  if (!spec) return expr;
  if (expr.trim() === '* * * * *') return '每分钟';
  const minutes = [...spec.minute.values];
  const hours = [...spec.hour.values];
  if (spec.dayOfMonth.any && spec.month.any && spec.dayOfWeek.any && hours.length === 1 && minutes.length === 1) {
    return `每天 ${String(hours[0]).padStart(2, '0')}:${String(minutes[0]).padStart(2, '0')}`;
  }
  return expr;
}

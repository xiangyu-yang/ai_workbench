#!/usr/bin/env node
/**
 * 指标聚合：读取 CSV/JSON，计算环比、目标达成和异常标记。
 * 用法：
 *   node aggregate_metrics.mjs --input metrics.csv --format markdown
 *   SKILL_INPUT=/path/metrics.csv node aggregate_metrics.mjs --format json
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = { format: 'markdown', threshold: 10 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--input') out.input = argv[++i];
    else if (key === '--format') out.format = argv[++i];
    else if (key === '--threshold') out.threshold = Number(argv[++i]);
    else if (key === '--period') out.period = argv[++i];
  }
  return out;
}

function parseCsv(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((item) => item.length)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((v) => v.trim())).map((r) => {
    const item = {};
    headers.forEach((h, idx) => { item[h] = (r[idx] || '').trim(); });
    return item;
  });
}

function num(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}

function pct(value) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT || '';
  if (!input) {
    console.error('缺少输入：使用 --input 或 SKILL_INPUT');
    process.exit(2);
  }
  const raw = fs.readFileSync(input, 'utf8');
  const rows = input.toLowerCase().endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
  const list = Array.isArray(rows) ? rows : rows.metrics || [];
  const result = list.map((item) => {
    const current = num(item.current);
    const previous = num(item.previous);
    const target = num(item.target);
    const delta = current !== null && previous !== null && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : null;
    const attainment = current !== null && target !== null && target !== 0
      ? (current / target) * 100
      : null;
    let status = current === null ? 'missing' : 'on_track';
    if (delta !== null && Math.abs(delta) >= args.threshold) status = delta > 0 ? 'watch_up' : 'watch_down';
    if (attainment !== null && attainment < 90) status = 'off_target';
    return {
      metric: item.metric || item.name || '',
      current: current === null ? '—' : current,
      previous: previous === null ? '—' : previous,
      target: target === null ? '—' : target,
      unit: item.unit || '',
      owner: item.owner || '',
      deltaPct: delta,
      attainmentPct: attainment,
      status,
    };
  });

  if (args.format === 'json') {
    console.log(JSON.stringify({ period: args.period || null, thresholdPct: args.threshold, rows: result }, null, 2));
    return;
  }

  const lines = [];
  lines.push('| 指标 | 当前 | 上期 | 变化 | 目标 | 达成 | 负责人 | 状态 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const item of result) {
    lines.push('| ' + item.metric + ' | ' + item.current + ' ' + item.unit + ' | ' + item.previous + ' ' + item.unit + ' | ' + pct(item.deltaPct) + ' | ' + item.target + ' ' + item.unit + ' | ' + (item.attainmentPct === null ? '—' : item.attainmentPct.toFixed(0) + '%') + ' | ' + (item.owner || '—') + ' | ' + item.status + ' |');
  }
  const watch = result.filter((item) => item.status.startsWith('watch') || item.status === 'off_target');
  lines.push('');
  lines.push('**需关注**：' + (watch.length ? watch.map((item) => item.metric + '(' + item.status + ')').join('、') : '无'));
  console.log(lines.join('\n'));
}

main();

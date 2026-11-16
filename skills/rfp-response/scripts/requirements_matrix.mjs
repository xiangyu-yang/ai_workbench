#!/usr/bin/env node
/**
 * 需求矩阵：输入 JSON
 * {"requirements":[{"id":"R-001","text":"...","mandatory":true,"category":"技术"}]}
 * 输出 Markdown 或 CSV，含响应/负责人/证据空列。
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = { format: 'markdown' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--input') out.input = argv[++i];
    else if (argv[i] === '--format') out.format = argv[++i];
  }
  return out;
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT;
  if (!input) throw new Error('缺少 --input 或 SKILL_INPUT');
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const list = data.requirements || data;
  if (!Array.isArray(list) || !list.length) throw new Error('requirements 不能为空');
  const ids = new Set();
  const rows = list.map((item, index) => {
    const id = String(item.id || 'R-' + String(index + 1).padStart(3, '0'));
    if (ids.has(id)) throw new Error('需求 ID 重复：' + id);
    ids.add(id);
    return {
      id,
      requirement: String(item.text || item.requirement || '').trim(),
      mandatory: item.mandatory === false ? 'optional' : 'mandatory',
      category: item.category || '未分类',
      response: '待填写',
      section: '',
      owner: '',
      evidence: '',
      status: '未开始',
    };
  });
  if (rows.some((row) => !row.requirement)) throw new Error('存在空需求');

  if (args.format === 'csv') {
    const headers = ['id', 'requirement', 'mandatory', 'category', 'response', 'section', 'owner', 'evidence', 'status'];
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map((key) => csvCell(row[key])).join(','));
    console.log(lines.join('\n'));
    return;
  }
  const lines = ['| ID | 需求 | 类型 | 类别 | 响应 | 章节 | 负责人 | 证据 | 状态 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push('| ' + row.id + ' | ' + row.requirement + ' | ' + row.mandatory + ' | ' + row.category + ' | ' + row.response + ' | ' + row.section + ' | ' + row.owner + ' | ' + row.evidence + ' | ' + row.status + ' |');
  }
  const mandatory = rows.filter((row) => row.mandatory === 'mandatory').length;
  lines.push('');
  lines.push('共 ' + rows.length + ' 条需求，其中强制项 ' + mandatory + ' 条。');
  console.log(lines.join('\n'));
}

main();

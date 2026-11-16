#!/usr/bin/env node
/**
 * 加权评分：输入 JSON
 * {
 *   "criteria": [{"id":"capability","name":"核心能力","weight":25}],
 *   "competitors": [{"name":"我方","scores":{"capability":4}}]
 * }
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

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT;
  if (!input) throw new Error('缺少 --input 或 SKILL_INPUT');
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const criteria = data.criteria || [];
  const competitors = data.competitors || [];
  if (!criteria.length || !competitors.length) throw new Error('criteria 和 competitors 不能为空');
  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (!totalWeight) throw new Error('权重总和不能为 0');

  const rows = competitors.map((competitor) => {
    let score = 0;
    const details = {};
    for (const criterion of criteria) {
      const raw = Number((competitor.scores || {})[criterion.id] ?? 0);
      if (raw < 0 || raw > 5) throw new Error('评分必须在 0-5：' + competitor.name + '/' + criterion.id);
      const weighted = (raw * Number(criterion.weight || 0)) / totalWeight;
      details[criterion.id] = weighted;
      score += weighted;
    }
    return { name: competitor.name, score: Number(score.toFixed(2)), details };
  });
  rows.sort((a, b) => b.score - a.score);

  if (args.format === 'json') {
    console.log(JSON.stringify({ totalWeight, rows }, null, 2));
    return;
  }
  const header = ['| 竞品 | ' + criteria.map((c) => c.name + '(' + c.weight + '%)').join(' | ') + ' | 加权总分 |'];
  const divider = ['| --- | ' + criteria.map(() => '---:').join(' | ') + ' | ---: |'];
  const body = rows.map((row) => '| ' + row.name + ' | ' + criteria.map((c) => Number(row.details[c.id]).toFixed(2)).join(' | ') + ' | **' + row.score.toFixed(2) + '** |');
  console.log([...header, ...divider, ...body].join('\n'));
  console.log('\n权重总和：' + totalWeight + '；评分 0-5，0 表示不适用。');
}

main();

import { SKILL_LIBRARY } from '../src/server/skills/library';

const errors: string[] = [];
for (const skill of SKILL_LIBRARY) {
  if (!skill.body.trim()) errors.push(`${skill.name}: SKILL.md 正文为空`);
  if (!skill.files.some((file) => file.path.startsWith('references/'))) errors.push(`${skill.name}: 缺少 references/`);
  if (!skill.files.some((file) => file.path.startsWith('scripts/'))) errors.push(`${skill.name}: 缺少 scripts/`);
  if (!skill.files.some((file) => file.path.startsWith('assets/'))) errors.push(`${skill.name}: 缺少 assets/`);
  console.log(`${skill.name}: ${skill.files.length} files, ${skill.bindTo.length} bindings`);
}
if (errors.length) {
  console.error('技能校验失败：');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
console.log(`技能校验通过：${SKILL_LIBRARY.length} 个包`);

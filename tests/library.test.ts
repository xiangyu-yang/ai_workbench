import { describe, expect, it } from 'vitest';
import { SKILL_LIBRARY } from '../src/server/skills/library';
import { classifyPath, composeSkillMarkdown, parseSkillMarkdown } from '../src/server/skills/package';

describe('built-in skill library', () => {
  it('contains at least five complete packages', () => {
    expect(SKILL_LIBRARY.length).toBeGreaterThanOrEqual(5);
    const names = SKILL_LIBRARY.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(SKILL_LIBRARY.map((skill) => [skill.name, skill] as const))(
    '%s has SKILL.md, references, scripts and assets',
    (_name, skill) => {
      const dirs = new Set(skill.files.map((file) => file.path.split('/')[0]));
      expect(dirs.has('references')).toBe(true);
      expect(dirs.has('scripts')).toBe(true);
      expect(dirs.has('assets')).toBe(true);
      expect(skill.body.length).toBeGreaterThan(500);
      expect(skill.body).toContain('何时使用');
      for (const file of skill.files) {
        expect(classifyPath(file.path)).not.toBe('skill');
      }
      for (const file of skill.files.filter((item) => item.path.startsWith('scripts/'))) {
        expect(file.path).toMatch(/\.(mjs|js|cjs|py|sh)$/);
      }
    },
  );

  it('generates valid standard SKILL.md for every package', () => {
    for (const skill of SKILL_LIBRARY) {
      const markdown = composeSkillMarkdown({
        name: skill.name,
        description: skill.description,
        body: skill.body,
        version: skill.version,
        license: skill.license,
        allowedTools: skill.allowedTools,
        category: skill.category,
      });
      const parsed = parseSkillMarkdown(markdown);
      expect(parsed.errors).toEqual([]);
      expect(parsed.frontmatter.name).toBe(skill.name);
      expect(parsed.frontmatter.allowedTools).toEqual(skill.allowedTools);
      expect(parsed.body).toContain('何时使用');
    }
  });
});

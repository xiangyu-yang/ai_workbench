import { describe, expect, it } from 'vitest';
import {
  classifyPath,
  composeSkillMarkdown,
  normalizePackagePath,
  parseSkillMarkdown,
  summarizePackage,
} from '../src/server/skills/package';

describe('skill package paths', () => {
  it('normalizes safe paths', () => {
    expect(normalizePackagePath('./references/a.md')).toBe('references/a.md');
    expect(classifyPath('SKILL.md')).toBe('skill');
    expect(classifyPath('scripts/analyze.mjs')).toBe('script');
    expect(classifyPath('assets/logo.png')).toBe('asset');
    expect(classifyPath('references/清单 01.md')).toBe('reference');
  });

  it('blocks traversal and absolute paths', () => {
    expect(() => normalizePackagePath('../secret.txt')).toThrow();
    expect(() => normalizePackagePath('/etc/passwd')).toThrow();
    expect(() => classifyPath('other/a.md')).toThrow();
  });
});

describe('SKILL.md frontmatter', () => {
  it('parses standard frontmatter', () => {
    const parsed = parseSkillMarkdown(`---
name: 深度调研
description: 多源检索与验证
version: 1.0.0
allowed-tools:
  - knowledge_search
  - read_url
metadata:
  category: 研究
---

# 工作流程

先界定问题。`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.frontmatter.name).toBe('深度调研');
    expect(parsed.frontmatter.allowedTools).toEqual(['knowledge_search', 'read_url']);
    expect(parsed.body).toContain('先界定问题');
  });

  it('reports missing name and description', () => {
    const parsed = parseSkillMarkdown('---\nversion: 1\n---\nbody');
    expect(parsed.errors.join(' ')).toContain('name');
    expect(parsed.errors.join(' ')).toContain('description');
  });

  it('round-trips compose and parse', () => {
    const raw = composeSkillMarkdown({
      name: '结构化写作',
      description: '结论先行',
      body: '# 规范\n\n一段一个观点。',
      category: '写作',
      allowedTools: ['workspace_write'],
    });
    const parsed = parseSkillMarkdown(raw);
    expect(parsed.errors).toEqual([]);
    expect(parsed.frontmatter.name).toBe('结构化写作');
    expect(parsed.body).toContain('一段一个观点');
  });
});

describe('skill package summary', () => {
  it('requires SKILL.md', () => {
    const summary = summarizePackage([
      { path: 'references/a.md', kind: 'reference', mime: 'text/markdown', size: 10 },
    ]);
    expect(summary.valid).toBe(false);
    expect(summary.errors.join(' ')).toContain('SKILL.md');
  });

  it('counts package files', () => {
    const summary = summarizePackage([
      { path: 'SKILL.md', kind: 'skill', mime: 'text/markdown', size: 10 },
      { path: 'scripts/a.mjs', kind: 'script', mime: 'text/javascript', size: 10 },
    ]);
    expect(summary.valid).toBe(true);
    expect(summary.scripts).toEqual(['scripts/a.mjs']);
  });
});

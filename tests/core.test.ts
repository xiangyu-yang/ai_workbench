import { describe, expect, it } from 'vitest';
import { nextCronTime, parseCron, validateCron } from '@/server/tasks/cron';
import { chunkText } from '@/server/rag/chunk';
import { evaluateExpression } from '@/server/agent/calculator';
import { validateArgs, truncate } from '@/server/agent/validate';
import { isPrivateIp } from '@/server/security/ssrf';
import { cosine, localEmbed } from '@/server/llm/embedding';
import { resolveInWorkspace } from '@/server/security/workspace';
import { can, ROLE_RANK } from '@/server/auth/rbac';
import { hashPassword, validatePassword, verifyPassword } from '@/server/auth/password';
import { encryptSecret, decryptSecret, maskSecret, sha256 } from '@/server/security/crypto';

describe('cron', () => {
  it('parses standard expressions', () => {
    const spec = parseCron('*/15 9-18 * * 1-5');
    expect(spec).not.toBeNull();
    expect([...spec!.minute.values]).toEqual([0, 15, 30, 45]);
    expect([...spec!.hour.values]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('rejects invalid expressions', () => {
    expect(validateCron('* * * *')).toContain('5 段');
    expect(validateCron('61 * * * *')).not.toBeNull();
  });

  it('computes next weekday run in UTC', () => {
    const from = new Date('2026-11-13T10:00:00Z'); // Friday
    const next = nextCronTime('0 9 * * 1-5', from, 0);
    expect(next?.toISOString()).toBe('2026-11-16T09:00:00.000Z'); // Monday
  });

  it('respects timezone offset', () => {
    const from = new Date('2026-11-12T00:30:00Z');
    const next = nextCronTime('0 9 * * *', from, 480); // UTC+8
    expect(next?.toISOString()).toBe('2026-11-12T01:00:00.000Z');
  });
});

describe('chunking', () => {
  it('keeps short text intact', () => {
    expect(chunkText('hello 世界')).toEqual(['hello 世界']);
  });

  it('splits long text and preserves all content', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `第 ${i} 段：这是一段用于验证分块逻辑的测试文本。`);
    const chunks = chunkText(paragraphs.join('\n\n'), { size: 300, overlap: 40 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].length).toBeLessThanOrEqual(420);
    expect(chunks.join('')).toContain('第 29 段');
  });
});

describe('calculator', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(evaluateExpression('1 + 2 * 3')).toBe(7);
    expect(evaluateExpression('(128*3+56)/4')).toBe(110);
    expect(evaluateExpression('sqrt(144) + 2^3')).toBe(20);
  });

  it('blocks code injection', () => {
    expect(() => evaluateExpression('process.exit()')).toThrow();
    expect(() => evaluateExpression('1/0')).toThrow();
  });
});

describe('tool schema validation', () => {
  const schema = {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 5 },
      limit: { type: 'integer' },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
    required: ['query'],
  };

  it('accepts valid args', () => {
    expect(validateArgs(schema, { query: 'hi', limit: 3 }).ok).toBe(true);
  });

  it('reports missing and invalid fields', () => {
    const result = validateArgs(schema, { limit: 1.5, mode: 'c' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain('query');
      expect(result.errors.join()).toContain('limit');
      expect(result.errors.join()).toContain('mode');
    }
  });

  it('truncates oversized output', () => {
    expect(truncate('a'.repeat(100), 10)).toContain('已截断');
  });
});

describe('ssrf guard', () => {
  it('detects private ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.20.1.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });
});

describe('workspace sandbox', () => {
  it('blocks path traversal', () => {
    expect(() => resolveInWorkspace('org_1', 'thr_1', '../../etc/passwd')).toThrow();
    expect(() => resolveInWorkspace('org_1', 'thr_1', '/etc/passwd')).toThrow();
    expect(resolveInWorkspace('org_1', 'thr_1', 'docs/a.md')).toContain('docs/a.md');
  });
});

describe('rbac', () => {
  it('orders roles', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(can('admin', 'member')).toBe(true);
    expect(can('viewer', 'member')).toBe(false);
  });
});

describe('embeddings', () => {
  it('produces normalized deterministic vectors', () => {
    const a = localEmbed('企业 AI 工作台');
    const b = localEmbed('企业 AI 工作台');
    const c = localEmbed('差旅报销制度');
    expect(a).toEqual(b);
    expect(a.length).toBe(512);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
    expect(cosine(a, c)).toBeLessThan(0.9);
  });
});

describe('crypto', () => {
  it('encrypts and decrypts secrets', () => {
    const encrypted = encryptSecret('sk-test-123456');
    expect(encrypted).not.toContain('sk-test');
    expect(decryptSecret(encrypted)).toBe('sk-test-123456');
    expect(maskSecret('sk-test-123456')).toContain('3456');
    expect(sha256('a')).toHaveLength(64);
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('Cuter2026');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Cuter2026', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(validatePassword('abc')).not.toBeNull();
    expect(validatePassword('Cuter2026')).toBeNull();
  });
});

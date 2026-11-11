import type { Skill, SkillManifest } from '@/server/db/schema';
import { fetchText } from '@/server/security/ssrf';
import { truncate } from '@/server/agent/validate';
import type { RuntimeTool } from './types';

function interpolate(template: string, args: Record<string, unknown>, mode: 'url' | 'raw' | 'json'): string {
  const withEnv = template.replace(/\{\{\s*env\.([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
    process.env[key] || '',
  );
  return withEnv.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = args[key];
    if (value === undefined || value === null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (mode === 'url') return encodeURIComponent(str);
    if (mode === 'json') return JSON.stringify(str).slice(1, -1);
    return str;
  });
}

/** 将 HTTP 工具技能编译为可调用工具 */
export function buildSkillTools(skill: Skill, manifest: SkillManifest, index: number): RuntimeTool[] {
  return (manifest.tools || []).slice(0, 12).map((def, toolIndex) => {
    const name = `skill_${index}_${toolIndex}_${def.name}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 60);
    return {
      name,
      title: `技能 · ${def.name}`,
      description: `[${skill.name}] ${def.description}`,
      dangerous: true,
      parameters: def.parameters || { type: 'object', properties: {} },
      async execute(args) {
        const url = interpolate(def.request.url, args, 'url');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        for (const [key, value] of Object.entries(def.request.headers || {})) {
          headers[key] = interpolate(value, args, 'raw');
        }
        const method = def.request.method || 'GET';
        const body =
          def.request.body && method !== 'GET'
            ? interpolate(def.request.body, args, 'json')
            : undefined;
        const result = await fetchText(
          url,
          { method, headers, ...(body ? { body } : {}) },
          { maxBytes: 120_000, timeoutMs: def.timeoutMs || 20_000 },
        );
        const text = result.contentType.includes('json')
          ? result.text
          : result.text;
        return {
          content: truncate(`HTTP ${result.status}\n${text}`, 12_000),
          summary: `${skill.name} · HTTP ${result.status}`,
        };
      },
    };
  });
}

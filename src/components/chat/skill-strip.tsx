import Link from 'next/link';
import { Check, Wand2 } from 'lucide-react';
import type { ChatPart } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

type SkillPart = Extract<ChatPart, { type: 'skill' }>;

export function SkillStrip({ parts, used }: { parts: SkillPart[]; used?: Set<string> }) {
  if (!parts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10.5px] text-faint">
        <Wand2 size={12} className="text-accent-2" />
        加载技能
      </span>
      {parts.map((part) => {
        const isUsed = used?.has(part.id) || used?.has(part.name);
        const meta = [
          `${part.name} v${part.version}`,
          part.selection === 'manual' ? '手动选择' : '跟随专家',
          '已加载到专家上下文；调用技能文件/脚本后标记为已使用',
          part.fileCount ? `${part.fileCount} 个文件` : '',
          part.scriptCount ? `${part.scriptCount} 个脚本` : '',
          part.description || '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Link
            key={part.id}
            href={`/skills/${part.id}`}
            title={meta}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition',
              isUsed
                ? 'border-accent/30 bg-accent/[0.08] text-muted hover:border-accent/50'
                : 'border-line bg-surface-2/70 text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {isUsed ? (
              <Check size={10} className="shrink-0 text-success" />
            ) : (
              <Wand2 size={10} className="shrink-0 text-faint" />
            )}
            <span className="max-w-[180px] truncate font-medium text-ink">{part.name}</span>
            <span className="shrink-0 font-mono text-[9px] text-faint">v{part.version}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px]',
                isUsed
                  ? 'bg-success/10 text-success'
                  : part.selection === 'manual'
                    ? 'bg-accent/10 text-accent-2'
                    : 'bg-surface-3 text-faint',
              )}
            >
              {isUsed ? '已使用' : '已加载'}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

'use client';

import * as React from 'react';
import {
  Download,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Loader2,
  PanelRightClose,
  Table2,
  X,
} from 'lucide-react';
import type { ArtifactInfo } from '@/lib/chat-types';
import { bytes, cn } from '@/lib/utils';
import { CopyButton, Spinner } from '@/components/ui';
import { Markdown } from './markdown';

function kindIcon(kind: string) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'data') return Table2;
  if (kind === 'code') return FileCode2;
  return FileText;
}

export function ArtifactPanel({
  artifact,
  artifacts,
  onSelect,
  onClose,
}: {
  artifact: ArtifactInfo;
  artifacts: ArtifactInfo[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const cache = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    let cancelled = false;
    const cached = cache.current.get(artifact.id);
    if (cached !== undefined) {
      setContent(cached);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/artifacts/${artifact.id}`)
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || '加载失败');
        }
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        cache.current.set(artifact.id, text);
        setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.id]);

  const Icon = kindIcon(artifact.kind);
  const isImage = artifact.mime.startsWith('image/');
  const isHtml = artifact.mime === 'text/html';
  const isPdf = artifact.mime === 'application/pdf';
  const isMarkdown = artifact.mime === 'text/markdown' || artifact.name.endsWith('.md');
  const isCsv = artifact.mime.includes('csv') || artifact.name.endsWith('.csv');
  const isJson = artifact.mime.includes('json') || artifact.name.endsWith('.json');

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-line bg-surface">
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent-2">
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-ink">{artifact.name}</p>
          <p className="text-[10px] text-faint">
            {bytes(artifact.size)} · {artifact.mime || '未知类型'}
          </p>
        </div>
        <a
          href={`/api/artifacts/${artifact.id}?download=1`}
          className="rounded-md p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink"
          title="下载"
        >
          <Download size={14} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink lg:hidden"
          title="关闭"
        >
          <X size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="hidden rounded-md p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink lg:block"
          title="收起面板"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-faint">
            <Loader2 size={14} className="animate-spin" /> 加载交付物…
          </div>
        ) : error ? (
          <div className="p-5 text-[12px] text-danger">{error}</div>
        ) : isImage ? (
          <div className="flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/artifacts/${artifact.id}`}
              alt={artifact.name}
              className="max-w-full rounded-lg border border-line"
            />
          </div>
        ) : isPdf ? (
          <iframe
            title={artifact.name}
            src={`/api/artifacts/${artifact.id}`}
            className="h-full min-h-[520px] w-full"
          />
        ) : isHtml ? (
          <iframe
            title={artifact.name}
            sandbox=""
            srcDoc={content}
            className="h-full min-h-[520px] w-full bg-white"
          />
        ) : isCsv ? (
          <CsvPreview content={content} />
        ) : isMarkdown ? (
          <div className="p-5">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap p-5 font-mono text-[11.5px] leading-relaxed text-muted">
            {content}
          </pre>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-2">
        <CopyButton value={content} />
        <span className="text-[10px] uppercase tracking-wider text-faint">
          {isJson ? 'JSON' : artifact.kind}
        </span>
      </div>

      {artifacts.length > 1 ? (
        <div className="shrink-0 border-t border-line px-3 py-2">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wider text-faint">
            全部交付物 · {artifacts.length}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {artifacts.map((item) => {
              const ItemIcon = kindIcon(item.kind);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] transition',
                    item.id === artifact.id
                      ? 'border-accent/30 bg-accent/10 text-accent-2'
                      : 'border-line bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  <ItemIcon size={11} />
                  <span className="max-w-[120px] truncate">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CsvPreview({ content }: { content: string }) {
  const rows = React.useMemo(() => {
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.slice(0, 300).map((line) => {
      const cells: string[] = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (quoted && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (char === ',' && !quoted) {
          cells.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      cells.push(current);
      return cells;
    });
  }, [content]);

  if (!rows.length) return <div className="p-5 text-[12px] text-faint">空表格</div>;
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div className="p-4">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {header.map((cell, index) => (
                <th
                  key={index}
                  className="whitespace-nowrap border-b border-line bg-surface-3 px-2.5 py-1.5 text-left font-medium text-ink"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-line/60 last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2.5 py-1.5 text-muted">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 300 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-faint">
          <Spinner size={10} /> 仅预览前 300 行，请下载查看完整内容
        </p>
      ) : null}
    </div>
  );
}

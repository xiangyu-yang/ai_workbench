'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const child = React.isValidElement(children) ? children : null;
  const className = child
    ? ((child.props as { className?: string }).className || '')
    : '';
  const language = className.match(/language-([\w-]+)/)?.[1] || 'text';
  const code = textOf(children).replace(/\n$/, '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-white/10 bg-[#090b10]">
      <div className="flex h-8 items-center justify-between border-b border-white/10 bg-white/[0.04] px-3">
        <span className="font-mono text-[10.5px] lowercase text-white/45">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="!m-0 !border-0 !bg-transparent">{children}</pre>
    </div>
  );
}

export function Markdown({
  children,
  className,
  streaming,
}: {
  children: string;
  className?: string;
  streaming?: boolean;
}) {
  return (
    <div className={cn('prose-cuter', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {linkChildren}
            </a>
          ),
          table: ({ children: tableChildren }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-line">
              <table className="!my-0">{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
      {streaming ? <span className="caret" /> : null}
    </div>
  );
}

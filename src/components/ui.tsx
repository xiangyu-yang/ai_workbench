'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, Check, Copy, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ───────────────────────── Button ───────────────────────── */

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary:
          'bg-[linear-gradient(100deg,#9184ff,#7c6cff_45%,#22d3ee)] text-[#06070c] shadow-[0_10px_30px_-14px_rgba(124,108,255,0.9)] hover:brightness-[1.06]',
        secondary:
          'border border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3',
        ghost: 'text-muted hover:bg-surface-3 hover:text-ink',
        outline:
          'border border-line bg-transparent text-ink hover:border-line-strong hover:bg-surface-2',
        danger:
          'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15 hover:border-danger/40',
        success:
          'border border-success/25 bg-success/10 text-success hover:bg-success/15',
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        md: 'h-9.5 px-3.5',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

const fieldBase =
  'w-full rounded-[10px] border border-line bg-surface-2 px-3 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-9.5', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'py-2.5 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldBase, 'h-9.5 appearance-none bg-surface-2 pr-8', className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label ? (
        <span className="flex items-center gap-1 text-[12px] font-medium text-muted">
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint ? <span className="block text-[11.5px] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5.5 w-10 shrink-0 rounded-full border transition-colors',
        checked ? 'border-accent/60 bg-accent/70' : 'border-line bg-surface-3',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[21px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ───────────────────────── Display ───────────────────────── */

export function Badge({
  children,
  variant = 'default',
  className,
  dot,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'outline' | 'cyan';
  className?: string;
  dot?: boolean;
}) {
  const styles: Record<string, string> = {
    default: 'border-line bg-surface-3 text-muted',
    accent: 'border-accent/25 bg-accent/10 text-accent-2',
    cyan: 'border-cyan/25 bg-cyan/10 text-cyan',
    success: 'border-success/25 bg-success/10 text-success',
    warning: 'border-warning/25 bg-warning/10 text-warning',
    danger: 'border-danger/25 bg-danger/10 text-danger',
    outline: 'border-line bg-transparent text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5',
        styles[variant],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  hover,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={cn('panel', hover && 'panel-hover', className)}>{children}</div>;
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg bg-surface-2', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-8 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Progress({
  value,
  className,
  tone = 'accent',
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    accent: 'from-accent to-cyan',
    success: 'from-success to-cyan',
    warning: 'from-warning to-danger',
    danger: 'from-danger to-[#ff8f8f]',
  };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', colors[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted transition hover:bg-surface-3 hover:text-ink',
        className,
      )}
      title="复制"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = 'md',
}: {
  tabs: Array<{ id: T; label: React.ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2/60 p-1',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3.5 text-[12.5px]',
            value === tab.id
              ? 'bg-surface-3 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span
              className={cn(
                'rounded-full px-1.5 text-[10px] leading-4',
                value === tab.id ? 'bg-surface-3 text-ink' : 'bg-surface-3 text-faint',
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Modal / Drawer ───────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[6px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 w-full animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[4px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex h-full w-full animate-slide-in flex-col border-l border-line bg-surface shadow-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; description?: string; variant: ToastVariant };

type ToastContextValue = {
  toast: (message: string, options?: { variant?: ToastVariant; description?: string }) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue['toast']>(
    (message, options) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [
        ...prev.slice(-3),
        {
          id,
          message,
          description: options?.description,
          variant: options?.variant || 'info',
        },
      ]);
      setTimeout(() => remove(id), options?.variant === 'error' ? 6500 : 4200);
    },
    [remove],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {items.map((item) => {
          const Icon =
            item.variant === 'success'
              ? CheckCircle2
              : item.variant === 'error'
                ? AlertCircle
                : Info;
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl border bg-surface/95 px-3.5 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur',
                item.variant === 'success'
                  ? 'border-success/25'
                  : item.variant === 'error'
                    ? 'border-danger/25'
                    : 'border-line',
              )}
            >
              <Icon
                size={16}
                className={cn(
                  'mt-0.5 shrink-0',
                  item.variant === 'success'
                    ? 'text-success'
                    : item.variant === 'error'
                      ? 'text-danger'
                      : 'text-cyan',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium leading-5 text-ink">{item.message}</p>
                {item.description ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded p-0.5 text-faint transition hover:text-ink"
                aria-label="关闭提示"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}

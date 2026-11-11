'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'cuter-theme';

export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f5f9' : '#07080b');
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
    const handle = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
        document.documentElement.dataset.theme = event.newValue;
        setTheme(event.newValue);
      }
    };
    window.addEventListener('storage', handle);
    return () => window.removeEventListener('storage', handle);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-surface-3 hover:text-ink',
        className,
      )}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={theme === 'dark' ? '浅色模式' : '深色模式'}
    >
      {mounted && theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

import Link from 'next/link';
import { Logo } from '@/components/brand';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo size={46} />
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-faint">404</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">这里什么也没有</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
        页面可能已被删除，或者你不具备访问权限。回到工作台继续。
      </p>
      <Link
        href="/chat"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-[linear-gradient(100deg,#9184ff,#7c6cff_45%,#22d3ee)] px-4 text-[13px] font-medium text-[#06070c]"
      >
        返回对话
      </Link>
    </div>
  );
}

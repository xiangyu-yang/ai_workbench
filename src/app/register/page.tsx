import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, ShieldCheck, Users } from 'lucide-react';
import { getAuth } from '@/server/auth/session';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { RegisterForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: '创建账号' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const auth = await getAuth();
  if (auth) redirect('/chat');
  const params = await searchParams;
  const invite = params.invite || '';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 animate-aurora rounded-full bg-accent/15 blur-[130px]" />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-7 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-[15px] font-semibold tracking-tight text-ink">Cuter</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[11.5px] text-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            返回登录
          </Link>
        </div>

        <div className="panel p-6 shadow-[0_30px_100px_-40px_rgba(0,0,0,0.9)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            {invite ? 'Join organization' : 'Create workspace'}
          </p>
          <h1 className="mt-2 text-[23px] font-semibold tracking-[-0.02em] text-ink">
            {invite ? '加入组织' : '创建你的 AI 工作台'}
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {invite
              ? '你收到了组织邀请。完成注册后即可与团队共享专家、技能与知识库。'
              : '注册即创建独立组织空间，默认配备 4 位专家与 2 套方法论技能。'}
          </p>

          <RegisterForm inviteCode={invite} />

          {!invite ? (
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5">
              {[
                { icon: Building2, label: '组织隔离' },
                { icon: Users, label: '角色权限' },
                { icon: ShieldCheck, label: '全量审计' },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-1.5 text-center">
                  <item.icon size={14} className="text-faint" />
                  <span className="text-[10.5px] text-faint">{item.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-center text-[10.5px] leading-relaxed text-faint">
          继续即表示你同意组织的安全与合规策略。密码使用 scrypt 加盐哈希存储。
        </p>
      </div>
    </div>
  );
}

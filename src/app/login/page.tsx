import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Clock3, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { getAuth } from '@/server/auth/session';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: '登录' };

export default async function LoginPage() {
  const auth = await getAuth();
  if (auth) redirect('/chat');

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <ThemeToggle className="absolute right-5 top-5 z-20 border border-line bg-surface/70 backdrop-blur" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="relative hidden w-[54%] flex-col justify-between overflow-y-auto border-r border-line/60 p-12 scrollbar-thin lg:flex">
        <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] animate-aurora rounded-full bg-accent/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] animate-aurora rounded-full bg-cyan/10 blur-[110px] [animation-delay:4s]" />

        <Link href="/" className="relative flex items-center gap-3">
          <Logo size={38} />
          <div>
            <p className="text-[17px] font-semibold tracking-tight text-ink">Cuter</p>
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-faint">Enterprise AI Workbench</p>
          </div>
        </Link>

        <div className="relative max-w-xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.08] px-3 py-1 text-[11.5px] text-accent-2">
            <Sparkles size={12} />
            从对话到交付，一条闭环
          </p>
          <h1 className="text-[42px] font-semibold leading-[1.16] tracking-[-0.03em] text-ink">
            让 AI 真正
            <br />
            <span className="text-gradient">把工作做完</span>
          </h1>
          <p className="mt-5 text-[14px] leading-relaxed text-muted">
            下达目标，Cuter 自主规划与执行：检索组织知识、调用企业系统、在审批与审计之下产出文档、表格与分析结论。
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {[
              { icon: Sparkles, title: '专家与技能', desc: '把方法论沉淀为可复用资产' },
              { icon: Plug, title: 'MCP 连接器', desc: '安全接入企业系统与数据' },
              { icon: Clock3, title: '异步任务', desc: '计划可视化，进度可追踪' },
              { icon: ShieldCheck, title: '企业治理', desc: '逐动作审批与全量审计' },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-line/80 bg-surface-2 p-3.5 backdrop-blur-sm"
              >
                <item.icon size={16} className="text-accent-2" />
                <p className="mt-2.5 text-[12.5px] font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-6 text-[11px] text-faint">
          <span>多模型网关</span>
          <span className="h-3 w-px bg-line" />
          <span>PostgreSQL / PGlite</span>
          <span className="h-3 w-px bg-line" />
          <span>SSE 流式运行时</span>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={34} />
            <div>
              <p className="text-[16px] font-semibold text-ink">Cuter</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-faint">AI Workbench</p>
            </div>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">Welcome back</p>
          <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink">登录工作台</h2>
          <p className="mt-2 text-[12.5px] text-muted">
            使用组织账号继续。还没有账号？
            <Link href="/register" className="ml-1 text-accent-2 hover:underline">
              创建组织
            </Link>
          </p>
          <LoginForm />
          <div className="mt-8 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11.5px] leading-relaxed text-faint">
            <p className="font-medium text-muted">本地演示账号</p>
            <p className="mt-1 font-mono text-[11px]">admin@cuter.ai · Cuter2026</p>
            <p className="mt-1">运行 <code className="text-accent-2">npm run setup</code> 后生成；生产请删除或修改该账号。</p>
          </div>
          <p className="mt-6 flex items-center justify-between text-[10.5px] text-faint">
            <span>© 2026 Cuter Workbench</span>
            <Link href="/api/health" className="inline-flex items-center gap-1 hover:text-muted">
              系统状态 <ArrowRight size={10} />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

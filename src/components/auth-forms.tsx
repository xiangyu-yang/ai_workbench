'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail, User, Building2, Ticket } from 'lucide-react';
import { Button, ErrorBox, Field, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '登录失败');
      router.push('/chat');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <Field label="邮箱">
        <div className="relative">
          <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 pl-9"
          />
        </div>
      </Field>
      <Field label="密码">
        <div className="relative">
          <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            type={show ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition hover:text-ink"
            aria-label={show ? '隐藏密码' : '显示密码'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        进入工作台
        {!loading ? <ArrowRight size={15} /> : null}
      </Button>
      <p className="text-center text-[11px] text-faint">
        登录即表示同意组织的安全策略与数据处理规范
      </p>
    </form>
  );
}

export function RegisterForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    orgName: '',
    inviteCode,
  });
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          orgName: form.orgName || undefined,
          inviteCode: form.inviteCode || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '注册失败');
      router.push('/chat');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3.5">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="姓名">
          <div className="relative">
            <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              required
              placeholder="你的名字"
              value={form.name}
              onChange={update('name')}
              className="h-10 pl-9"
            />
          </div>
        </Field>
        <Field label="组织名称">
          <div className="relative">
            <Building2
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              placeholder="可选"
              value={form.orgName}
              onChange={update('orgName')}
              disabled={Boolean(inviteCode)}
              className="h-10 pl-9"
            />
          </div>
        </Field>
      </div>
      <Field label="邮箱">
        <div className="relative">
          <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={update('email')}
            className="h-10 pl-9"
          />
        </div>
      </Field>
      <Field label="密码" hint="至少 8 位，需同时包含字母与数字">
        <div className="relative">
          <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="设置登录密码"
            value={form.password}
            onChange={update('password')}
            className="h-10 pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition hover:text-ink"
            aria-label={show ? '隐藏密码' : '显示密码'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </Field>
      {form.inviteCode ? (
        <Field label="邀请码">
          <div className="relative">
            <Ticket size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={form.inviteCode}
              onChange={update('inviteCode')}
              className="h-10 pl-9 font-mono text-[12px]"
            />
          </div>
        </Field>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={loading}>
        {inviteCode ? '加入组织' : '创建工作台'}
        {!loading ? <ArrowRight size={15} /> : null}
      </Button>
      <p className="pt-1 text-center text-[11px] text-faint">
        已有账号？
        <Link href="/login" className="ml-1 text-accent-2 hover:underline">
          直接登录
        </Link>
      </p>
    </form>
  );
}

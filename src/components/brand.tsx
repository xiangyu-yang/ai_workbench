import {
  BarChart3,
  Bot,
  Boxes,
  Brain,
  Briefcase,
  LayoutGrid,
  Link2,
  Code2,
  Database,
  FileText,
  FlaskConical,
  Globe2,
  PenLine,
  Search,
  Sparkles,
  Telescope,
  Wand2,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="cuter-g1" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A99FFF" />
          <stop offset="0.55" stopColor="#7C6CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id="cuter-g2" x1="10" y1="8" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A0B10" />
          <stop offset="1" stopColor="#141726" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#cuter-g1)" />
      <path
        d="M20 7.5L23.9 16.1L32.5 20L23.9 23.9L20 32.5L16.1 23.9L7.5 20L16.1 16.1L20 7.5Z"
        fill="url(#cuter-g2)"
      />
      <circle cx="20" cy="20" r="3.1" fill="#22D3EE" />
    </svg>
  );
}

const ICON_MAP: Record<string, LucideIcon> = {
  spark: Sparkles,
  telescope: Telescope,
  'file-text': FileText,
  chart: BarChart3,
  wand: Wand2,
  code: Code2,
  search: Search,
  globe: Globe2,
  brain: Brain,
  database: Database,
  pen: PenLine,
  flask: FlaskConical,
  workflow: Workflow,
  'layout-grid': LayoutGrid,
  bot: Bot,
  briefcase: Briefcase,
  link: Link2,
  boxes: Boxes,
};

export function expertIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Sparkles;
}

export function ExpertAvatar({
  icon,
  accent,
  size = 40,
  className,
}: {
  icon: string;
  accent: string;
  size?: number;
  className?: string;
}) {
  const Icon = expertIcon(icon);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border border-line',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, ${accent}33, ${accent}0d 60%, rgba(255,255,255,0.02))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px -14px ${accent}aa`,
        color: accent,
      }}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.7} />
    </span>
  );
}

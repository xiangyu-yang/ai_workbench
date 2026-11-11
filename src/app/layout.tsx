import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast';

export const metadata: Metadata = {
  title: {
    default: 'Cuter · 企业 AI 工作台',
    template: '%s · Cuter',
  },
  description:
    '用自然语言下达目标，Cuter 自主规划、调用企业能力、在受控环境中执行，并交付可验收的成果。',
  applicationName: 'Cuter',
};

export const viewport: Viewport = {
  themeColor: '#07080b',
  width: 'device-width',
  initialScale: 1,
};

const themeScript = `(function(){try{var t=localStorage.getItem('cuter-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f4f5f9':'#07080b');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

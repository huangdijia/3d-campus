import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/app/ui/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: '山河学府 · 3D 中国高校地图',
  description: '从中国地图走进高校，在三维校园中探索建筑、道路与校园文化。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: '山河学府', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#f5f7fb' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '山河学府 · 3D 中国高校地图', icons: {icon:'/favicon.svg'}, description: '从中国地图走进高校，在三维校园中探索建筑、道路与校园文化。' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }

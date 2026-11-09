import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'长文翻译助手 · Long-form Translator', description:'无限字数、流式翻译与断点续译' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body>{children}</body></html>; }

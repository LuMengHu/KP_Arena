import type { Metadata, Viewport } from 'next';
import { AppProvider } from '@/components/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '紅棉賽場 KP Arena',
  description: '賽程、名單、即時成績',
  manifest: '/manifest.webmanifest',
  // Student names are public on paper at the venue, but keep them out of search engines.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: '紅棉賽場', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#b3261e' },
    { media: '(prefers-color-scheme: dark)', color: '#2a1513' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}

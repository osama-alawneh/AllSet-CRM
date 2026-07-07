import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { SWRegister } from '@/components/shell/SWRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClearView CRM',
  description: 'Window-cleaning CRM — Blueprint+',
  appleWebApp: { statusBarStyle: 'black-translucent', title: 'ClearView' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#070d18',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang="en" data-theme={theme}>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}

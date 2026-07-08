import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { SWRegister } from '@/components/shell/SWRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'AllSet CRM',
  description: 'Window-cleaning CRM — Blueprint+',
  appleWebApp: { statusBarStyle: 'black-translucent', title: 'AllSet' },
  icons: { apple: '/apple-touch-icon.png' },
  // Next 16 emits only the modern `mobile-web-app-capable` tag; iOS < 17.4 honors
  // only the legacy tag below, without which home-screen launches open in a Safari tab.
  other: { 'apple-mobile-web-app-capable': 'yes' },
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

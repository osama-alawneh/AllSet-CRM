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

// Both the <meta name="theme-color"> and the html[data-theme] attribute must agree with
// the same cookie, or the browser chrome (status bar / task switcher) flashes the wrong
// color relative to the page. generateViewport (not the static `viewport` object) is
// required here because the color depends on request data (the theme cookie).
async function currentTheme(): Promise<'light' | 'dark'> {
  return (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    viewportFit: 'cover',
    themeColor: theme === 'light' ? '#dfe8f6' : '#0b1220', // matches --paper per theme (globals.css)
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme();
  return (
    <html lang="en" data-theme={theme}>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}

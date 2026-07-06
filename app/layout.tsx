import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SWRegister } from '@/components/shell/SWRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClearView CRM',
  description: 'Window-cleaning CRM — Blueprint+',
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

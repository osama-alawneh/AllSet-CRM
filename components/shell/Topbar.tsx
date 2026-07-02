'use client';
import { usePathname } from 'next/navigation';
import { titleFor } from '@/lib/nav';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({ search }: { search?: React.ReactNode }) {
  const pathname = usePathname();
  const [title, ref] = titleFor(pathname);
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        <div className="ref">{ref.toUpperCase()}</div>
      </div>
      <div className="ctrls">
        {search}
        <ThemeToggle />
      </div>
    </div>
  );
}

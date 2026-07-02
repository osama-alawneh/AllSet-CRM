'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, num, label }: { href: string; num: string; label: string }) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} className={on ? 'on' : ''}>
      <span className="n">{num}</span> {label}
    </Link>
  );
}

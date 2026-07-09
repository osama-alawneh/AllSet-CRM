'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({
  href, num, label, badge,
}: {
  href: string; num: string; label: string; badge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
      <span className="n">{num}</span> {label}
      {badge}
    </Link>
  );
}

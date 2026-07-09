import type { Role } from '@/lib/auth';

export type NavItem = { href: string; label: string; num: string; roles: Role[] };

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', num: '01', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/map',       label: 'Map',       num: '02', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/leads',     label: 'Leads',     num: '03', roles: ['admin', 'rep'] },
  { href: '/jobs',      label: 'Jobs',      num: '04', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/invoices',  label: 'Invoices',  num: '05', roles: ['admin'] },
  { href: '/customers', label: 'Customers', num: '06', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/cleaners',  label: 'Cleaners',  num: '07', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/expenses',  label: 'Expenses',  num: '08', roles: ['admin', 'rep'] },
  { href: '/settings',  label: 'Settings',  num: '09', roles: ['admin'] },
];

export const navForRole = (role: Role): NavItem[] =>
  NAV_ITEMS.filter(i => i.roles.includes(role));

const TITLES: Record<string, [string, string]> = {
  '/dashboard': ['Dashboard / Daily Ops', 'role-aware overview'],
  '/map':       ['Map / Pin Board', 'click empty space to drop a pin'],
  '/leads':     ['Leads / Pipeline', 'drag to change status'],
  '/jobs':      ['Jobs / Board', 'claim to lock · drag status'],
  '/invoices':  ['Invoices / Billing', 'create · print PDF · export'],
  '/customers': ['Customers / Accounts', 'click a row to open profile'],
  '/cleaners':  ['Cleaners / Leaderboard', 'jobs done + earnings — no revenue here'],
  '/expenses':  ['Expenses / Money Out', 'auto payouts + manual entries'],
  '/settings':  ['Settings / Users', 'admin only'],
};

export function titleFor(pathname: string): [string, string] {
  const hit = Object.keys(TITLES).find(k => pathname === k || pathname.startsWith(k + '/'));
  return TITLES[hit ?? '/dashboard'];
}

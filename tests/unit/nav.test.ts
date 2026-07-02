import { describe, it, expect } from 'vitest';
import { navForRole, titleFor, NAV_ITEMS } from '@/lib/nav';

describe('navForRole', () => {
  it('admin sees all 7 items', () => {
    expect(navForRole('admin').map(i => i.href)).toEqual([
      '/dashboard', '/map', '/leads', '/jobs', '/invoices', '/customers', '/settings',
    ]);
  });
  it('rep sees no invoices/settings', () => {
    const hrefs = navForRole('rep').map(i => i.href);
    expect(hrefs).toContain('/leads');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });
  it('cleaner sees no leads/invoices/settings', () => {
    const hrefs = navForRole('cleaner').map(i => i.href);
    expect(hrefs).toEqual(['/dashboard', '/map', '/jobs', '/customers']);
  });
  it('every item has a 2-digit num', () => {
    for (const i of NAV_ITEMS) expect(i.num).toMatch(/^\d{2}$/);
  });
});

describe('titleFor', () => {
  it('maps known routes', () => {
    expect(titleFor('/customers')[0]).toBe('Customers / Accounts');
    expect(titleFor('/dashboard')[0]).toBe('Dashboard / Daily Ops');
  });
  it('matches sub-paths and falls back to dashboard', () => {
    expect(titleFor('/customers?c=3'.split('?')[0])[0]).toBe('Customers / Accounts');
    expect(titleFor('/unknown')[0]).toBe('Dashboard / Daily Ops');
  });
});

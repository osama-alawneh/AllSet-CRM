import { describe, it, expect } from 'vitest';
import { navForRole, titleFor, NAV_ITEMS } from '@/lib/nav';

describe('navForRole', () => {
  it('admin sees all 10 items', () => {
    expect(navForRole('admin').map(i => i.href)).toEqual([
      '/dashboard', '/map', '/leads', '/jobs', '/calendar', '/invoices', '/customers', '/cleaners', '/expenses', '/settings',
    ]);
  });
  it('rep sees the calendar', () => {
    expect(navForRole('rep').map(i => i.href)).toContain('/calendar');
  });
  it('rep sees expenses but no invoices/settings', () => {
    const hrefs = navForRole('rep').map(i => i.href);
    expect(hrefs).toContain('/leads');
    expect(hrefs).toContain('/expenses');
    expect(hrefs).toContain('/cleaners');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });
  it('cleaner sees no leads/invoices/settings', () => {
    const hrefs = navForRole('cleaner').map(i => i.href);
    expect(hrefs).toEqual(['/dashboard', '/map', '/jobs', '/calendar', '/customers', '/cleaners']);
  });
  it('every item has a 2-digit num', () => {
    for (const i of NAV_ITEMS) expect(i.num).toMatch(/^\d{2}$/);
  });
});

describe('titleFor', () => {
  it('maps known routes', () => {
    expect(titleFor('/customers')[0]).toBe('Customers / Accounts');
    expect(titleFor('/dashboard')[0]).toBe('Dashboard / Daily Ops');
    expect(titleFor('/cleaners')[0]).toBe('Cleaners / Leaderboard');
    expect(titleFor('/calendar')[0]).toBe('Calendar / Schedule');
  });
  it('matches sub-paths and falls back to dashboard', () => {
    expect(titleFor('/customers?c=3'.split('?')[0])[0]).toBe('Customers / Accounts');
    expect(titleFor('/unknown')[0]).toBe('Dashboard / Daily Ops');
  });
});

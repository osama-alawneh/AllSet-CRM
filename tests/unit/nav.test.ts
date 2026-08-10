import { describe, it, expect } from 'vitest';
import { navForRole, titleFor, NAV_ITEMS } from '@/lib/nav';

describe('navForRole', () => {
  it('admin sees all 9 items', () => {
    expect(navForRole('admin').map(i => i.href)).toEqual([
      '/dashboard', '/map', '/leads', '/jobs', '/invoices', '/customers', '/cleaners', '/expenses', '/settings',
    ]);
  });
  it('no role sees a standalone calendar — it lives inside /leads and /jobs', () => {
    for (const role of ['admin', 'rep', 'cleaner'] as const) {
      expect(navForRole(role).map(i => i.href)).not.toContain('/calendar');
    }
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
    expect(hrefs).toEqual(['/dashboard', '/map', '/jobs', '/customers', '/cleaners']);
  });
  it('numbers run 01..09 with no gaps', () => {
    expect(NAV_ITEMS.map(i => i.num)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
  });
});

describe('titleFor', () => {
  it('maps known routes', () => {
    expect(titleFor('/customers')[0]).toBe('Customers / Accounts');
    expect(titleFor('/dashboard')[0]).toBe('Dashboard / Daily Ops');
    expect(titleFor('/cleaners')[0]).toBe('Cleaners / Leaderboard');
  });
  it('falls back to dashboard for the retired calendar route', () => {
    expect(titleFor('/calendar')[0]).toBe('Dashboard / Daily Ops');
  });
  it('matches sub-paths and falls back to dashboard', () => {
    expect(titleFor('/customers?c=3'.split('?')[0])[0]).toBe('Customers / Accounts');
    expect(titleFor('/unknown')[0]).toBe('Dashboard / Daily Ops');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [
    { kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' },
    { kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' },
    { kind: 'job', id: 6, label: 'Cust 6', color: 'var(--prog)' },
    { kind: 'job', id: 7, label: 'Cust 7', color: 'var(--prog)' },
    { kind: 'job', id: 8, label: 'Cust 8', color: 'var(--prog)' },
  ],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
const render = () => act(() => root.render(<CalendarGrid month="2026-07" entries={entries} showLeads />));

describe('CalendarGrid', () => {
  it('renders the month header with prev/today/next links carrying ?m=', () => {
    render();
    expect(container.textContent).toContain('July 2026');
    const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/calendar?m=2026-06');
    expect(hrefs).toContain('/calendar?m=2026-08');
    expect(hrefs.some(h => h === '/calendar')).toBe(true); // Today
  });
  it('renders 31 day cells for July plus leading blanks', () => {
    render();
    expect(container.querySelectorAll('.calday')).toHaveLength(31);
    expect(container.querySelectorAll('.calblank')).toHaveLength(3); // 2026-07-01 is a Wednesday
  });
  it('shows up to 3 chips per day plus a +n more overflow', () => {
    render();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    expect(day.querySelectorAll('.calchip')).toHaveLength(3);
    expect(day.textContent).toContain('+2 more');
  });
  it('entry links open the drawer keeping the month param', () => {
    render();
    const hrefs = [...container.querySelectorAll('a.calchip')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/calendar?m=2026-07&j=5');
    expect(hrefs).toContain('/calendar?m=2026-07&l=9');
  });
  it('day click opens the day panel listing ALL entries', () => {
    render();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    act(() => { (day as HTMLElement).click(); });
    const panel = container.querySelector('.caldaypanel')!;
    expect(panel.querySelectorAll('a')).toHaveLength(5);
    expect(panel.textContent).toContain('Cust 8');
  });
});

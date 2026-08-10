// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

const jobEntries: Record<string, CalEntry[]> = {
  '2026-07-14': [
    { kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' },
    { kind: 'job', id: 6, label: 'Cust 6', color: 'var(--prog)' },
    { kind: 'job', id: 7, label: 'Cust 7', color: 'var(--prog)' },
    { kind: 'job', id: 8, label: 'Cust 8', color: 'var(--prog)' },
    { kind: 'job', id: 9, label: 'Cust 9', color: 'var(--prog)' },
  ],
};
const leadEntries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const renderJobs = () => act(() => root.render(<CalendarGrid month="2026-07" entries={jobEntries} kind="job" />));
const renderLeads = () => act(() => root.render(<CalendarGrid month="2026-07" entries={leadEntries} kind="lead" />));
const hrefs = () => [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));

describe('CalendarGrid', () => {
  it('renders the month header with prev/today/next links on the jobs host', () => {
    renderJobs();
    expect(container.textContent).toContain('July 2026');
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-06');
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-08');
    expect(hrefs()).toContain('/jobs?view=calendar'); // Today
  });

  it('renders month nav on the leads host', () => {
    renderLeads();
    expect(hrefs()).toContain('/leads?view=calendar&m=2026-06');
    expect(hrefs()).toContain('/leads?view=calendar');
  });

  it('renders 31 day cells for July plus leading blanks', () => {
    renderJobs();
    expect(container.querySelectorAll('.calday')).toHaveLength(31);
    expect(container.querySelectorAll('.calblank')).toHaveLength(3); // 2026-07-01 is a Wednesday
  });

  it('shows up to 3 chips per day plus a +n more overflow', () => {
    renderJobs();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    expect(day.querySelectorAll('.calchip')).toHaveLength(3);
    expect(day.textContent).toContain('+2 more');
  });

  it('job chips deep-link with ?j= and keep view+month', () => {
    renderJobs();
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-07&j=5');
  });

  it('lead chips deep-link with ?l= and keep view+month', () => {
    renderLeads();
    expect(hrefs()).toContain('/leads?view=calendar&m=2026-07&l=9');
  });

  it('hints at the date basis per host', () => {
    renderJobs();
    expect(container.querySelector('.hint')!.textContent).toContain('jobs by schedule');
    act(() => root.unmount());
    root = createRoot(container);
    renderLeads();
    expect(container.querySelector('.hint')!.textContent).toContain('leads by created');
  });

  it('day click opens the day panel listing ALL entries', () => {
    renderJobs();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    act(() => { (day as HTMLElement).click(); });
    const panel = container.querySelector('.caldaypanel')!;
    expect(panel.querySelectorAll('a')).toHaveLength(5);
    expect(panel.textContent).toContain('Cust 9');
  });
});

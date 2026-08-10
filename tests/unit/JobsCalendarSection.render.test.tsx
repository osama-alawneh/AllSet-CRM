// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const realtime = vi.fn();
vi.mock('@/lib/hooks/useJobsRealtime', () => ({ useJobsRealtime: () => realtime() }));
import { JobsCalendarSection } from '@/components/jobs/JobsCalendarSection';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const render = (admin: boolean, money: boolean) => act(() => root.render(
  <JobsCalendarSection jobs={[]} month="2026-07" entries={entries} admin={admin} money={money} />
));
const byText = (t: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(t));

describe('JobsCalendarSection', () => {
  it('renders the grid with the shared header actions', () => {
    render(true, true);
    expect(byText('Calendar')!.getAttribute('aria-pressed')).toBe('true');
    expect(byText('Export CSV')).toBeTruthy();
    expect(byText('New job')).toBeTruthy();
    expect(container.querySelector('.calgrid')).toBeTruthy();
  });

  it('subscribes to the jobs realtime channel like the other job views', () => {
    render(true, true);
    expect(realtime).toHaveBeenCalled();
  });

  it('hides History and New job from cleaners', () => {
    render(false, false); // cleaner: not admin, no money
    expect(byText('History')).toBeUndefined();
    expect(byText('New job')).toBeUndefined();
    expect(container.querySelector('.calgrid')).toBeTruthy();
  });

  it('New job keeps the calendar view and month', () => {
    render(true, true);
    act(() => { byText('New job')!.click(); });
    expect(push).toHaveBeenCalledWith('/jobs?view=calendar&m=2026-07&new=1', { scroll: false });
  });
});

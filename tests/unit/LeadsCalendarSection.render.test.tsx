// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { LeadsCalendarSection } from '@/components/leads/LeadsCalendarSection';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const render = (admin: boolean, canEdit = true) => act(() => root.render(
  <LeadsCalendarSection leads={[]} month="2026-07" entries={entries} admin={admin} money={true} canEdit={canEdit} />
));
const byText = (t: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(t));

describe('LeadsCalendarSection', () => {
  it('renders the grid with the shared header actions', () => {
    render(true);
    expect(container.querySelector('.viewtoggle')).toBeTruthy();
    expect(byText('Calendar')!.getAttribute('aria-pressed')).toBe('true');
    expect(byText('Export CSV')).toBeTruthy();
    expect(byText('New lead')).toBeTruthy();
    expect(container.querySelector('.calgrid')).toBeTruthy();
    expect(container.textContent).toContain('July 2026');
  });

  it('shows History to admins only', () => {
    render(true);
    expect(byText('History')).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    render(false);
    expect(byText('History')).toBeUndefined();
  });

  it('New lead keeps the calendar view and month', () => {
    render(true);
    act(() => { byText('New lead')!.click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=calendar&m=2026-07&new=1', { scroll: false });
  });

  it('hides New lead when canEdit is false', () => {
    render(true, false);
    expect(byText('New lead')).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CustomersLoading from '@/app/(app)/customers/loading';
import InvoicesLoading from '@/app/(app)/invoices/loading';
import ExpensesLoading from '@/app/(app)/expenses/loading';
import SettingsLoading from '@/app/(app)/settings/loading';
import JobsLoading from '@/app/(app)/jobs/loading';
import LeadsLoading from '@/app/(app)/leads/loading';
import DashboardLoading from '@/app/(app)/dashboard/loading';
import CleanersLoading from '@/app/(app)/cleaners/loading';
import MapLoading from '@/app/(app)/map/loading';

describe('table-shaped loading shells', () => {
  it.each([
    ['customers', CustomersLoading, 5],
    ['invoices', InvoicesLoading, 6],
    ['expenses', ExpensesLoading, 6],
    ['settings', SettingsLoading, 6],
  ] as const)('%s renders a busy screen with a table skeleton', (label, Comp, cols) => {
    const { container, unmount } = render(<Comp />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('aria-label')).toBe(`Loading ${label}`);
    expect(container.querySelector('.scrhead')).toBeTruthy();
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(cols);
    unmount();
  });
});

// Every case unmounts: Testing Library leaves prior renders in the document, and two mounted
// skeletons would make getByRole('status') ambiguous.
describe('board, dashboard, cleaners and map loading shells', () => {
  it.each([
    ['jobs', JobsLoading],
    ['leads', LeadsLoading],
  ] as const)('%s shows a kanban-shaped skeleton', (label, Comp) => {
    const { container, unmount } = render(<Comp />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(`Loading ${label}`);
    expect(container.querySelectorAll('.kanban .col.box').length).toBeGreaterThanOrEqual(3);
    unmount();
  });

  it('dashboard shows KPI tiles above panels, with no head row', () => {
    const { container, unmount } = render(<DashboardLoading />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading dashboard');
    expect(container.querySelectorAll('.kpis .kpi.box')).toHaveLength(4);
    expect(container.querySelectorAll('.grid2 .panel.box')).toHaveLength(2);
    // The real dashboard opens straight onto .kpis — a title bar here would shift the layout.
    expect(container.querySelector('.scrhead')).toBeNull();
    unmount();
  });

  it('cleaners shows the leaderboard table, with no head row', () => {
    const { container, unmount } = render(<CleanersLoading />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading cleaners');
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(4);
    // The real /cleaners screen is <section className="screen"><Leaderboard /></section> —
    // no .scrhead — so a title bar here would be a placeholder for nothing.
    expect(container.querySelector('.scrhead')).toBeNull();
    unmount();
  });

  it('map fills the screen so the layout does not jump when tiles arrive', () => {
    const { container, unmount } = render(<MapLoading />);
    const region = screen.getByRole('status');
    expect(region.classList.contains('screen-fill')).toBe(true);
    expect(container.querySelector('.sk-fill')).toBeTruthy();
    unmount();
  });
});

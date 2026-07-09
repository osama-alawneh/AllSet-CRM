// @vitest-environment jsdom
//
// Money model Task 6: Leaderboard is transparent to ALL roles (owner call — cleaner_earnings
// view has no role gate, unlike company_revenue). It renders two precomputed row sets — the
// current month's and all-time's — and toggles between them client-side (no refetch); the
// signed-in user's own row is visually distinguished. Rows arrive pre-sorted desc by earnings
// (lib/earnings.leaderboard() does that), so the component must not re-sort.
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

afterEach(cleanup);

import { Leaderboard, type LeaderRow } from '@/components/dashboard/Leaderboard';

const month: LeaderRow[] = [
  { cleaner_id: 'u1', name: 'Alice', jobsDone: 3, earnings: 150 },
  { cleaner_id: 'u2', name: 'Bob', jobsDone: 1, earnings: 50 },
];
const allTime: LeaderRow[] = [
  { cleaner_id: 'u2', name: 'Bob', jobsDone: 10, earnings: 900 },
  { cleaner_id: 'u1', name: 'Alice', jobsDone: 5, earnings: 300 },
];

describe('Leaderboard', () => {
  it('renders the month rows by default: rank, name, jobs, earnings, sorted desc', () => {
    render(<Leaderboard month={month} allTime={allTime} uid="u1" />);
    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('#1');
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toContain('3');
    expect(rows[0].textContent).toContain('$150');
    expect(rows[1].textContent).toContain('#2');
    expect(rows[1].textContent).toContain('Bob');
  });

  it('highlights the current user\'s own row', () => {
    render(<Leaderboard month={month} allTime={allTime} uid="u1" />);
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(aliceRow.style.fontWeight).toBe('700');
    expect(bobRow.style.fontWeight).not.toBe('700');
  });

  it('switches to the all-time dataset when the toggle is clicked, without a refetch', () => {
    render(<Leaderboard month={month} allTime={allTime} uid="u1" />);
    const monthBtn = screen.getByText('This month');
    const allBtn = screen.getByText('All time');
    expect(monthBtn.getAttribute('aria-pressed')).toBe('true');
    expect(allBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(allBtn);

    expect(allBtn.getAttribute('aria-pressed')).toBe('true');
    expect(monthBtn.getAttribute('aria-pressed')).toBe('false');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Bob');
    expect(rows[0].textContent).toContain('$900');
    expect(rows[1].textContent).toContain('Alice');
  });

  it('shows an empty state when there are no completed jobs', () => {
    render(<Leaderboard month={[]} allTime={[]} uid="u1" />);
    expect(screen.getByText('no completed jobs yet')).toBeTruthy();
  });
});

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

// Task 7: dashboard gets a compact version of the same component (limit + a link to the full
// /cleaners tab) — no refetch, no re-sort, just slicing what's already been passed in.
describe('Leaderboard compact mode (limit + moreHref)', () => {
  const month3: LeaderRow[] = [
    { cleaner_id: 'u1', name: 'Alice', jobsDone: 3, earnings: 150 },
    { cleaner_id: 'u2', name: 'Bob', jobsDone: 1, earnings: 50 },
    { cleaner_id: 'u3', name: 'Cara', jobsDone: 2, earnings: 40 },
  ];
  const allTime3: LeaderRow[] = [
    { cleaner_id: 'u2', name: 'Bob', jobsDone: 10, earnings: 900 },
    { cleaner_id: 'u1', name: 'Alice', jobsDone: 5, earnings: 300 },
    { cleaner_id: 'u3', name: 'Cara', jobsDone: 4, earnings: 100 },
  ];

  it('with limit={2} and moreHref renders only 2 rows plus a "→ Cleaners" link', () => {
    render(<Leaderboard month={month3} allTime={allTime3} uid="u1" limit={2} moreHref="/cleaners" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[1].textContent).toContain('Bob');
    const link = screen.getByRole('link', { name: /Cleaners/ });
    expect(link.getAttribute('href')).toBe('/cleaners');
  });

  it('limit also slices the all-time dataset after toggling', () => {
    render(<Leaderboard month={month3} allTime={allTime3} uid="u1" limit={2} moreHref="/cleaners" />);
    fireEvent.click(screen.getByText('All time'));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Bob');
    expect(rows[1].textContent).toContain('Alice');
  });

  it('without limit renders all rows and shows no "more" link', () => {
    render(<Leaderboard month={month3} allTime={allTime3} uid="u1" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(screen.queryByRole('link', { name: /Cleaners/ })).toBeNull();
  });

  it('without moreHref renders no "more" link even with a limit', () => {
    render(<Leaderboard month={month3} allTime={allTime3} uid="u1" limit={2} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders zero-earnings rows with 0 jobs and the money formatter\'s zero', () => {
    const withZero: LeaderRow[] = [...month3, { cleaner_id: 'u4', name: 'Dee', jobsDone: 0, earnings: 0 }];
    render(<Leaderboard month={withZero} allTime={allTime3} uid="u1" />);
    const deeRow = screen.getByText('Dee').closest('tr')!;
    expect(deeRow.textContent).toContain('0');
    expect(deeRow.textContent).toContain('$0');
  });
});

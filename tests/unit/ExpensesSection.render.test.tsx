// @vitest-environment jsdom
//
// Money model Task 5: ExpensesSection groups rows by month (lib/earnings.monthKey on
// spent_on), shows a subtotal per group, and enforces the auto-vs-manual delete rule at
// the DOM level — job_payout rows are server-immutable (delete_expense RPC raises on
// them; 0024) so no Delete affordance should even be rendered for them, only manual rows
// get one. The add form wires straight to the addExpense server action.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react';

afterEach(cleanup);

import { ExpensesSection, type ExpenseRow } from '@/components/expenses/ExpensesSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const addExpense = vi.fn<(fd: FormData) => Promise<{ error?: string }>>(async () => ({}));
const deleteExpense = vi.fn<(id: number) => Promise<{ error?: string }>>(async () => ({}));
vi.mock('@/app/(app)/expenses/actions', () => ({
  addExpense: (fd: FormData) => addExpense(fd),
  deleteExpense: (id: number) => deleteExpense(id),
}));

const rows: ExpenseRow[] = [
  {
    id: 1, label: 'Job payout — Acme Co', amount: 50, spent_on: '2026-07-05',
    job_id: 7, source: 'job_payout', created_at: '2026-07-05T12:00:00Z',
  },
  {
    id: 2, label: 'Supplies run', amount: 20, spent_on: '2026-07-03',
    job_id: null, source: 'manual', created_at: '2026-07-03T09:00:00Z',
  },
];

describe('ExpensesSection', () => {
  it('groups rows under a 2026-07 month header, and only the manual row gets a Delete button', () => {
    render(<ExpensesSection rows={rows} />);

    expect(screen.getByText(/2026-07 —/)).toBeTruthy();

    const autoRow = screen.getByText('Job payout — Acme Co').closest('tr')!;
    expect(autoRow.textContent).toContain('auto');
    expect(autoRow.querySelector('button')).toBeNull();

    const manualRow = screen.getByText('Supplies run').closest('tr')!;
    expect(manualRow.textContent).toContain('manual');
    expect(manualRow.querySelector('button')).toBeTruthy();
  });

  it('submits the add form via the addExpense server action', async () => {
    render(<ExpensesSection rows={rows} />);

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Gas' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByText('Add expense'));

    await waitFor(() => expect(addExpense).toHaveBeenCalledTimes(1));
  });

  it('calls deleteExpense when a manual row Delete button is clicked', async () => {
    render(<ExpensesSection rows={rows} />);
    fireEvent.click(screen.getByText('Supplies run').closest('tr')!.querySelector('button')!);
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith(2));
  });
});

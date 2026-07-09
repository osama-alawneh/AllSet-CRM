// @vitest-environment jsdom
//
// Money model Task 5: ExpensesSection groups rows by month (lib/earnings.monthKey on
// spent_on), shows a subtotal per group, and enforces the auto-vs-manual delete rule at
// the DOM level — job_payout rows are server-immutable (delete_expense RPC raises on
// them; 0024) so no Delete affordance should even be rendered for them, only manual rows
// get one. The add-expense form now lives behind a "＋ New expense" button + Drawer
// (create-flow convention: button + side Drawer, closes on successful create), and the
// raw job-id number input is replaced by the JobLookup combobox (mirrors CustomerLookup).
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

const jobOptions = [
  { id: 7, label: '#0007 — Acme Co, 12 Main St' },
  { id: 9, label: '#0009 — Zed Farms, 5 Oak Rd' },
];

const openDrawer = () => {
  render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);
  fireEvent.click(screen.getByRole('button', { name: '＋ New expense' }));
};

describe('ExpensesSection', () => {
  it('groups rows under a 2026-07 month header, and only the manual row gets a Delete button', () => {
    render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);

    expect(screen.getByText(/2026-07 —/)).toBeTruthy();

    const autoRow = screen.getByText('Job payout — Acme Co').closest('tr')!;
    expect(autoRow.textContent).toContain('auto');
    expect(autoRow.querySelector('button')).toBeNull();

    const manualRow = screen.getByText('Supplies run').closest('tr')!;
    expect(manualRow.textContent).toContain('manual');
    expect(manualRow.querySelector('button')).toBeTruthy();
  });

  it('gives the manual row Delete button the btn-danger class', () => {
    render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);
    const manualRow = screen.getByText('Supplies run').closest('tr')!;
    const del = manualRow.querySelector('button')!;
    expect(del.className).toContain('btn-danger');
  });

  it('does not render the add-expense form until "＋ New expense" is clicked, then opens it in a dialog', () => {
    render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Label')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '＋ New expense' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByLabelText('Label')).toBeTruthy();
    expect(screen.getByLabelText('Amount')).toBeTruthy();
  });

  it('submits the add form via the addExpense server action, resets it, and closes the dialog on success', async () => {
    openDrawer();

    const label = screen.getByLabelText('Label') as HTMLInputElement;
    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Gas' } });
    fireEvent.change(amount, { target: { value: '12.50' } });
    fireEvent.click(screen.getByText('Add expense'));

    await waitFor(() => expect(addExpense).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the inline form error when addExpense fails and keeps the dialog open', async () => {
    // Note: React 19 auto-resets uncontrolled inputs after ANY <form action> completes
    // (success or error), so "values kept on error" is not assertable under the repo's
    // form-action pattern (UsersPanel behaves the same). We pin the visible error here.
    addExpense.mockResolvedValueOnce({ error: 'Amount must be positive' });
    openDrawer();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Gas' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByText('Add expense'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Amount must be positive'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('calls deleteExpense when a manual row Delete is clicked and the confirm is accepted', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);
    fireEvent.click(screen.getByText('Supplies run').closest('tr')!.querySelector('button')!);
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith(2));
    confirm.mockRestore();
  });

  it('does not call deleteExpense when the confirm is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    deleteExpense.mockClear();
    render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);
    fireEvent.click(screen.getByText('Supplies run').closest('tr')!.querySelector('button')!);
    expect(deleteExpense).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('JobLookup filters options as you type and clicking an option sets the hidden job_id input', () => {
    const { container } = render(<ExpensesSection rows={rows} jobOptions={jobOptions} />);
    fireEvent.click(screen.getByRole('button', { name: '＋ New expense' }));

    const jobInput = screen.getByRole('combobox');
    fireEvent.change(jobInput, { target: { value: 'Zed' } });

    expect(screen.getByText('#0009 — Zed Farms, 5 Oak Rd')).toBeTruthy();
    expect(screen.queryByText('#0007 — Acme Co, 12 Main St')).toBeNull();

    fireEvent.pointerDown(screen.getByRole('option', { name: '#0009 — Zed Farms, 5 Oak Rd' }));

    const hidden = container.querySelector('input[name="job_id"]') as HTMLInputElement;
    expect(hidden.value).toBe('9');
  });
});

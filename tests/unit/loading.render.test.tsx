// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CustomersLoading from '@/app/(app)/customers/loading';
import InvoicesLoading from '@/app/(app)/invoices/loading';
import ExpensesLoading from '@/app/(app)/expenses/loading';
import SettingsLoading from '@/app/(app)/settings/loading';

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

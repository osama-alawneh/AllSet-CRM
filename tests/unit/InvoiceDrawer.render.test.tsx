// @vitest-environment jsdom
//
// Task 20 review fix (Critical): InvoiceDrawer's bill-to must render from the invoice's own
// resolved fields when the invoice's customer is ABSENT from the `customers` prop — which is
// exactly what happens after soft deactivation, because the page filters that array to
// active-only for the CustomerLookup picker. The brief's acceptance criterion is "existing
// invoices/jobs for the inactive customer still render fine"; this test pins it at the DOM
// level so a future refactor re-deriving display data from the filtered array fails loudly.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

// No vitest globals in this repo → react-testing-library's auto-cleanup doesn't run;
// unmount between tests so document-scoped getByText doesn't see stale drawers.
afterEach(cleanup);
import { InvoiceDrawer, type InvoiceCustomerFull } from '@/components/invoices/InvoiceDrawer';
import type { Invoice } from '@/lib/invoices';
import { saveInvoice } from '@/app/(app)/invoices/actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/(app)/invoices/actions', () => ({
  saveInvoice: vi.fn(async () => ({})),
}));

const invoice = (over: Partial<Invoice>): Invoice => ({
  id: 1, customer_id: 10, job_id: null, number: 'INV-1001', issue_date: '2026-06-20',
  status: 'paid', tax: 0, deposit: 0,
  items: [{ description: 'Full clean', qty: 1, unit_price: 180 }],
  customer_name: 'Deactivated Co', customer_address: '9 Elm St', customer_phone: '555-0909',
  customer_email: null,
  ...over,
});

// Active-only picker array — deliberately does NOT contain customer 10.
const activeCustomers: InvoiceCustomerFull[] = [
  { id: 5, name: 'Active Co', address: '1 Oak Ave', phone: '555-0505', email: null },
];

describe('InvoiceDrawer bill-to for a deactivated (absent-from-picker) customer', () => {
  it('view mode renders name/phone/address from the invoice, not the filtered array', () => {
    const { container } = render(
      <InvoiceDrawer invoice={invoice({})} isNew={false} customers={activeCustomers} />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Deactivated Co');
    expect(text).toContain('555-0909');
    expect(text).toContain('9 Elm St');
    expect(text).not.toContain('Bill to—'); // no blanked-out bill-to
  });

  it('edit mode keeps the persisted contact line until a new customer is picked', () => {
    const { container, getByText } = render(
      <InvoiceDrawer invoice={invoice({})} isNew={false} customers={activeCustomers} />
    );
    fireEvent.click(getByText('✎ Edit'));
    const text = container.textContent ?? '';
    // Picker degrades to empty (acceptable), but the displayed contact must not blank.
    expect(text).toContain('555-0909');
    expect(text).toContain('9 Elm St');
  });

  it('still resolves from the array when the customer IS active (control case)', () => {
    const { container } = render(
      <InvoiceDrawer
        invoice={invoice({ customer_id: 5, customer_name: 'Active Co', customer_address: '1 Oak Ave', customer_phone: '555-0505' })}
        isNew={false}
        customers={activeCustomers}
      />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Active Co');
    expect(text).toContain('555-0505');
  });
});

describe('InvoiceDrawer create mode — Bill-to starts empty', () => {
  it('the customer lookup input has no preselected name on create', () => {
    const { getByPlaceholderText } = render(
      <InvoiceDrawer invoice={null} isNew={true} customers={activeCustomers} />
    );
    const combobox = getByPlaceholderText('Search name, phone, address…') as HTMLInputElement;
    expect(combobox.value).toBe('');
  });

  it('saving without picking a customer surfaces an error and does not save', () => {
    vi.mocked(saveInvoice).mockClear();
    const { getByText } = render(
      <InvoiceDrawer invoice={null} isNew={true} customers={activeCustomers} />
    );
    fireEvent.click(getByText('Save'));
    expect(getByText('Pick a customer')).toBeTruthy();
    expect(saveInvoice).not.toHaveBeenCalled();
  });
});

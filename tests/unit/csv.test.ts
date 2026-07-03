import { describe, it, expect } from 'vitest';
import {
  csvEscape,
  toCSV,
  leadsCsvTable,
  jobsCsvTable,
  invoicesCsvTable,
  customersCsvTable,
} from '@/lib/csv';
import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';
import type { CustomerRow } from '@/lib/customers';

describe('csvEscape', () => {
  it('wraps every value in double quotes', () => {
    expect(csvEscape('hi')).toBe('"hi"');
    expect(csvEscape(42)).toBe('"42"');
  });
  it('renders null/undefined as an empty quoted cell', () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
  });
  it('doubles embedded quotes', () => {
    expect(csvEscape('a "quoted" word')).toBe('"a ""quoted"" word"');
  });
  it('prefixes a leading = + - @ with an apostrophe to block formula injection', () => {
    expect(csvEscape('=1+1')).toBe('"\'=1+1"');
    expect(csvEscape('+SUM(A1)')).toBe('"\'+SUM(A1)"');
    expect(csvEscape('-2')).toBe('"\'-2"');
    expect(csvEscape('@cmd')).toBe('"\'@cmd"');
  });
  it('does not prefix a normal leading character', () => {
    expect(csvEscape('Sarah')).toBe('"Sarah"');
  });
});

describe('toCSV', () => {
  it('prepends a UTF-8 BOM and joins rows with CRLF', () => {
    const out = toCSV(['A', 'B'], [[1, 'x'], [2, 'y']]);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM present
    const body = out.slice(1);
    expect(body).toBe('"A","B"\r\n"1","x"\r\n"2","y"');
  });
  it('handles an empty row set (header line only, after the BOM)', () => {
    expect(toCSV(['A'], []).slice(1)).toBe('"A"');
  });
});

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 10, status: 'new', service: 'Standard', stories: 2, panes: 20,
  note: null, quote_value: 500, customer_name: 'Sarah Kim', address: '1 Elm St',
  phone: '555', email: 'a@b.co', lat: 1, lng: 2, ...over,
});

describe('leadsCsvTable', () => {
  it('includes Value only for admin (header AND cell column omitted otherwise)', () => {
    const rows = [lead({})];
    const asAdmin = leadsCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Customer', 'Address', 'Status', 'Service', 'Stories', 'Panes', 'Value']);
    expect(asAdmin.rows[0]).toEqual([1, 'Sarah Kim', '1 Elm St', 'New', 'Standard', 2, 20, 500]);
    const asRep = leadsCsvTable(rows, false);
    expect(asRep.headers).toEqual(['ID', 'Customer', 'Address', 'Status', 'Service', 'Stories', 'Panes']);
    expect(asRep.headers).not.toContain('Value');
    expect(asRep.rows[0]).toHaveLength(7);
  });
});

const job = (over: Partial<Job>): Job => ({
  id: 3, customer_id: 10, lead_id: null, status: 'claimed', claimed_by: 'u1',
  claimed_by_name: 'Cal Cleaner', scheduled_date: '2026-07-01', service: 'Standard',
  price: 180, customer_name: 'Sarah Kim', address: '1 Elm St', phone: null, email: null, ...over,
});

describe('jobsCsvTable', () => {
  it('includes Price only for admin', () => {
    const rows = [job({})];
    const asAdmin = jobsCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Customer', 'Service', 'Status', 'Claimed by', 'Scheduled', 'Price']);
    expect(asAdmin.rows[0]).toEqual([3, 'Sarah Kim', 'Standard', 'Claimed', 'Cal Cleaner', '2026-07-01', 180]);
    const asCleaner = jobsCsvTable(rows, false);
    expect(asCleaner.headers).not.toContain('Price');
    expect(asCleaner.rows[0]).toHaveLength(6);
  });
});

describe('invoicesCsvTable', () => {
  it('always includes Total (admin-only page) via invoiceTotal', () => {
    const inv: Invoice = {
      id: 1, customer_id: 10, job_id: null, number: 'INV-1001', issue_date: '2026-06-20',
      status: 'paid', tax: 0, deposit: 0,
      items: [{ description: 'A', qty: 2, unit_price: 100 }], customer_name: 'Sarah Kim',
    };
    const t = invoicesCsvTable([inv]);
    expect(t.headers).toEqual(['Number', 'Customer', 'Date', 'Status', 'Total']);
    expect(t.rows[0]).toEqual(['INV-1001', 'Sarah Kim', '2026-06-20', 'paid', 200]);
  });
});

const cust = (over: Partial<CustomerRow>): CustomerRow => ({
  id: 5, name: 'Acme Co', phone: '555', email: 'a@b.co', address: '2 Oak Ave',
  type: 'commercial', notes: null, jobs: 3, invoices: 4, ...over,
});

describe('customersCsvTable', () => {
  it('includes Invoices only for admin', () => {
    const rows = [cust({})];
    const asAdmin = customersCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Name', 'Phone', 'Email', 'Address', 'Type', 'Jobs', 'Invoices']);
    expect(asAdmin.rows[0]).toEqual([5, 'Acme Co', '555', 'a@b.co', '2 Oak Ave', 'commercial', 3, 4]);
    const asRep = customersCsvTable(rows, false);
    expect(asRep.headers).not.toContain('Invoices');
    expect(asRep.rows[0]).toHaveLength(7);
  });
});

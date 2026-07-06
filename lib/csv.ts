import { statusLabel, type Lead } from '@/lib/leads';
import { jobStatusLabel, type Job } from '@/lib/jobs';
import { invoiceTotal, type Invoice } from '@/lib/invoices';
import type { CustomerRow } from '@/lib/customers';

export type CsvCell = string | number | null | undefined;
export type CsvTable = { headers: string[]; rows: CsvCell[][] };

// Quote every cell (doubling embedded quotes) and neutralize CSV formula injection: a cell that
// begins with = + - @ is prefixed with an apostrophe so Excel/Sheets treats it as text, not a formula.
export function csvEscape(v: CsvCell): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// Join into RFC-4180-ish CSV: CRLF line endings + a leading UTF-8 BOM so Excel opens UTF-8 cleanly.
export function toCSV(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))];
  return '﻿' + lines.join('\r\n');
}

// Client-only: builds a Blob + anchor and clicks it. `document` is touched ONLY here (at call time),
// so importing this module in a node/Vitest env is safe.
export function downloadCSV(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- role-aware per-entity column builders (pure; unit-tested without a DOM) ----
// Money columns are OMITTED for non-admins — header and cell column both dropped, never blanked.

export function leadsCsvTable(leads: Lead[], admin: boolean): CsvTable {
  const headers = ['ID', 'Customer', 'Address', 'Status', 'Service', 'Description', 'Stories', 'Panes', ...(admin ? ['Value'] : [])];
  const rows: CsvCell[][] = leads.map(l => [
    l.id, l.customer_name, l.address, statusLabel[l.status], l.service, l.description, l.stories, l.panes,
    ...(admin ? [l.quote_value] : []),
  ]);
  return { headers, rows };
}

export function jobsCsvTable(jobs: Job[], admin: boolean): CsvTable {
  const headers = ['ID', 'Customer', 'Service', 'Description', 'Status', 'Claimed by', 'Scheduled', ...(admin ? ['Price'] : [])];
  const rows: CsvCell[][] = jobs.map(j => [
    j.id, j.customer_name, j.service, j.description, jobStatusLabel[j.status], j.claimed_by_name, j.scheduled_date,
    ...(admin ? [j.price] : []),
  ]);
  return { headers, rows };
}

export function invoicesCsvTable(invoices: Invoice[]): CsvTable {
  const headers = ['Number', 'Customer', 'Date', 'Status', 'Total'];
  const rows: CsvCell[][] = invoices.map(inv => [
    inv.number, inv.customer_name, inv.issue_date, inv.status, invoiceTotal(inv.items, inv.tax, inv.deposit),
  ]);
  return { headers, rows };
}

export function customersCsvTable(rows: CustomerRow[], admin: boolean): CsvTable {
  const headers = ['ID', 'Name', 'Phone', 'Email', 'Address', 'Type', 'Jobs', ...(admin ? ['Invoices'] : [])];
  const out: CsvCell[][] = rows.map(c => [
    c.id, c.name, c.phone, c.email, c.address, c.type, c.jobs,
    ...(admin ? [c.invoices] : []),
  ]);
  return { headers, rows: out };
}

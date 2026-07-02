export type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'residential' | 'commercial';
  notes: string | null;
  jobs: number;
  invoices: number | null; // null = caller may not see invoices (non-admin)
};

export function filterCustomers(rows: CustomerRow[], q: string): CustomerRow[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(
    r =>
      r.name.toLowerCase().includes(f) ||
      (r.address ?? '').toLowerCase().includes(f) ||
      (r.phone ?? '').toLowerCase().includes(f)
  );
}

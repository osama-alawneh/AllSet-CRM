export type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'residential' | 'commercial';
  notes: string | null;
  active: boolean;
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

export type CustomerInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'residential' | 'commercial';
  notes: string | null;
};

export function parseCustomerForm(
  fd: FormData
): { ok: true; value: CustomerInput } | { ok: false; error: string } {
  const name = String(fd.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  const opt = (k: string) => {
    const v = String(fd.get(k) ?? '').trim();
    return v || null;
  };
  return {
    ok: true,
    value: {
      name,
      type: fd.get('type') === 'commercial' ? 'commercial' : 'residential',
      phone: opt('phone'),
      email: opt('email'),
      address: opt('address'),
      notes: opt('notes'),
    },
  };
}

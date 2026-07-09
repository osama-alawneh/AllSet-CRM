export type CustomerOption = { id: number; name: string; phone: string | null; address: string | null };

// Owner request 2026-07-08: a dropdown dies at 1000 customers and can't tell
// 20 Ahmads apart — filter across name, phone AND address.
export function filterCustomers(q: string, customers: CustomerOption[]): CustomerOption[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return customers
    .filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.phone ?? '').toLowerCase().includes(s) ||
      (c.address ?? '').toLowerCase().includes(s))
    .slice(0, 8);
}

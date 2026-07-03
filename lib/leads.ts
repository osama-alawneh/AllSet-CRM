export type LeadStatus = 'new' | 'follow' | 'won' | 'lost';

export const LEAD_STATUSES: LeadStatus[] = ['new', 'follow', 'won', 'lost'];

export const statusLabel: Record<LeadStatus, string> = {
  new: 'New', follow: 'Follow-up', won: 'Won', lost: 'Lost',
};
export const statusColor: Record<LeadStatus, string> = {
  new: 'var(--new)', follow: 'var(--follow)', won: 'var(--won)', lost: 'var(--lost)',
};

export type Lead = {
  id: number;
  customer_id: number;
  status: LeadStatus;
  service: string | null;
  stories: number | null;
  panes: number | null;
  note: string | null;
  quote_value: number | null; // null = not visible (non-admin) or unset
  customer_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

export type Pin = { id: number; lat: number; lng: number; status: LeadStatus; label: string };

// Shapes the server pages fetch: leads_public view + a slim customers projection.
export type LeadPublicRow = {
  id: number;
  customer_id: number;
  status: LeadStatus;
  service: string | null;
  stories: number | null;
  panes: number | null;
  note: string | null;
};
export type CustomerGeo = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

export function buildLeads(
  rows: LeadPublicRow[],
  customers: CustomerGeo[],
  quoteById: Map<number, number> | null
): Lead[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return rows.map(r => {
    const c = byId.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      status: r.status,
      service: r.service,
      stories: r.stories,
      panes: r.panes,
      note: r.note,
      quote_value: quoteById ? (quoteById.get(r.id) ?? null) : null,
      customer_name: c?.name ?? 'Unknown',
      address: c?.address ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
    };
  });
}

export function groupByStatus(leads: Lead[]): Record<LeadStatus, Lead[]> {
  const out: Record<LeadStatus, Lead[]> = { new: [], follow: [], won: [], lost: [] };
  for (const l of leads) out[l.status].push(l);
  return out;
}

export type PinInput = { name: string; address: string; lat: number; lng: number; status: LeadStatus };

export function parsePinForm(
  fd: FormData
): { ok: true; value: PinInput } | { ok: false; error: string } {
  const name = String(fd.get('name') ?? '').trim();
  const address = String(fd.get('address') ?? '').trim();
  const lat = Number(fd.get('lat'));
  const lng = Number(fd.get('lng'));
  const status = String(fd.get('status') ?? '');
  if (!name) return { ok: false, error: 'Address or name is required' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'Invalid coordinates' };
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { ok: false, error: 'Invalid status' };
  return { ok: true, value: { name, address, lat, lng, status: status as LeadStatus } };
}

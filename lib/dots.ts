import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

export type DotStatus = 'unmarked' | 'yes' | 'no' | 'not_home' | 'callback';

// Popup button order (screenshot): outcomes first, Unmarked (reset) last.
export const DOT_STATUSES: DotStatus[] = ['yes', 'no', 'not_home', 'callback', 'unmarked'];

export const dotStatusLabel: Record<DotStatus, string> = {
  yes: 'Yes', no: 'No', not_home: 'Not Home', callback: 'Callback', unmarked: 'Unmarked',
};
// Spec-locked mapping onto existing status tokens (works in both themes).
export const dotStatusColor: Record<DotStatus, string> = {
  yes: 'var(--won)', no: 'var(--lost)', not_home: 'var(--prog)', callback: 'var(--sched)', unmarked: 'var(--new)',
};

export type Dot = {
  id: number; lat: number; lng: number;
  label: string; notes: string; status: DotStatus;
};

const optText = (fd: FormData, k: string): string | null => {
  const v = String(fd.get(k) ?? '').trim();
  return v || null;
};
const optMoney = (fd: FormData, k: string): { ok: true; n: number | null } | { ok: false } => {
  const v = String(fd.get(k) ?? '').trim();
  if (v === '') return { ok: true, n: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, n };
};
// Shared head of both convert forms: dot id + customer identity. Name falls
// back to the address (door-knock: often no name yet), matching the old
// create-lead popover's spirit; customers.name is NOT NULL so one of them must exist.
function parseHead(fd: FormData):
  | { ok: true; dot_id: number; name: string; phone: string | null; address: string; service: string }
  | { ok: false; error: string } {
  const dot_id = Number(fd.get('dot_id'));
  if (!Number.isFinite(dot_id) || dot_id <= 0) return { ok: false, error: 'Invalid dot' };
  const address = String(fd.get('address') ?? '').trim();
  const name = String(fd.get('name') ?? '').trim() || address;
  if (!name) return { ok: false, error: 'Name or address is required' };
  const service = String(fd.get('service') ?? '').trim();
  if (!service) return { ok: false, error: 'Service is required' };
  return { ok: true, dot_id, name, phone: optText(fd, 'phone'), address, service };
}

export type ConvertLeadInput = {
  dot_id: number; name: string; phone: string | null; address: string;
  service: string; status: LeadStatus; note: string | null; quote: number | null;
};

export function parseConvertLeadForm(
  fd: FormData
): { ok: true; value: ConvertLeadInput } | { ok: false; error: string } {
  const head = parseHead(fd);
  if (!head.ok) return head;
  const status = String(fd.get('status') ?? '');
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { ok: false, error: 'Invalid status' };
  const quote = optMoney(fd, 'quote');
  if (!quote.ok) return { ok: false, error: 'Invalid quote' };
  const { dot_id, name, phone, address, service } = head;
  return { ok: true, value: { dot_id, name, phone, address, service, status: status as LeadStatus, note: optText(fd, 'note'), quote: quote.n } };
}

export type ConvertJobInput = {
  dot_id: number; name: string; phone: string | null; address: string;
  service: string; description: string | null; scheduled_date: string | null;
  price: number | null; cleaner_amount: number | null;
};

export function parseConvertJobForm(
  fd: FormData
): { ok: true; value: ConvertJobInput } | { ok: false; error: string } {
  const head = parseHead(fd);
  if (!head.ok) return head;
  const dateRaw = String(fd.get('scheduled_date') ?? '').trim();
  // Same shape rule as parseJobForm (lib/jobs.ts): date or datetime-local.
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dateRaw)) return { ok: false, error: 'Date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' };
  const price = optMoney(fd, 'price');
  if (!price.ok) return { ok: false, error: 'Invalid number' };
  const pot = optMoney(fd, 'cleaner_amount');
  if (!pot.ok) return { ok: false, error: 'Invalid number' };
  const { dot_id, name, phone, address, service } = head;
  return {
    ok: true,
    value: {
      dot_id, name, phone, address, service,
      description: optText(fd, 'description'),
      scheduled_date: dateRaw || null,
      price: price.n, cleaner_amount: pot.n,
    },
  };
}

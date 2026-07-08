import { statusLabel, statusColor, type Lead, type LeadStatus } from '@/lib/leads';
import { jobStatusLabel, jobStatusColor, type Job, type JobStatus } from '@/lib/jobs';

// One pin type for the map page: leads and jobs share the surface but keep their
// own status vocabularies. `kind` discriminates rendering (shape + color) and routing.
export type MapPin =
  | { kind: 'lead'; id: number; lat: number; lng: number; status: LeadStatus; label: string }
  | { kind: 'job'; id: number; lat: number; lng: number; status: JobStatus; label: string };

// Lead and job ids come from different sequences and can collide — key on kind too.
export const pinKey = (p: MapPin): string => `${p.kind}-${p.id}`;

export const pinColor = (p: MapPin): string =>
  p.kind === 'lead' ? statusColor[p.status] : jobStatusColor[p.status];

// Jobs carry no coordinates of their own; they inherit the customer's.
export function buildMapPins(
  leads: Lead[],
  jobs: Job[],
  geoByCustomer: Map<number, { lat: number | null; lng: number | null }>
): MapPin[] {
  const pins: MapPin[] = [];
  for (const l of leads) {
    if (l.status === 'lost') continue;
    if (l.lat == null || l.lng == null) continue;
    pins.push({
      kind: 'lead', id: l.id, lat: l.lat, lng: l.lng, status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    });
  }
  for (const j of jobs) {
    if (j.status === 'done') continue;
    const g = geoByCustomer.get(j.customer_id);
    if (g?.lat == null || g?.lng == null) continue;
    pins.push({
      kind: 'job', id: j.id, lat: g.lat, lng: g.lng, status: j.status,
      label: `${j.customer_name} — Job: ${jobStatusLabel[j.status]}`,
    });
  }
  return pins;
}

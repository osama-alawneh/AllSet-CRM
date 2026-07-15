import { statusLabel, statusColor, type Lead, type LeadStatus } from '@/lib/leads';
import { jobStatusLabel, jobStatusColor, type Job, type JobStatus } from '@/lib/jobs';
import { dotStatusLabel, dotStatusColor, type Dot, type DotStatus } from '@/lib/dots';

// One pin type for the map page: leads, jobs, and canvassing dots share the
// surface but keep their own status vocabularies. `kind` discriminates
// rendering (shape + color) and click behavior (dots open a popup, not a drawer).
export type MapPin =
  | { kind: 'lead'; id: number; lat: number; lng: number; status: LeadStatus; label: string }
  | { kind: 'job'; id: number; lat: number; lng: number; status: JobStatus; label: string }
  | { kind: 'dot'; id: number; lat: number; lng: number; status: DotStatus; label: string };

// Ids come from different sequences and can collide — key on kind too.
export const pinKey = (p: MapPin): string => `${p.kind}-${p.id}`;

export const pinColor = (p: MapPin): string =>
  p.kind === 'lead' ? statusColor[p.status]
  : p.kind === 'job' ? jobStatusColor[p.status]
  : dotStatusColor[p.status];

// Jobs carry no coordinates of their own; they inherit the customer's.
export function buildMapPins(
  leads: Lead[],
  jobs: Job[],
  geoByCustomer: Map<number, { lat: number | null; lng: number | null }>,
  dots: Dot[] = []
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
  for (const d of dots) {
    pins.push({
      kind: 'dot', id: d.id, lat: d.lat, lng: d.lng, status: d.status,
      label: `${d.label || 'Dot'} — ${dotStatusLabel[d.status]}`,
    });
  }
  return pins;
}

// Three-way layer filter. Extracted so the Dots toggle can't silently bucket
// dots under Jobs (the old two-way ternary's exact failure shape).
export function visibleMapPins(
  pins: MapPin[],
  show: { leads: boolean; jobs: boolean; dots: boolean }
): MapPin[] {
  return pins.filter(p =>
    p.kind === 'lead' ? show.leads : p.kind === 'job' ? show.jobs : show.dots
  );
}

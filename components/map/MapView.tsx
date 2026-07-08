'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import type { MapPin } from '@/lib/mapPins';
import type { GeocodeSuggestion } from '@/lib/geocode';
import { SchematicMap } from './SchematicMap';
import { MapSearch } from './MapSearch';
import { PinPopover } from './PinPopover';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists.
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type Pending = { lat: number; lng: number; xPct: number; yPct: number };
type FlyTarget = { lat: number; lng: number; seq: number };

export function MapView({
  pins, token, canCreate, openLeadId,
}: {
  pins: MapPin[];
  token: string | null;
  canCreate: boolean;
  openLeadId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const impl = pickMapImpl(token);

  // A successful createLeadFromPin soft-navigates to /map?l=<newId>, so this instance
  // persists and the popover would otherwise stay open (re-enabled Create button →
  // duplicate customer+lead on a second click). Render-phase state adjustment
  // (React-documented "adjust state when props change" pattern; a useEffect here
  // would trip react-hooks/set-state-in-effect): when the open-drawer lead changes,
  // dismiss the popover.
  const [seenLeadId, setSeenLeadId] = useState<string | null>(openLeadId);
  if (openLeadId !== seenLeadId) {
    setSeenLeadId(openLeadId);
    setPending(null); // creation succeeded (or a pin drawer opened) → close popover
  }

  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (canCreate) setPending({ lat, lng, xPct, yPct });
  };
  const onPinClick = (pin: MapPin) =>
    router.push(pin.kind === 'job' ? `/map?j=${pin.id}` : `/map?l=${pin.id}`, { scroll: false });
  const onSearchSelect = (s: GeocodeSuggestion) =>
    setFlyTo(prev => ({ lat: s.lat, lng: s.lng, seq: (prev?.seq ?? 0) + 1 }));

  const visible = pins.filter(p => (p.kind === 'lead' ? showLeads : showJobs));

  const overlay = pending ? (
    <PinPopover {...pending} onCancel={() => setPending(null)} />
  ) : null;

  return (
    <div className="panel box map-panel">
      <div className="maptools">
        <h3>Pin map / neighborhood</h3>
        {impl === 'mapbox' && <MapSearch token={token!} onSelect={onSearchSelect} />}
        <div className="layer-toggles" style={{ marginLeft: 'auto' }}>
          <button
            type="button" className="chip" aria-pressed={showLeads}
            onClick={() => setShowLeads(v => !v)}
          >
            ◆ Leads
          </button>
          <button
            type="button" className="chip" aria-pressed={showJobs}
            onClick={() => setShowJobs(v => !v)}
          >
            ● Jobs
          </button>
        </div>
        {canCreate && <span className="hint">✚ click empty space to drop a pin &amp; create a lead</span>}
      </div>
      {impl === 'mapbox' ? (
        <MapboxMap
          pins={visible} canCreate={canCreate} overlay={overlay} flyTo={flyTo}
          onMapClick={onMapClick} onPinClick={onPinClick} token={token!}
        />
      ) : (
        <SchematicMap pins={visible} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} />
      )}
      <Legend />
    </div>
  );
}

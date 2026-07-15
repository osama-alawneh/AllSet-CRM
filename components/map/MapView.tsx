'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import { visibleMapPins, type MapPin } from '@/lib/mapPins';
import type { Dot } from '@/lib/dots';
import type { GeocodeSuggestion } from '@/lib/geocode';
import { createDot } from '@/app/(app)/map/actions';
import { SchematicMap } from './SchematicMap';
import { MapSearch } from './MapSearch';
import { DotPopover } from './DotPopover';
import { DotCounts } from './DotCounts';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists.
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type FlyTarget = { lat: number; lng: number; seq: number };
// fresh: created this session and possibly not yet in `dots` (router.refresh in
// flight) — the absence-close rule below must not fire on it before first sight.
type OpenDot = { id: number; xPct: number; yPct: number; fresh: boolean };

export function MapView({
  pins, dots, token, canCreate, canEditDots, openLeadId, openJobId,
}: {
  pins: MapPin[];
  dots: Dot[];
  token: string | null;
  canCreate: boolean;      // admin/rep: map click drops a dot
  canEditDots: boolean;    // admin/rep: popup is editable; cleaner gets read-only
  openLeadId: string | null;
  openJobId: string | null;
}) {
  const router = useRouter();
  const [openDot, setOpenDot] = useState<OpenDot | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [showDots, setShowDots] = useState(true);
  const impl = pickMapImpl(token);

  // Render-phase state adjustments (React-documented "adjust state when props
  // change" pattern — an effect here trips react-hooks/set-state-in-effect):
  // 1) A drawer opened (?l= or ?j= changed) -> convert succeeded or a pin
  //    drawer took over; close the dot popup.
  const drawerKey = `${openLeadId ?? ''}|${openJobId ?? ''}`;
  const [seenDrawerKey, setSeenDrawerKey] = useState(drawerKey);
  if (drawerKey !== seenDrawerKey) {
    setSeenDrawerKey(drawerKey);
    setOpenDot(null);
  }
  // 2) The open dot vanished from props (teammate deleted/converted it, or our
  //    own delete landed). `fresh` dots are exempt until first seen in props.
  if (openDot) {
    const present = dots.some(d => d.id === openDot.id);
    if (present && openDot.fresh) setOpenDot({ ...openDot, fresh: false });
    if (!present && !openDot.fresh) setOpenDot(null);
  }

  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (!canCreate) return;
    void (async () => {
      const res = await createDot(lat, lng);
      if (res.id != null) {
        setOpenDot({ id: res.id, xPct, yPct, fresh: true });
        router.refresh();
      }
    })();
  };
  const onPinClick = (pin: MapPin, xPct: number, yPct: number) => {
    if (pin.kind === 'dot') {
      setOpenDot({ id: pin.id, xPct, yPct, fresh: false });
      return;
    }
    setOpenDot(null);
    router.push(pin.kind === 'job' ? `/map?j=${pin.id}` : `/map?l=${pin.id}`, { scroll: false });
  };
  const onSearchSelect = (s: GeocodeSuggestion) =>
    setFlyTo(prev => ({ lat: s.lat, lng: s.lng, seq: (prev?.seq ?? 0) + 1 }));

  const visible = visibleMapPins(pins, { leads: showLeads, jobs: showJobs, dots: showDots });

  // A fresh dot may not be in props yet — render the popup on a local default.
  const openDotData: Dot | null = openDot
    ? dots.find(d => d.id === openDot.id)
      ?? (openDot.fresh ? { id: openDot.id, lat: 0, lng: 0, label: '', notes: '', status: 'unmarked' } : null)
    : null;
  const overlay = openDot && openDotData ? (
    <DotPopover
      key={openDot.id}
      dot={openDotData} canEdit={canEditDots}
      xPct={openDot.xPct} yPct={openDot.yPct}
      onClose={() => setOpenDot(null)}
    />
  ) : null;

  return (
    <div className="panel box map-panel">
      <div className="maptools">
        <h3>Pin map / neighborhood</h3>
        {impl === 'mapbox' && <MapSearch token={token!} onSelect={onSearchSelect} />}
        <DotCounts dots={showDots ? dots : []} />
        <div className="layer-toggles" style={{ marginLeft: 'auto' }}>
          <button type="button" className="chip" aria-pressed={showLeads} onClick={() => setShowLeads(v => !v)}>
            ◆ Leads
          </button>
          <button type="button" className="chip" aria-pressed={showJobs} onClick={() => setShowJobs(v => !v)}>
            ● Jobs
          </button>
          <button type="button" className="chip" aria-pressed={showDots} onClick={() => setShowDots(v => !v)}>
            ● Dots
          </button>
        </div>
        {canCreate && <span className="hint">✚ click empty space to drop a dot</span>}
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

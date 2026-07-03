'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import type { Pin } from '@/lib/leads';
import { SchematicMap } from './SchematicMap';
import { PinPopover } from './PinPopover';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists (Task 6).
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type Pending = { lat: number; lng: number; xPct: number; yPct: number };

export function MapView({
  pins, token, canCreate,
}: {
  pins: Pin[];
  token: string | null;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const impl = pickMapImpl(token);

  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (canCreate) setPending({ lat, lng, xPct, yPct });
  };
  const onPinClick = (id: number) => router.push(`/map?l=${id}`, { scroll: false });

  const overlay = pending ? (
    <PinPopover {...pending} onCancel={() => setPending(null)} />
  ) : null;

  return (
    <div className="panel box">
      <div className="maptools">
        <h3 style={{ marginRight: 'auto' }}>Pin map / neighborhood</h3>
        {canCreate && <span className="hint">✚ click empty space to drop a pin &amp; create a lead</span>}
      </div>
      {impl === 'mapbox' ? (
        <MapboxMap pins={pins} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} token={token!} />
      ) : (
        <SchematicMap pins={pins} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} />
      )}
      <Legend />
    </div>
  );
}

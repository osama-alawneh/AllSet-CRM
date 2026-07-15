'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { MapPin } from '@/lib/mapPins';

// Same rule as MapView: mapbox-gl only loads when a token exists, never on the server.
const MapboxMap = dynamic(() => import('@/components/map/MapboxMap').then(m => m.MapboxMap), { ssr: false });

export function MiniMap({ pins, token }: { pins: MapPin[]; token: string | null }) {
  const router = useRouter();
  const impl = pickMapImpl(token);
  const onPinClick = (pin: MapPin) => {
    // Dot ids collide with lead ids (different sequences) — a dot must never
    // deep-link a lead drawer. Dots just go to the map.
    router.push(pin.kind === 'dot' ? '/map' : `/map?l=${pin.id}`);
  };
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => router.push('/map')}>
      {impl === 'mapbox' ? (
        <MapboxMap
          pins={pins}
          canCreate={false}
          overlay={null}
          height={190}
          interactive={false}
          onMapClick={() => {}}
          onPinClick={onPinClick}
          token={token!}
        />
      ) : (
        <SchematicMap
          pins={pins}
          canCreate={false}
          overlay={null}
          height={190}
          onMapClick={() => {}}
          onPinClick={onPinClick}
        />
      )}
    </div>
  );
}

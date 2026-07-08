'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { Pin } from '@/lib/leads';

// Same rule as MapView: mapbox-gl only loads when a token exists, never on the server.
const MapboxMap = dynamic(() => import('@/components/map/MapboxMap').then(m => m.MapboxMap), { ssr: false });

export function MiniMap({ pins, token }: { pins: Pin[]; token: string | null }) {
  const router = useRouter();
  const impl = pickMapImpl(token);
  const onPinClick = (id: number) => router.push(`/map?l=${id}`);
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

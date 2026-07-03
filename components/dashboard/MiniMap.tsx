'use client';
import { useRouter } from 'next/navigation';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { Pin } from '@/lib/leads';

export function MiniMap({ pins }: { pins: Pin[] }) {
  const router = useRouter();
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => router.push('/map')}>
      <SchematicMap
        pins={pins}
        canCreate={false}
        overlay={null}
        height={190}
        onMapClick={() => {}}
        onPinClick={id => router.push(`/map?l=${id}`)}
      />
    </div>
  );
}

'use client';
import type React from 'react';
import { project, unproject } from '@/lib/geo';
import { statusColor, type Pin } from '@/lib/leads';

export type MapImplProps = {
  pins: Pin[];
  canCreate: boolean;
  overlay: React.ReactNode;
  onMapClick: (lat: number, lng: number, xPct: number, yPct: number) => void;
  onPinClick: (id: number) => void;
  height?: number | string;
};

export function SchematicMap({ pins, canCreate, overlay, onMapClick, onPinClick, height }: MapImplProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canCreate) return;
    const target = e.target as HTMLElement;
    if (target.closest('.mpin') || target.closest('.pop')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - r.left) / r.width) * 100;
    const yPct = ((e.clientY - r.top) / r.height) * 100;
    const { lat, lng } = unproject(xPct, yPct);
    onMapClick(lat, lng, xPct, yPct);
  };

  return (
    <div
      className="map"
      onClick={handleClick}
      style={{ cursor: canCreate ? 'crosshair' : 'default', ...(height != null ? { height } : {}) }}
    >
      {/* prototype street/block chrome (clearview-proto.html mapChrome) */}
      <div className="street" style={{ left: 0, top: '38%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: 0, top: '72%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: '28%', top: 0, width: 6, height: '100%' }} />
      <div className="street" style={{ left: '66%', top: 0, width: 6, height: '100%' }} />
      <div className="block" style={{ left: '6%', top: '8%', width: '18%', height: '24%' }} />
      <div className="block" style={{ left: '34%', top: '8%', width: '28%', height: '24%' }} />
      <div className="block" style={{ left: '72%', top: '44%', width: '20%', height: '22%' }} />

      {pins.map(pin => {
        const { xPct, yPct } = project(pin.lat, pin.lng);
        return (
          <div
            key={pin.id}
            className="mpin"
            title={pin.label}
            style={{ left: `${xPct}%`, top: `${yPct}%`, '--pc': statusColor[pin.status] } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); onPinClick(pin.id); }}
          >
            <i />
          </div>
        );
      })}

      {overlay}
    </div>
  );
}

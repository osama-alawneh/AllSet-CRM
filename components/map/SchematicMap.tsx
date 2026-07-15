'use client';
import type React from 'react';
import { project, unproject } from '@/lib/geo';
import { pinColor, pinKey, type MapPin } from '@/lib/mapPins';

export type MapImplProps = {
  pins: MapPin[];
  canCreate: boolean;
  overlay: React.ReactNode;
  onMapClick: (lat: number, lng: number, xPct: number, yPct: number) => void;
  // Impls pass the pin's container-% so MapView can position the dot popup
  // (mapbox needs its Map instance to project lat/lng; MapView never sees it).
  onPinClick: (pin: MapPin, xPct: number, yPct: number) => void;
  height?: number | string;
};

export function SchematicMap({ pins, canCreate, overlay, onMapClick, onPinClick, height }: MapImplProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canCreate) return;
    const target = e.target as HTMLElement;
    if (target.closest('.mpin') || target.closest('.pop')) return;
    const r = e.currentTarget.getBoundingClientRect();
    // Guard div-by-zero: a not-yet-laid-out container (or jsdom, which never
    // computes real box sizes) reports a 0×0 rect — Infinity would otherwise
    // flow into the dot popup's `min()/calc()` position CSS and blow up.
    const xPct = r.width > 0 ? ((e.clientX - r.left) / r.width) * 100 : 0;
    const yPct = r.height > 0 ? ((e.clientY - r.top) / r.height) * 100 : 0;
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
          <button
            key={pinKey(pin)}
            type="button"
            className={pin.kind === 'job' ? 'mpin mpin-job' : pin.kind === 'dot' ? 'mpin mpin-dot' : 'mpin'}
            aria-label={pin.label}
            title={pin.label}
            style={{ left: `${xPct}%`, top: `${yPct}%`, '--pc': pinColor(pin) } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); onPinClick(pin, xPct, yPct); }}
          >
            <i />
          </button>
        );
      })}

      {overlay}
    </div>
  );
}

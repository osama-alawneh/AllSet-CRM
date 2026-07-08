'use client';
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'; // imported ONLY here, never in a server file
import { MAP_BOUNDS } from '@/lib/geo';
import { statusColor } from '@/lib/leads';
import type { MapImplProps } from './SchematicMap';

export function MapboxMap({
  pins, canCreate, overlay, onMapClick, onPinClick, token, height, interactive = true,
}: MapImplProps & { token: string; interactive?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  // Keep the latest callbacks reachable from the once-bound map click handler.
  // Synced in an effect (not during render) — mutating a ref's `.current` while
  // rendering trips the `react-hooks/refs` lint rule.
  const clickRef = useRef(onMapClick);
  const canCreateRef = useRef(canCreate);
  useEffect(() => {
    clickRef.current = onMapClick;
    canCreateRef.current = canCreate;
  }, [onMapClick, canCreate]);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      bounds: [
        [MAP_BOUNDS.minLng, MAP_BOUNDS.minLat],
        [MAP_BOUNDS.maxLng, MAP_BOUNDS.maxLat],
      ],
      fitBoundsOptions: { padding: 30 },
      cooperativeGestures: true,
      interactive,
    });
    mapRef.current = map;
    map.on('click', e => {
      if (!canCreateRef.current) return;
      const p = map.project(e.lngLat);
      const rect = containerRef.current!.getBoundingClientRect();
      const xPct = (p.x / rect.width) * 100;
      const yPct = (p.y / rect.height) * 100;
      clickRef.current(e.lngLat.lat, e.lngLat.lng, xPct, yPct);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token, interactive]);

  // Sync markers whenever pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    for (const pin of pins) {
      // Mapbox owns the OUTER marker element's transform, so put .mpin styling on an
      // INNER child (its own rotate/translate does not fight Mapbox's positioning).
      const el = document.createElement('div');
      const inner = document.createElement('div');
      inner.className = 'mpin';
      inner.title = pin.label;
      inner.style.setProperty('--pc', statusColor[pin.status]);
      inner.innerHTML = '<i></i>';
      inner.addEventListener('click', ev => {
        ev.stopPropagation();
        onPinClick(pin.id);
      });
      el.appendChild(inner);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [pins, onPinClick]);

  return (
    <div
      className="map"
      ref={containerRef}
      style={{ cursor: canCreate ? 'crosshair' : 'default', ...(height != null ? { height } : {}) }}
    >
      {overlay}
    </div>
  );
}

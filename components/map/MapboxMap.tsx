'use client';
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'; // imported ONLY here, never in a server file
import { MAP_BOUNDS, MAP_STYLE, FLY_TO_OPTS } from '@/lib/geo';
import { pinColor } from '@/lib/mapPins';
import type { MapImplProps } from './SchematicMap';

export function MapboxMap({
  pins, canCreate, overlay, onMapClick, onPinClick, token, height, interactive = true, flyTo = null,
}: MapImplProps & {
  token: string;
  interactive?: boolean;
  flyTo?: { lat: number; lng: number; seq: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The live Map is React state (not a ref) so the marker/flyTo effects re-run once
  // the deferred construction below actually produces a map.
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
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
    const container = containerRef.current;
    if (!container) return;
    let created: mapboxgl.Map | null = null;
    // Construction is deferred one animation frame with cancellation. React StrictMode's
    // dev double-mount (mount -> cleanup -> mount, all before a frame fires) would
    // otherwise construct-and-remove a throwaway Map, and mapbox-gl crashes when a
    // removed map's in-flight telemetry request fails afterwards ("this.errorCb is not
    // a function" — remove() nulls errorCb, the late failure callback still calls it).
    // The throwaway mount now cancels the frame before anything is built.
    const frame = requestAnimationFrame(() => {
      mapboxgl.accessToken = token;
      const m = new mapboxgl.Map({
        container,
        style: MAP_STYLE,
        bounds: [
          [MAP_BOUNDS.minLng, MAP_BOUNDS.minLat],
          [MAP_BOUNDS.maxLng, MAP_BOUNDS.maxLat],
        ],
        fitBoundsOptions: { padding: 30 },
        interactive,
      });
      created = m;
      // Live user location (owner item 4): button on the map; the browser
      // permission prompt fires on first click (control-native — no permission
      // code of ours). trackUserLocation follows until the first manual pan
      // (mapbox ACTIVE_LOCK -> BACKGROUND), then the blue dot keeps updating
      // without moving the camera — accepted deviation, see spec item 4.
      // Interactive surfaces only: MiniMap (interactive=false) gets no control.
      if (interactive) {
        m.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
          }),
          'top-right'
        );
      }
      m.on('click', e => {
        searchMarkerRef.current?.remove();
        searchMarkerRef.current = null;
        if (!canCreateRef.current) return;
        const p = m.project(e.lngLat);
        const rect = container.getBoundingClientRect();
        const xPct = (p.x / rect.width) * 100;
        const yPct = (p.y / rect.height) * 100;
        clickRef.current(e.lngLat.lat, e.lngLat.lng, xPct, yPct);
      });
      setMap(m);
    });
    return () => {
      cancelAnimationFrame(frame);
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      created?.remove();
      setMap(null);
    };
  }, [token, interactive]);

  // Sync markers whenever pins change (or once the deferred map lands).
  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    // The construction effect's cleanup removes the map, but setMap(null) only
    // lands on the NEXT render — so for one commit (token change, dev Fast
    // Refresh) this effect can re-run while state still holds the removed
    // instance. A removed map has no canvas container (Map.remove() sets it
    // undefined) and Marker.addTo would crash reading .appendChild of it.
    if (!map || !map.getCanvasContainer()) return;
    for (const pin of pins) {
      // Mapbox owns the OUTER marker element's transform, so put .mpin styling on an
      // INNER child (its own rotate/translate does not fight Mapbox's positioning).
      // Real <button>: focusable + named for AT (Wave 3 UI-12).
      const el = document.createElement('div');
      const inner = document.createElement('button');
      inner.type = 'button';
      inner.className = pin.kind === 'job' ? 'mpin mpin-job' : pin.kind === 'dot' ? 'mpin mpin-dot' : 'mpin';
      inner.title = pin.label;
      inner.setAttribute('aria-label', pin.label);
      inner.style.setProperty('--pc', pinColor(pin));
      inner.innerHTML = '<i></i>';
      inner.addEventListener('click', ev => {
        ev.stopPropagation();
        const p = map.project([pin.lng, pin.lat]);
        const rect = map.getContainer().getBoundingClientRect();
        onPinClick(pin, (p.x / rect.width) * 100, (p.y / rect.height) * 100);
      });
      el.appendChild(inner);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [map, pins, onPinClick]);

  // Fly to a searched address and drop a temporary highlight marker. `seq` changes
  // on every selection, so re-picking the same address still re-flies. The marker
  // clears on the next selection or any map click.
  useEffect(() => {
    if (!map || !flyTo || !map.getCanvasContainer()) return; // removed-map guard, see marker effect
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 16, ...FLY_TO_OPTS });
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = new mapboxgl.Marker({ color: '#f5a623' })
      .setLngLat([flyTo.lng, flyTo.lat])
      .addTo(map);
  }, [map, flyTo]);

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

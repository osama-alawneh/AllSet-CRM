// Pure equirectangular projection over a fixed Iowa City bounding box. Bounds are the
// extent of the seed coordinates (supabase/seed.sql lines 27-36) padded out so every
// seed pin lands comfortably inside 0-100%. North (high lat) maps to the top (yPct 0).
export const MAP_BOUNDS = {
  minLat: 41.648,
  maxLat: 41.673,
  minLng: -91.548,
  maxLng: -91.510,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function project(lat: number, lng: number): { xPct: number; yPct: number } {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const xPct = clamp(((lng - minLng) / (maxLng - minLng)) * 100, 0, 100);
  const yPct = clamp(((maxLat - lat) / (maxLat - minLat)) * 100, 0, 100);
  return { xPct, yPct };
}

export function unproject(xPct: number, yPct: number): { lat: number; lng: number } {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const x = clamp(xPct, 0, 100) / 100;
  const y = clamp(yPct, 0, 100) / 100;
  return {
    lng: minLng + x * (maxLng - minLng),
    lat: maxLat - y * (maxLat - minLat),
  };
}

// Runtime choice of map implementation. An empty/whitespace token (our .env.local
// default) means "no Mapbox" — render the schematic fallback. Kept pure so the
// branch is unit-tested without a DOM (vitest runs in the node environment).
export function pickMapImpl(token: string | null | undefined): 'mapbox' | 'schematic' {
  return token && token.trim() ? 'mapbox' : 'schematic';
}

// One style for every Mapbox surface (/map + dashboard MiniMap): the simple
// vector streets look (house numbers render natively at high zoom). Owner
// decision 2026-07-14: satellite is gone, no toggle.
export const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

// Camera animation options shared by every flyTo caller. mapbox default speed
// is 1.2; 2.4 ≈ halves the flight time (owner: "faster map animations").
export const FLY_TO_OPTS = { speed: 2.4 } as const;

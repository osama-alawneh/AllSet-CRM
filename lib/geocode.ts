import { MAP_BOUNDS } from '@/lib/geo';

export type GeocodeSuggestion = { id: string; name: string; lat: number; lng: number };

// Proximity bias: center of the fixed service-area bounds. Good enough for a
// one-town CRM and avoids plumbing live map center through refs.
const PROXIMITY = `${(MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2},${(MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2}`;

export function geocodeUrl(q: string, token: string): string {
  const p = new URLSearchParams({
    q,
    autocomplete: 'true',
    limit: '5',
    proximity: PROXIMITY,
    access_token: token,
  });
  return `https://api.mapbox.com/search/geocode/v6/forward?${p}`;
}

// Defensive parse of the v6 GeoJSON response: any shape surprise yields [] (the
// search UI shows "No results"), never a crash in the client.
export function parseGeocodeResponse(json: unknown): GeocodeSuggestion[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: GeocodeSuggestion[] = [];
  for (const f of features) {
    const ft = f as {
      id?: unknown;
      geometry?: { coordinates?: unknown[] };
      properties?: { full_address?: unknown; name?: unknown };
    };
    const coords = ft?.geometry?.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    const name = String(ft?.properties?.full_address ?? ft?.properties?.name ?? '');
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !name) continue;
    out.push({ id: String(ft?.id ?? `${lng},${lat}`), name, lat, lng });
  }
  return out;
}

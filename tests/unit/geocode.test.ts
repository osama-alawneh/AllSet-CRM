import { describe, it, expect } from 'vitest';
import { geocodeUrl, parseGeocodeResponse } from '@/lib/geocode';
import { MAP_BOUNDS } from '@/lib/geo';

describe('geocodeUrl', () => {
  it('targets the v6 forward endpoint with autocomplete, limit and token', () => {
    const u = new URL(geocodeUrl('123 Main St', 'pk.test'));
    expect(u.origin + u.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(u.searchParams.get('q')).toBe('123 Main St');
    expect(u.searchParams.get('autocomplete')).toBe('true');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('access_token')).toBe('pk.test');
  });
  it('biases proximity to the MAP_BOUNDS center as "lng,lat"', () => {
    const u = new URL(geocodeUrl('x', 't'));
    const [lng, lat] = u.searchParams.get('proximity')!.split(',').map(Number);
    expect(lng).toBeCloseTo((MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2, 6);
    expect(lat).toBeCloseTo((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2, 6);
  });
  it('URL-encodes the query', () => {
    expect(geocodeUrl('a&b c', 't')).toContain('q=a%26b+c'); // URLSearchParams encoding
  });
});

describe('parseGeocodeResponse', () => {
  const feature = (name: string, lng: number, lat: number, id = 'f1') => ({
    id,
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { full_address: name },
  });

  it('maps features to suggestions using geometry coordinates [lng, lat]', () => {
    const out = parseGeocodeResponse({ features: [feature('123 Main St, Iowa City', -91.53, 41.66)] });
    expect(out).toEqual([{ id: 'f1', name: '123 Main St, Iowa City', lat: 41.66, lng: -91.53 }]);
  });
  it('falls back to properties.name when full_address is missing', () => {
    const f = feature('', -91.5, 41.6);
    f.properties = { name: 'Iowa City' } as never;
    expect(parseGeocodeResponse({ features: [f] })[0].name).toBe('Iowa City');
  });
  it('returns [] for malformed payloads without throwing', () => {
    expect(parseGeocodeResponse(null)).toEqual([]);
    expect(parseGeocodeResponse({})).toEqual([]);
    expect(parseGeocodeResponse({ features: [{}] })).toEqual([]);
    expect(parseGeocodeResponse({ features: [{ geometry: { coordinates: ['x', 'y'] }, properties: {} }] })).toEqual([]);
  });
});

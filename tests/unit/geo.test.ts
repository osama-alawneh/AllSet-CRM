import { describe, it, expect } from 'vitest';
import { MAP_BOUNDS, project, unproject, pickMapImpl } from '@/lib/geo';

// The 10 Detroit seed coordinates (supabase/seed.sql lines 27-36).
const SEED_COORDS: [number, number][] = [
  [42.3310, -83.0450], [42.3365, -83.0398], [42.3342, -83.0521], [42.3288, -83.0477],
  [42.3401, -83.0333], [42.3255, -83.0555], [42.3377, -83.0444], [42.3299, -83.0511],
  [42.3410, -83.0480], [42.3350, -83.0300],
];

describe('project / unproject', () => {
  it('round-trips a point back to itself', () => {
    const { xPct, yPct } = project(42.33, -83.04);
    const { lat, lng } = unproject(xPct, yPct);
    expect(lat).toBeCloseTo(42.33, 5);
    expect(lng).toBeCloseTo(-83.04, 5);
  });
  it('lands every seed coordinate inside 0-100', () => {
    for (const [lat, lng] of SEED_COORDS) {
      const { xPct, yPct } = project(lat, lng);
      expect(xPct).toBeGreaterThanOrEqual(0);
      expect(xPct).toBeLessThanOrEqual(100);
      expect(yPct).toBeGreaterThanOrEqual(0);
      expect(yPct).toBeLessThanOrEqual(100);
    }
  });
  it('clamps out-of-bounds coordinates to the edges', () => {
    const north = project(MAP_BOUNDS.maxLat + 1, MAP_BOUNDS.minLng - 1);
    expect(north.yPct).toBe(0);   // north (high lat) is the top edge
    expect(north.xPct).toBe(0);   // west of min lng clamps left
    const east = project(MAP_BOUNDS.minLat - 1, MAP_BOUNDS.maxLng + 1);
    expect(east.yPct).toBe(100);
    expect(east.xPct).toBe(100);
  });
  it('clamps unproject percentages into the bounds', () => {
    expect(unproject(-50, 150).lng).toBeCloseTo(MAP_BOUNDS.minLng, 6);
    expect(unproject(-50, 150).lat).toBeCloseTo(MAP_BOUNDS.minLat, 6);
    expect(unproject(150, -50).lng).toBeCloseTo(MAP_BOUNDS.maxLng, 6);
    expect(unproject(150, -50).lat).toBeCloseTo(MAP_BOUNDS.maxLat, 6);
  });
});

describe('pickMapImpl', () => {
  it('falls back to the schematic map when there is no token', () => {
    expect(pickMapImpl('')).toBe('schematic');
    expect(pickMapImpl('   ')).toBe('schematic');
    expect(pickMapImpl(null)).toBe('schematic');
    expect(pickMapImpl(undefined)).toBe('schematic');
  });
  it('uses mapbox when a token is present', () => {
    expect(pickMapImpl('pk.eyJ...')).toBe('mapbox');
  });
});

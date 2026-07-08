import { describe, it, expect } from 'vitest';
import { MAP_BOUNDS, project, unproject, pickMapImpl } from '@/lib/geo';

// The 10 Iowa City seed coordinates (supabase/seed.sql lines 27-36).
const SEED_COORDS: [number, number][] = [
  [41.6590, -91.5330], [41.6645, -91.5278], [41.6622, -91.5401], [41.6568, -91.5357],
  [41.6681, -91.5213], [41.6535, -91.5435], [41.6657, -91.5324], [41.6579, -91.5391],
  [41.6690, -91.5360], [41.6630, -91.5180],
];

describe('project / unproject', () => {
  it('round-trips a point back to itself', () => {
    const { xPct, yPct } = project(41.661, -91.530);
    const { lat, lng } = unproject(xPct, yPct);
    expect(lat).toBeCloseTo(41.661, 5);
    expect(lng).toBeCloseTo(-91.530, 5);
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

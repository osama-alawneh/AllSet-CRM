// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

// Faithful stand-in for the mapbox-gl contract under test: Map.remove() drops
// the canvas container (mapbox-gl 3.25 sets _canvasContainer = void 0), and
// Marker.addTo does map.getCanvasContainer().appendChild(el) — exactly the
// line that crashes on a removed map.
vi.mock('mapbox-gl', () => {
  class FakeMap {
    _canvasContainer: HTMLElement | undefined = document.createElement('div');
    constructor() { (globalThis as unknown as { __fakeMaps: FakeMap[] }).__fakeMaps.push(this); }
    on() {}
    project() { return { x: 0, y: 0 }; }
    getContainer() { return document.createElement('div'); }
    getCanvasContainer() { return this._canvasContainer as HTMLElement; }
    flyTo() {}
    addControl() {}
    remove() { this._canvasContainer = undefined; }
  }
  class FakeMarker {
    _el: HTMLElement;
    constructor(opts: { element?: HTMLElement } = {}) { this._el = opts.element ?? document.createElement('div'); }
    setLngLat() { return this; }
    addTo(map: FakeMap) { map.getCanvasContainer().appendChild(this._el); return this; }
    remove() { return this; }
  }
  class FakeGeolocateControl {}
  return { default: { Map: FakeMap, Marker: FakeMarker, GeolocateControl: FakeGeolocateControl, accessToken: '' } };
});
import { MapboxMap } from '@/components/map/MapboxMap';
import type { MapPin } from '@/lib/mapPins';

type FakeMapT = { _canvasContainer: HTMLElement | undefined; remove: () => void };
const g = globalThis as unknown as { __fakeMaps: FakeMapT[] };

const pins: MapPin[] = [{ kind: 'dot', id: 1, lat: 41.6, lng: -91.5, status: 'unmarked', label: 'D' }];
const noopMap = () => {};
const noopPin = () => {};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { g.__fakeMaps = []; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
const render = (ui: React.ReactElement) => act(() => root.render(ui));
const nextFrame = () => act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });

describe('MapboxMap removed-map window', () => {
  it('marker effect survives the one-commit window where state still holds a removed map', async () => {
    render(<MapboxMap pins={[]} canCreate overlay={null} onMapClick={noopMap} onPinClick={noopPin} token="a" />);
    await nextFrame(); // deferred construction lands: map#1 in state
    expect(g.__fakeMaps).toHaveLength(1);
    // token change re-runs the construction effect: its cleanup removes map#1,
    // but setMap(null) only applies next render — the marker effect re-runs in
    // the SAME commit (pins also changed) against the removed map#1. Pre-fix
    // this throws the production TypeError (.appendChild of undefined).
    render(<MapboxMap pins={pins} canCreate overlay={null} onMapClick={noopMap} onPinClick={noopPin} token="b" />);
    await nextFrame(); // map#2 lands; markers attach to it
    expect(g.__fakeMaps).toHaveLength(2);
    expect(g.__fakeMaps[0]._canvasContainer).toBeUndefined(); // map#1 really removed
    expect(g.__fakeMaps[1]._canvasContainer?.querySelectorAll('.mpin')).toHaveLength(1); // pin landed on the live map
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, StrictMode } from 'react';
import React from 'react';

// Regression: mapbox-gl's telemetry crashes ("this.errorCb is not a function") when a
// Map is removed while its telemetry request is in flight. React StrictMode's dev
// double-mount guaranteed exactly that: mount -> new Map() -> cleanup remove() ->
// remount. MapboxMap now defers construction one animation frame with cancellation,
// so the throwaway StrictMode mount never constructs a Map at all.
const mapInstances: Array<{ remove: ReturnType<typeof vi.fn> }> = [];
const markerInstances: Array<Record<string, unknown>> = [];

vi.mock('mapbox-gl', () => {
  class FakeMap {
    remove = vi.fn();
    on = vi.fn();
    project = vi.fn(() => ({ x: 0, y: 0 }));
    flyTo = vi.fn();
    getContainer = vi.fn(() => document.createElement('div'));
    constructor() {
      mapInstances.push(this);
    }
  }
  class FakeMarker {
    remove = vi.fn();
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
    element: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      this.element = opts.element;
      markerInstances.push(this as unknown as Record<string, unknown>);
    }
  }
  return { default: { Map: FakeMap, Marker: FakeMarker, accessToken: '' } };
});
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

import { MapboxMap } from '@/components/map/MapboxMap';

// Deterministic rAF queue: callbacks fire only when we flush, mirroring the real
// browser (StrictMode's mount/cleanup/mount cycle completes before any frame).
let rafQueue: Map<number, FrameRequestCallback>;
let rafId: number;

function flushFrames() {
  const pending = [...rafQueue.values()];
  rafQueue.clear();
  pending.forEach(cb => cb(performance.now()));
}

const pins = [
  { id: 1, kind: 'lead' as const, lat: 42.3, lng: -83.0, label: 'Lead pin', status: 'new' as const },
  { id: 7, kind: 'dot' as const, lat: 42.33, lng: -83.03, label: 'Dot pin', status: 'no' as const },
];

function baseProps() {
  return {
    pins,
    canCreate: false,
    overlay: null,
    onMapClick: vi.fn(),
    onPinClick: vi.fn(),
    token: 'pk.test',
    height: 300,
  };
}

describe('MapboxMap StrictMode lifecycle', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    rafQueue = new Map();
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.set(++rafId, cb);
      return rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue.delete(id);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('constructs exactly one Map under StrictMode double-mount (throwaway mount cancelled)', () => {
    act(() => {
      root.render(
        <StrictMode>
          <MapboxMap {...baseProps()} />
        </StrictMode>,
      );
    });
    // StrictMode ran effect -> cleanup -> effect before any frame: nothing built yet.
    expect(mapInstances.length).toBe(0);
    act(() => flushFrames());
    expect(mapInstances.length).toBe(1);
    expect(mapInstances[0].remove).not.toHaveBeenCalled();
  });

  it('syncs pin markers once the deferred map exists', () => {
    act(() => {
      root.render(
        <StrictMode>
          <MapboxMap {...baseProps()} />
        </StrictMode>,
      );
    });
    act(() => flushFrames());
    // One marker per pin even though the pins effect first ran before the map existed.
    expect(markerInstances.length).toBe(2);
    const dotEl = (markerInstances[1] as unknown as { element: HTMLElement }).element;
    expect(dotEl.querySelector('.mpin-dot')).toBeTruthy();
  });

  it('removes the map on unmount', () => {
    act(() => {
      root.render(
        <StrictMode>
          <MapboxMap {...baseProps()} />
        </StrictMode>,
      );
    });
    act(() => flushFrames());
    act(() => root.unmount());
    expect(mapInstances[0].remove).toHaveBeenCalledTimes(1);
    // Re-render something else so afterEach's unmount is a no-op double call.
    root = createRoot(container);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { MiniMap } from '@/components/dashboard/MiniMap';
import type { MapPin } from '@/lib/mapPins';

const pins: MapPin[] = [
  { kind: 'lead', id: 3, lat: 42.3, lng: -83.0, status: 'new', label: 'Lead' },
  { kind: 'dot', id: 3, lat: 42.4, lng: -83.1, status: 'yes', label: 'Dot' }, // same id as the lead — collision guard
];

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe('MiniMap', () => {
  it('renders dot pins and routes them to plain /map (never a lead drawer)', () => {
    act(() => root.render(<MiniMap pins={pins} token={null} />));
    expect(container.querySelector('.mpin-dot')).toBeTruthy();
    act(() => { (container.querySelector('.mpin-dot') as HTMLButtonElement).click(); });
    expect(push).toHaveBeenCalledWith('/map');
    act(() => { (container.querySelector('.mpin:not(.mpin-dot)') as HTMLButtonElement).click(); });
    expect(push).toHaveBeenCalledWith('/map?l=3');
  });
});

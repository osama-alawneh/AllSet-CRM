// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/app/(app)/map/actions', () => ({
  createDot: vi.fn(async () => ({ id: 99 })),
  updateDot: vi.fn(async () => ({})),
  deleteDot: vi.fn(async () => ({})),
  convertDotToLead: vi.fn(async () => ({})),
  convertDotToJob: vi.fn(async () => ({})),
}));
import { createDot } from '@/app/(app)/map/actions';
import { MapView } from '@/components/map/MapView';
import type { MapPin } from '@/lib/mapPins';
import type { Dot } from '@/lib/dots';

const dots: Dot[] = [{ id: 7, lat: 42.33, lng: -83.03, label: '12 Oak St', notes: '', status: 'no' }];
const pins: MapPin[] = [
  { kind: 'lead', id: 1, lat: 42.3, lng: -83.0, status: 'new', label: 'Lead A' },
  { kind: 'dot', id: 7, lat: 42.33, lng: -83.03, status: 'no', label: '12 Oak St — No' },
];

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
const render = (ui: React.ReactElement) => act(() => root.render(ui));
const base = { pins, dots, token: null, canCreate: true, canEditDots: true, openLeadId: null, openJobId: null };

describe('MapView dots', () => {
  it('renders dot pins with the round dot class and dot color', () => {
    render(<MapView {...base} />);
    const dotPin = container.querySelector('.mpin.mpin-dot') as HTMLElement;
    expect(dotPin).toBeTruthy();
    expect(dotPin.style.getPropertyValue('--pc')).toBe('var(--lost)');
  });
  it('shows the Dots toggle and counts pill; toggling hides dot pins only', () => {
    render(<MapView {...base} />);
    expect(container.querySelector('.dotcounts')).toBeTruthy();
    const toggle = [...container.querySelectorAll('button.chip')].find(b => b.textContent?.includes('Dots'))!;
    act(() => { (toggle as HTMLButtonElement).click(); });
    expect(container.querySelector('.mpin-dot')).toBeNull();
    expect(container.querySelector('.mpin:not(.mpin-dot)')).toBeTruthy(); // lead pin survives
  });
  it('clicking a dot pin opens the DotPopover (no navigation)', () => {
    render(<MapView {...base} />);
    act(() => { (container.querySelector('.mpin-dot') as HTMLButtonElement).click(); });
    expect(container.querySelector('.pop-dot')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
  it('clicking empty map calls createDot and opens the popup on the new id', async () => {
    render(<MapView {...base} />);
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(createDot).toHaveBeenCalled();
    expect(container.querySelector('.pop-dot')).toBeTruthy();
    // Fresh dot (id 99) is absent from props — the placeholder must carry the
    // clicked coords (jsdom 0×0 rect → unproject(0,0)) as data attrs, not 0.0000.
    const card = container.querySelector('.pop-dot')!;
    expect(card.getAttribute('data-lat')).toBe('41.6730');
    expect(card.getAttribute('data-lng')).toBe('-91.5480');
  });
  it('surfaces a createDot failure as an alert and opens no popup', async () => {
    vi.mocked(createDot).mockResolvedValueOnce({ error: 'boom' });
    render(<MapView {...base} />);
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('boom');
    expect(container.querySelector('.pop-dot')).toBeNull();
    // Next click succeeds — error clears, popup opens.
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(container.querySelector('[role="alert"].form-err')).toBeNull();
    expect(container.querySelector('.pop-dot')).toBeTruthy();
  });
  it('cleaner (canEditDots=false, canCreate=false): dot click opens read-only popup, map click does nothing', async () => {
    render(<MapView {...base} canCreate={false} canEditDots={false} />);
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(createDot).not.toHaveBeenCalled();
    act(() => { (container.querySelector('.mpin-dot') as HTMLButtonElement).click(); });
    expect(container.querySelector('.pop')).toBeTruthy();
    expect(container.querySelector('.pop input')).toBeNull();
  });
  it('popup closes when its dot disappears from props (teammate delete / convert landed)', () => {
    render(<MapView {...base} />);
    act(() => { (container.querySelector('.mpin-dot') as HTMLButtonElement).click(); });
    expect(container.querySelector('.pop-dot')).toBeTruthy();
    render(<MapView {...base} dots={[]} pins={[pins[0]]} />);
    expect(container.querySelector('.pop-dot')).toBeNull();
  });
  it('popup closes when a drawer opens (?l= or ?j= round-trip)', () => {
    render(<MapView {...base} />);
    act(() => { (container.querySelector('.mpin-dot') as HTMLButtonElement).click(); });
    render(<MapView {...base} openJobId="5" />);
    expect(container.querySelector('.pop-dot')).toBeNull();
  });
});

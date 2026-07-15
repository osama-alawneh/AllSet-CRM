// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

vi.mock('@/app/(app)/map/actions', () => ({
  createDot: vi.fn(async () => ({ id: 99 })),
  updateDot: vi.fn(async () => ({})),
  deleteDot: vi.fn(async () => ({})),
  convertDotToLead: vi.fn(async () => ({})),
  convertDotToJob: vi.fn(async () => ({})),
}));
import { createDot, updateDot, deleteDot } from '@/app/(app)/map/actions';
import { DotPopover } from '@/components/map/DotPopover';
import { DotCounts } from '@/components/map/DotCounts';
import type { Dot } from '@/lib/dots';

const dot: Dot = { id: 7, lat: 42.3, lng: -83.0, label: '12 Oak St', notes: 'big dog', status: 'callback' };

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const render = (ui: React.ReactElement) => act(() => root.render(ui));
const byText = (t: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(t));

describe('DotPopover main view', () => {
  it('shows label/notes inputs, five status chips (current selected), Save/Lead/Job/Delete', () => {
    render(<DotPopover dot={dot} canEdit xPct={50} yPct={50} onClose={() => {}} />);
    expect((container.querySelector('input[name="label"]') as HTMLInputElement).value).toBe('12 Oak St');
    expect((container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement).value).toBe('big dog');
    const chips = container.querySelectorAll('button.dp-chip');
    expect(chips).toHaveLength(5);
    // color flows through the --dp-c custom property, never inline background
    expect((chips[0] as HTMLElement).style.getPropertyValue('--dp-c')).toBe('var(--won)');
    expect([...chips].every(c => c.querySelector('i') !== null)).toBe(true);
    expect([...chips].find(c => c.textContent?.includes('Callback'))?.className).toContain('sel');
    for (const t of ['Save', 'Lead', 'Job', 'Delete Dot']) expect(byText(t)).toBeTruthy();
    const card = container.querySelector('.pop-dot') as HTMLElement;
    expect(card.getAttribute('data-lat')).toBe('42.3000');
    expect(card.getAttribute('data-lng')).toBe('-83.0000');
  });
  it('status chip click calls updateDot immediately with current fields', async () => {
    render(<DotPopover dot={dot} canEdit xPct={50} yPct={50} onClose={() => {}} />);
    await act(async () => { byText('Yes')!.click(); });
    expect(updateDot).toHaveBeenCalledWith(7, '12 Oak St', 'big dog', 'yes');
  });
  it('Delete Dot calls deleteDot and onClose', async () => {
    const onClose = vi.fn();
    render(<DotPopover dot={dot} canEdit xPct={50} yPct={50} onClose={onClose} />);
    await act(async () => { byText('Delete Dot')!.click(); });
    expect(deleteDot).toHaveBeenCalledWith(7);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DotPopover pending dot (id null)', () => {
  const pending = { id: null, lat: 42.3, lng: -83.0, label: '', notes: '', status: 'unmarked' as const };
  it('chip click creates the dot, reports it up, then updates it', async () => {
    const onCreated = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={() => {}} onCreated={onCreated} />);
    await act(async () => { byText('Yes')!.click(); });
    expect(createDot).toHaveBeenCalledWith(42.3, -83.0);
    expect(onCreated).toHaveBeenCalledWith(99);
    expect(updateDot).toHaveBeenCalledWith(99, '', '', 'yes');
  });
  it('createDot failure surfaces in the popup alert; no update, no adoption', async () => {
    vi.mocked(createDot).mockResolvedValueOnce({ error: 'boom' });
    const onCreated = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={() => {}} onCreated={onCreated} />);
    await act(async () => { byText('Yes')!.click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('boom');
    expect(updateDot).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it('Delete Dot on a pending dot just closes — no server call', async () => {
    const onClose = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={onClose} />);
    await act(async () => { byText('Delete Dot')!.click(); });
    expect(onClose).toHaveBeenCalled();
    expect(deleteDot).not.toHaveBeenCalled();
  });
});

describe('DotPopover cleaner read-only', () => {
  it('renders status/label/notes as text with no inputs or action buttons', () => {
    render(<DotPopover dot={dot} canEdit={false} xPct={50} yPct={50} onClose={() => {}} />);
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('12 Oak St');
    expect(container.textContent).toContain('Callback');
    expect(byText('Delete Dot')).toBeUndefined();
    expect(byText('Lead')).toBeUndefined();
    expect(container.textContent).not.toContain('°'); // coords left the DOM
  });
  it('unlabeled dot falls back to "Unlabeled dot" (no coords)', () => {
    render(<DotPopover dot={{ ...dot, label: '' }} canEdit={false} xPct={50} yPct={50} onClose={() => {}} />);
    expect(container.textContent).toContain('Unlabeled dot');
    expect(container.textContent).not.toContain('42.3');
  });
});

describe('DotPopover Lead page', () => {
  it('Lead button switches views; form prefills address/notes; Back returns', async () => {
    render(<DotPopover dot={dot} canEdit xPct={50} yPct={50} onClose={() => {}} />);
    await act(async () => { byText('Lead')!.click(); });
    expect((container.querySelector('input[name="address"]') as HTMLInputElement).value).toBe('12 Oak St');
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe('big dog');
    expect((container.querySelector('select[name="status"]') as HTMLSelectElement).value).toBe('new');
    expect((container.querySelector('select[name="service"]') as HTMLSelectElement).value).toBe('Window Cleaning');
    expect(byText('Save Lead')).toBeTruthy();
    await act(async () => { byText('Back')!.click(); });
    expect(byText('Save Lead')).toBeUndefined();
    expect(byText('Save')).toBeTruthy();
  });
});

describe('DotPopover Job page', () => {
  it('Job button shows job form with Cleaners Pay + schedule fields', async () => {
    render(<DotPopover dot={dot} canEdit xPct={50} yPct={50} onClose={() => {}} />);
    await act(async () => { byText('Job')!.click(); });
    expect(container.querySelector('input[name="price"]')).toBeTruthy();
    expect(container.querySelector('input[name="cleaner_amount"]')).toBeTruthy();
    expect(container.textContent).toContain('Cleaners Pay');
    expect((container.querySelector('input[name="scheduled_date"]') as HTMLInputElement).type).toBe('datetime-local');
    expect(byText('Save Job')).toBeTruthy();
  });
});

describe('DotCounts', () => {
  it('renders one count per status over the given dots', () => {
    const dots: Dot[] = [
      { ...dot, id: 1, status: 'yes' }, { ...dot, id: 2, status: 'yes' },
      { ...dot, id: 3, status: 'no' }, { ...dot, id: 4, status: 'unmarked' },
    ];
    render(<DotCounts dots={dots} />);
    const text = container.textContent ?? '';
    expect(text).toContain('2'); // yes
    expect(container.querySelectorAll('.dotcounts i')).toHaveLength(5); // all five statuses always shown
  });
});

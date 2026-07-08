// @vitest-environment jsdom
//
// Task 13 Step 6: guards the exact contract Wave 2's review flagged as Critical —
// LeadCard's dnd-kit wiring must put the pointer (mouse/touch) drag activators on the
// card root, the FULL activator set (incl. keyboard) on the `.draghandle` button only,
// and the title button must open the drawer on click regardless of drag plumbing.
// lint/tsc/pure-unit tests cannot see this class of bug because it's about which DOM
// node a prop spread lands on, not the data it carries.
//
// dnd-kit's `useDraggable` is mocked (not run inside a real DndContext) so this test
// asserts LeadCard's own wiring in isolation, per the brief's preference for testing
// "rendered DOM attributes/handlers rather than dnd-kit internals."
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LeadCard } from '@/components/leads/LeadCard';
import type { Lead } from '@/lib/leads';

const { mouseDownSpy, touchStartSpy, keyDownSpy } = vi.hoisted(() => ({
  mouseDownSpy: vi.fn(),
  touchStartSpy: vi.fn(),
  keyDownSpy: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: { 'aria-roledescription': 'draggable', tabIndex: 0 },
    listeners: { onMouseDown: mouseDownSpy, onTouchStart: touchStartSpy, onKeyDown: keyDownSpy },
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
}));

const lead: Lead = {
  id: 42,
  customer_id: 1,
  status: 'new',
  service: 'Full clean',
  description: null,
  stories: 2,
  panes: 12,
  note: null,
  quote_value: 500,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  customer_name: 'Acme Windows',
  address: '1 Main St',
  phone: '555-1234',
  email: null,
  lat: null,
  lng: null,
};

function setup(onOpen = vi.fn(), draggable = true) {
  const utils = render(<LeadCard lead={lead} admin={false} draggable={draggable} onOpen={onOpen} />);
  const root = utils.container.querySelector('.card2') as HTMLElement;
  const handle = utils.container.querySelector('.draghandle') as HTMLElement;
  const title = utils.container.querySelector('.cardlink.addr') as HTMLElement;
  return { onOpen, root, handle, title };
}

describe('LeadCard drag/keyboard contract (Task 7)', () => {
  it('root carries the mouse activator listener', () => {
    const { root } = setup();
    expect(root).toBeTruthy();
    fireEvent.mouseDown(root);
    expect(mouseDownSpy).toHaveBeenCalledTimes(1);
  });

  it('root carries the touch activator listener', () => {
    const { root } = setup();
    fireEvent.touchStart(root);
    expect(touchStartSpy).toHaveBeenCalledTimes(1);
  });

  it('root does NOT carry the keyboard activator (reserved for .draghandle only)', () => {
    const { root } = setup();
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(keyDownSpy).not.toHaveBeenCalled();
  });

  it('.draghandle carries the keyboard activator attributes/listeners', () => {
    const { handle } = setup();
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('aria-roledescription')).toBe('draggable');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(keyDownSpy).toHaveBeenCalledTimes(1);
  });

  it('title button click calls onOpen with the lead id', () => {
    const { onOpen, title } = setup();
    expect(title).toBeTruthy();
    fireEvent.click(title);
    expect(onOpen).toHaveBeenCalledWith(42);
  });
});

describe('LeadCard drag handle gating (rider 2)', () => {
  it('renders .draghandle when draggable is true', () => {
    const { handle } = setup(vi.fn(), true);
    expect(handle).toBeTruthy();
  });

  it('omits .draghandle when draggable is false', () => {
    const { handle } = setup(vi.fn(), false);
    expect(handle).toBeFalsy();
  });
});

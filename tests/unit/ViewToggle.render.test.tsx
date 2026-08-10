// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { ViewToggle } from '@/components/ui/ViewToggle';

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const buttons = () => [...container.querySelectorAll('button')];
const byText = (t: string) => buttons().find(b => b.textContent?.includes(t))!;

describe('ViewToggle', () => {
  it('renders Board, List and Calendar', () => {
    act(() => root.render(<ViewToggle view="board" base="/leads" />));
    expect(buttons()).toHaveLength(3);
    expect(container.textContent).toContain('Calendar');
  });

  it('marks exactly the active view as pressed', () => {
    act(() => root.render(<ViewToggle view="calendar" base="/leads" />));
    const pressed = buttons().filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain('Calendar');
    expect(pressed[0].className).toContain('on');
  });

  it('pushes the right URL per view on /leads', () => {
    act(() => root.render(<ViewToggle view="board" base="/leads" />));
    act(() => { byText('Calendar').click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=calendar', { scroll: false });
    act(() => { byText('List').click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=list', { scroll: false });
    act(() => { byText('Board').click(); });
    expect(push).toHaveBeenCalledWith('/leads', { scroll: false });
  });

  it('pushes the right URL per view on /jobs', () => {
    act(() => root.render(<ViewToggle view="list" base="/jobs" />));
    act(() => { byText('Calendar').click(); });
    expect(push).toHaveBeenCalledWith('/jobs?view=calendar', { scroll: false });
    act(() => { byText('Board').click(); });
    expect(push).toHaveBeenCalledWith('/jobs', { scroll: false });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

import { ThemeToggle } from '@/components/shell/ThemeToggle';

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const btn = () => container.querySelector('button')!;

describe('ThemeToggle', () => {
  it('keeps its accessible name on the button, not in the visible word', () => {
    act(() => root.render(<ThemeToggle initial="dark" />));
    expect(btn().getAttribute('aria-label')).toBe('Toggle dark mode');
  });

  it('splits the glyph from the word so narrow widths can hide the word alone', () => {
    act(() => root.render(<ThemeToggle initial="dark" />));
    const glyph = btn().querySelector('.tglglyph')!;
    const word = btn().querySelector('.tglword')!;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(word.textContent).toBe('Light');
    // The word must be its own element — hiding it must not take the glyph with it.
    expect(glyph.contains(word)).toBe(false);
  });

  it('flips glyph and word together on click', () => {
    act(() => root.render(<ThemeToggle initial="dark" />));
    expect(btn().querySelector('.tglword')!.textContent).toBe('Light');
    act(() => { btn().click(); });
    expect(btn().querySelector('.tglword')!.textContent).toBe('Dark');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

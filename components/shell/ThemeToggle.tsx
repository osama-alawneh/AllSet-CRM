'use client';
import { useState } from 'react';

export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [dark, setDark] = useState(initial === 'dark');
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
    // Keep browser chrome in sync — must match generateViewport's themeColor in app/layout.tsx.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#dfe8f6' : '#0b1220');
    setDark(!dark);
  };
  return (
    // Glyph and word are separate elements so the narrow-phone rule can drop the word
    // without the glyph; aria-label carries the name either way.
    <button className="iconbtn" onClick={toggle} aria-label="Toggle dark mode">
      <span className="tglglyph" aria-hidden="true">{dark ? '◑' : '◐'}</span>
      <span className="tglword">{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

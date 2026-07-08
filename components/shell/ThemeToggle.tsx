'use client';
import { useState } from 'react';

export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [dark, setDark] = useState(initial === 'dark');
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
    // Keep browser chrome in sync — must match generateViewport's themeColor in app/layout.tsx.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#e9eef3' : '#070d18');
    setDark(!dark);
  };
  return (
    <button className="iconbtn" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? '◑ Light' : '◐ Dark'}
    </button>
  );
}

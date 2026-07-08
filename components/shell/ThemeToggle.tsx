'use client';
import { useState } from 'react';

export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [dark, setDark] = useState(initial === 'dark');
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
    setDark(!dark);
  };
  return (
    <button className="iconbtn" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? '◑ Light' : '◐ Dark'}
    </button>
  );
}

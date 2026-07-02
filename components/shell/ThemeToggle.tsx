'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);
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

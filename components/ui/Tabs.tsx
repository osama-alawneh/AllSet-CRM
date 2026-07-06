'use client';
import { useState } from 'react';

export function Tabs({ tabs }: { tabs: { key: string; label: string; content: React.ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} type="button" className={t.key === on ? 'on' : ''} onClick={() => setOn(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div key={t.key} className={`tabpane ${t.key === on ? 'on' : ''}`}>
          {t.content}
        </div>
      ))}
    </>
  );
}

'use client';
import { useId, useState } from 'react';

export function Tabs({
  tabs, label,
}: {
  tabs: { key: string; label: string; content: React.ReactNode }[];
  label: string;
}) {
  const [on, setOn] = useState(tabs[0]?.key);
  const uid = useId();
  const idx = Math.max(0, tabs.findIndex(t => t.key === on));
  const tabId = (k: string) => `${uid}-tab-${k}`;
  const paneId = (k: string) => `${uid}-pane-${k}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setOn(next.key);
    document.getElementById(tabId(next.key))?.focus();
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map(t => (
          <button
            key={t.key} type="button" id={tabId(t.key)} role="tab"
            aria-selected={t.key === on} aria-controls={paneId(t.key)}
            tabIndex={t.key === on ? 0 : -1}
            className={t.key === on ? 'on' : ''} onClick={() => setOn(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div
          key={t.key} id={paneId(t.key)} role="tabpanel" aria-labelledby={tabId(t.key)}
          hidden={t.key !== on} className="tabpane on"
        >
          {t.content}
        </div>
      ))}
    </>
  );
}

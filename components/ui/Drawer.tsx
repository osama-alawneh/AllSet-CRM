'use client';
import { useEffect } from 'react';

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer box open" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  );
}

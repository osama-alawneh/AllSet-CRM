'use client';
import { useEffect, useRef } from 'react';

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Move focus into the dialog on mount so keyboard users land inside it, not back at the trigger.
  // Calling focus() in an effect is fine — it is a DOM side effect, not a setState loop.
  useEffect(() => {
    ref.current?.focus();
  }, []);
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
      <aside ref={ref} tabIndex={-1} className="drawer box open" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  );
}

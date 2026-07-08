'use client';
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  onClose, labelId, children,
}: {
  onClose: () => void;
  labelId?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // Mount: remember the trigger, move focus in, lock body scroll. Unmount: undo both.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // Trap Tab inside the dialog (aria-modal promises this; the old version didn't deliver).
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (f.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      if (!ref.current.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside ref={ref} tabIndex={-1} className="drawer box open" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        {children}
      </aside>
    </>
  );
}

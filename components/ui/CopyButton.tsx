'use client';
import { useState } from 'react';

export function CopyButton({ value, label = 'Copy phone number' }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="copybtn"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          // clipboard unavailable (insecure context / permission) — silent no-op beats a crash
        }
      }}
    >
      {ok ? '✓ Copied' : '⧉ Copy'}
    </button>
  );
}

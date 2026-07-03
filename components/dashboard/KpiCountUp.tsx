'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtMoney } from '@/lib/invoices';

// `format` is a string literal (not a closure) because this is a Client Component: functions
// created in the Server Component caller cannot cross the RSC boundary as props (only Server
// Actions and serializable data can) — see next.js/dist/docs on Server/Client composition.
export function KpiCountUp({
  end, prefix = '', suffix = '', format,
}: {
  end: number;
  prefix?: string;
  suffix?: string;
  format?: 'money';
}) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setVal(end));
      return () => cancelAnimationFrame(id);
    }
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min((t - t0) / 900, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(end * e);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [end]);
  const shown = format === 'money' ? fmtMoney(Math.round(val)) : String(Math.round(val));
  return <span>{prefix}{shown}{suffix}</span>;
}

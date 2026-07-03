'use client';
import { useEffect, useRef, useState } from 'react';

export function KpiCountUp({
  end, prefix = '', suffix = '', format,
}: {
  end: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
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
  const shown = format ? format(val) : String(Math.round(val));
  return <span>{prefix}{shown}{suffix}</span>;
}

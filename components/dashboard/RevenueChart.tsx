'use client';
import { useEffect, useRef } from 'react';

export function RevenueChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const cs = getComputedStyle(document.documentElement);
      const acc = cs.getPropertyValue('--accent').trim();
      const ink = cs.getPropertyValue('--ink').trim();
      const gl = cs.getPropertyValue('--line').trim();
      const dpr = devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const c = cv.getContext('2d');
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      const d = data.length ? data : new Array(14).fill(0);
      const max = Math.max(30, ...d), pad = 4;
      const X = (i: number) => (i / (d.length - 1)) * (w - pad * 2) + pad;
      const Y = (v: number) => h - 10 - (v / max) * (h - 24);
      c.strokeStyle = gl; c.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = 10 + (i * (h - 24)) / 4;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, acc + '55'); g.addColorStop(1, acc + '00');
      c.beginPath(); c.moveTo(X(0), Y(d[0])); d.forEach((v, i) => c.lineTo(X(i), Y(v)));
      c.lineTo(X(d.length - 1), h); c.lineTo(X(0), h); c.closePath();
      c.fillStyle = g; c.fill();
      c.beginPath(); c.moveTo(X(0), Y(d[0])); d.forEach((v, i) => c.lineTo(X(i), Y(v)));
      c.lineWidth = 2; c.strokeStyle = acc; c.stroke();
      d.forEach((v, i) => { c.beginPath(); c.rect(X(i) - 2, Y(v) - 2, 4, 4); c.fillStyle = ink; c.fill(); });
    };
    draw();
    addEventListener('resize', draw);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { removeEventListener('resize', draw); mo.disconnect(); };
  }, [data]);
  return <canvas ref={ref} style={{ width: '100%', height: 160 }} />;
}

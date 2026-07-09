// DEACTIVATED route-loading skeleton (owner call, 2026-07-09): as app/(app)/loading.tsx
// this swapped every navigation to a skeleton, making the ~200ms server render visible
// on all screens. Without a loading boundary Next keeps the previous page on screen
// until the next one is ready — the right UX while every route renders fast.
// Re-enable ONLY for a genuinely slow route by creating app/(app)/<route>/loading.tsx:
//   export { default } from '@/components/shell/RouteLoadingSkeleton';
export default function Loading() {
  return (
    <section className="screen" aria-busy="true" aria-label="Loading">
      <div className="kpis">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="kpi box" style={{ minHeight: 96, opacity: 0.55 }}>
            <span className="lbl">loading…</span>
          </div>
        ))}
      </div>
      <div className="panel box" style={{ minHeight: 260, opacity: 0.55 }}>
        <span className="lbl">fetching data…</span>
      </div>
    </section>
  );
}

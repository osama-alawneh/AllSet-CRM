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

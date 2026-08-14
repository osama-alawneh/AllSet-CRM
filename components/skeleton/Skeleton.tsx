// Route-level loading skeletons. Every piece reuses the class names of the screen it
// stands in for (.screen, .scrhead, .panel, .tbl, .kpis, .kanban), so the placeholder
// occupies the same box as the real content and the swap causes no layout shift.
//
// Server components by design: they render inside loading.tsx, which Next serves before
// any client JS for the route has run.

export function SkeletonBar({ w = '100%', h = 12 }: { w?: string; h?: number }) {
  return <span className="sk" style={{ width: w, height: h }} aria-hidden="true" />;
}

// One busy region per screen rather than one per bar: assistive tech should hear
// "loading jobs" once, not forty times.
export function SkeletonScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="screen" role="status" aria-busy="true" aria-label={`Loading ${label}`}>
      {children}
    </section>
  );
}

export function SkeletonHead({ actions = 2 }: { actions?: number }) {
  return (
    <div className="scrhead">
      <SkeletonBar w="180px" h={22} />
      <div className="sk-actions">
        {Array.from({ length: actions }, (_, i) => (
          <SkeletonBar key={i} w="92px" h={34} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <div className="panel box">
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}><SkeletonBar w="70%" h={9} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}><SkeletonBar w={c === 0 ? '80%' : '55%'} h={11} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="kpis">
      {Array.from({ length: count }, (_, i) => (
        <div className="kpi box" key={i}>
          <SkeletonBar w="55%" h={10} />
          <div className="sk-gap" />
          <SkeletonBar w="40%" h={28} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBoard({ cols = 4, cards = 3 }: { cols?: number; cards?: number }) {
  return (
    <div className="kanban">
      {Array.from({ length: cols }, (_, i) => (
        <div className="col box" key={i}>
          <SkeletonBar w="45%" h={10} />
          {Array.from({ length: cards }, (_, c) => (
            <SkeletonBar key={c} w="100%" h={62} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel box">
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar key={i} w={i === 0 ? '35%' : '100%'} h={i === 0 ? 14 : 11} />
      ))}
    </div>
  );
}

export function SkeletonFill() {
  return <div className="box sk-fill" aria-hidden="true" />;
}

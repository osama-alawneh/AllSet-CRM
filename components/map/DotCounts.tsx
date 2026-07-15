import { DOT_STATUSES, dotStatusColor, dotStatusLabel, type Dot } from '@/lib/dots';

// Counts pill (old-CRM legend): per-status count over toggle-visible dots,
// viewport-independent. All five statuses always render (gray unmarked incl.).
export function DotCounts({ dots }: { dots: Dot[] }) {
  return (
    <span className="dotcounts" aria-label="dot counts by status">
      {DOT_STATUSES.map(s => (
        <span key={s} title={dotStatusLabel[s]}>
          <i style={{ background: dotStatusColor[s] }} aria-hidden />
          {dots.filter(d => d.status === s).length}
        </span>
      ))}
    </span>
  );
}

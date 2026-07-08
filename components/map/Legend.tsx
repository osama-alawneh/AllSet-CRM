export function Legend() {
  return (
    <div className="legend">
      <span className="lg-head">Leads ◆</span>
      <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
      <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
      <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
      <span className="lg-head">Jobs ●</span>
      <span><i className="lg lg-round" style={{ background: 'var(--new)' }} /> UNCLAIMED</span>
      <span><i className="lg lg-round" style={{ background: 'var(--sched)' }} /> CLAIMED</span>
      <span><i className="lg lg-round" style={{ background: 'var(--prog)' }} /> IN PROGRESS</span>
    </div>
  );
}

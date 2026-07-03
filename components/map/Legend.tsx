export function Legend() {
  return (
    <div className="legend">
      <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
      <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
      <span><i className="lg" style={{ background: 'var(--lost)' }} /> LOST</span>
      <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
    </div>
  );
}

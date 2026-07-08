'use client';
export default function Error({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <section className="screen">
      <div className="panel box" role="alert">
        <h3>Something went wrong</h3>
        <p className="cap">{error.digest ? `Ref ${error.digest}` : 'The last request failed.'}</p>
        <button type="button" className="btn" onClick={unstable_retry}>Retry</button>
      </div>
    </section>
  );
}

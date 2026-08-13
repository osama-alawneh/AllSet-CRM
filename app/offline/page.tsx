// Static fallback served by the SW when a navigation fails offline. It lives OUTSIDE app/(app)
// so it never hits the auth layout, and it inlines all styling so it renders without cached CSS.
export default function OfflinePage() {
  return (
    <div
      id="offline-root"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#dfe8f6',
        color: '#1d2532',
      }}
    >
      {/* No external stylesheet reaches this page offline — the dark override lives inline
          here too, scoped with prefers-color-scheme so it still renders with zero network. */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          #offline-root { background: #0b1220; color: #ebeced; }
          #offline-root .offline-sub { color: #aaacb1; }
        }
      `}</style>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: '#7c3aed',
          color: '#fff',
          fontSize: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ◇
      </div>
      <h1 style={{ margin: 0, fontSize: 20 }}>You&apos;re offline</h1>
      <p className="offline-sub" style={{ margin: 0, maxWidth: 320, fontSize: 14, color: '#696f78' }}>
        AllSet needs a connection to load live data. Reconnect and try again.
      </p>
    </div>
  );
}

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
        background: '#e9eef3',
        color: '#0f1a2b',
      }}
    >
      {/* No external stylesheet reaches this page offline — the dark override lives inline
          here too, scoped with prefers-color-scheme so it still renders with zero network. */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          #offline-root { background: #070d18; color: #dce6f5; }
          #offline-root .offline-sub { color: #7d8db0; }
        }
      `}</style>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: '#2f6df6',
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
      <p className="offline-sub" style={{ margin: 0, maxWidth: 320, fontSize: 14, color: '#42506b' }}>
        AllSet needs a connection to load live data. Reconnect and try again.
      </p>
    </div>
  );
}

// Static fallback served by the SW when a navigation fails offline. It lives OUTSIDE app/(app)
// so it never hits the auth layout, and it inlines all styling so it renders without cached CSS.
export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
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
      <p style={{ margin: 0, maxWidth: 320, fontSize: 14, color: '#42506b' }}>
        ClearView needs a connection to load live data. Reconnect and try again.
      </p>
    </div>
  );
}

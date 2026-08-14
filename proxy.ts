import { createServerClient } from '@supabase/ssr';
import { timed } from '@/lib/perf';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 renamed `middleware` to `proxy` (same request-interceptor role).
// This is the canonical @supabase/ssr session-refresh layer: it runs before
// routes render, where cookie writes ARE allowed, so a stale access token gets
// refreshed and the rotated tokens are persisted via Set-Cookie on the response.
// Server Components (see lib/supabase/server.ts) can then read fresh cookies and
// safely ignore their own forbidden write attempts.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Triggers a token refresh when the access token is stale; refreshed cookies
  // are written to `response` above. Do NOT add auth-guard/redirect logic here —
  // layouts and pages keep owning that. This layer only refreshes cookies.
  await timed('proxy.getUser', () => supabase.auth.getUser());

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every app route EXCEPT static/PWA assets, so cookie refresh never
     * interferes with them and the service worker's default-deny keeps working:
     * - _next/static, _next/image  (build/static + image optimizer)
     * - favicon.ico, icon.svg      (icons)
     * - manifest.webmanifest, sw.js (PWA manifest + service worker)
     * - offline                    (precached offline fallback page)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|manifest\\.webmanifest|sw\\.js|offline).*)',
  ],
};

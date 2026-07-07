import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const supabaseServer = async () => {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // `setAll` is called from a Server Component render (e.g. when GoTrue
            // refreshes a stale token). Next.js forbids cookie writes there and
            // throws "Cookies can only be modified in a Server Action or Route
            // Handler." Swallowing is safe because proxy.ts refreshes the session
            // on every request where cookie writes ARE allowed and persists the
            // rotated tokens via Set-Cookie. See proxy.ts.
          }
        },
      },
    }
  );
};

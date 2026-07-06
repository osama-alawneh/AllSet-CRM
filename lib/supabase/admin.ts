import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-only: the service-role key bypasses RLS. NEVER import this from a client
// component — the key must not reach the browser bundle. For server-side code only
// (server components + 'use server' files); the server-only import makes any
// client-graph import a build error.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

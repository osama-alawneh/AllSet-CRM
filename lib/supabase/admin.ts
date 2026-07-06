import { createClient } from '@supabase/supabase-js';

// Server-only: the service-role key bypasses RLS. NEVER import this from a client
// component — the key must not reach the browser bundle. Only 'use server' action
// files may import it.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

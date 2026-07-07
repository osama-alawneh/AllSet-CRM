'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Realtime: subscribe to the private 'jobs' broadcast topic. The DB trigger
// (0011) sends a tiny {id,status} ping on any job insert/update; we debounce it
// (250ms trailing) into router.refresh(), which re-runs the role-split server fetch.
// Sensitive data (price/names) is NEVER in the ping — it comes back through RLS.
// Shared by JobsBoard and JobsListSection so both views refresh on the same signal.
export function useJobsRealtime() {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    (async () => {
      await sb.realtime.setAuth(); // attach the current session token for RLS on realtime.messages
      if (cancelled) return; // effect cleaned up while awaiting — don't subscribe an orphaned channel
      channel = sb
        .channel('jobs', { config: { private: true } })
        .on('broadcast', { event: 'change' }, refresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) sb.removeChannel(channel);
    };
  }, [router]);
}

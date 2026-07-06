'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="btn sec"
      type="button"
      disabled={pending}
      style={{ width: '100%', marginTop: 10 }}
      onClick={async () => {
        setPending(true);
        await supabaseBrowser().auth.signOut();
        location.assign('/login'); // full navigation so all server components refetch with no session
      }}
    >
      {pending ? 'Signing out…' : '⎋ Sign out'}
    </button>
  );
}

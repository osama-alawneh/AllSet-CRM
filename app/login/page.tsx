'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    else location.href = '/dashboard';
  }

  return (
    <main style={{ padding: 24, maxWidth: 320 }}>
      <h1>ClearView</h1>
      <form onSubmit={signIn}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        <button>Sign in</button>
        {err && <p>{err}</p>}
      </form>
    </main>
  );
}

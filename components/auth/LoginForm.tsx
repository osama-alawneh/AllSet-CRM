'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setPending(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) {
      setErr(error.message);
      setPending(false);
    } else {
      location.href = '/dashboard';
    }
  }

  return (
    <form onSubmit={signIn} className="login-form">
      <label className="lbl" htmlFor="email">Email</label>
      <input
        id="email" type="email" required autoComplete="username"
        value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
      />
      <label className="lbl" htmlFor="password">Password</label>
      <input
        id="password" type="password" required autoComplete="current-password"
        value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
      />
      <button className="btn-p" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {err && <p role="alert" style={{ color: 'var(--lost)', fontSize: 12, margin: 0 }}>{err}</p>}
    </form>
  );
}

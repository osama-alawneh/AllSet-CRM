'use client';
import { useRef, useState, useTransition } from 'react';
import { createUser, setUserRole } from '@/app/(app)/settings/actions';

export type PanelUser = {
  id: string; full_name: string; role: 'admin' | 'rep' | 'cleaner';
  email: string; created_at: string;
};
const ROLES = ['admin', 'rep', 'cleaner'] as const;

export function UsersPanel({ users, meId }: { users: PanelUser[]; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    setError(null); setNotice(null);
    startTransition(async () => {
      const res = await createUser(fd);
      if (res?.error) setError(res.error);
      else { setNotice('User created.'); formRef.current?.reset(); }
    });
  };
  const changeRole = (id: string, role: string) => {
    setError(null); setNotice(null);
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="screen">
      <div className="panel box">
        <h3>Create user</h3>
        <p className="cap">Login is active immediately (email pre-confirmed).</p>
        <form ref={formRef} action={submit} className="userform">
          <input name="full_name" placeholder="Full name" aria-label="Full name" required />
          <input name="email" type="email" placeholder="email@company.com" aria-label="Email" required />
          <input name="password" type="password" placeholder="Password (min 8)" aria-label="Password" required minLength={8} />
          <select name="role" defaultValue="rep" aria-label="Role">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn" type="submit" disabled={pending}>{pending ? '…' : '+ Create'}</button>
        </form>
        {error && <p role="alert" className="form-err">{error}</p>}
        {notice && <p style={{ color: 'var(--won)', fontSize: 12 }}>{notice}</p>}
      </div>
      <div className="panel box">
        <h3>Users ({users.length})</h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Since</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.full_name}</b>{u.id === meId ? <small style={{ color: 'var(--muted)' }}> (you)</small> : null}</td>
                  <td>{u.email}</td>
                  <td>{u.created_at}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={pending || u.id === meId}
                      onChange={e => changeRole(u.id, e.target.value)}
                      aria-label={`Role for ${u.full_name}`}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

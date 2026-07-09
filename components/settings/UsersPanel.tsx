'use client';
import { useRef, useState, useTransition } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { createUser, setUserRole } from '@/app/(app)/settings/actions';

export type PanelUser = {
  id: string; full_name: string; role: 'admin' | 'rep' | 'cleaner';
  email: string; created_at: string; phone: string | null; dob: string | null;
};
const ROLES = ['admin', 'rep', 'cleaner'] as const;

export function UsersPanel({ users, meId }: { users: PanelUser[]; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await createUser(fd);
      if (res?.error) setError(res.error);
      else { formRef.current?.reset(); setCreating(false); }
    });
  };
  const changeRole = (id: string, role: string) => {
    setError(null);
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ color: 'var(--muted)', fontSize: 12 }}>
          Login is active immediately (email pre-confirmed).
        </span>
        <button
          className="btn"
          type="button"
          onClick={() => { setError(null); setCreating(true); }}
        >
          + Create user
        </button>
      </div>

      {creating && (
        <Drawer onClose={() => setCreating(false)} labelId="create-user-title">
          <form ref={formRef} action={submit} autoComplete="off">
            <div className="dh">
              <h2 id="create-user-title">Create user</h2>
              <button type="button" className="close" onClick={() => setCreating(false)} aria-label="Close">✕</button>
            </div>
            <div className="sec userform">
              <input name="full_name" placeholder="Full name" aria-label="Full name" required autoComplete="off" />
              <input name="email" type="email" placeholder="email@company.com" aria-label="Email" required autoComplete="off" />
              <input name="password" type="password" placeholder="Password (min 8)" aria-label="Password" required minLength={8} autoComplete="new-password" />
              <select name="role" defaultValue="rep" aria-label="Role">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div>
                <label className="lbl" htmlFor="new-user-phone">Phone</label><br />
                <input id="new-user-phone" name="phone" type="tel" placeholder="555-0100" autoComplete="off" />
              </div>
              <div>
                <label className="lbl" htmlFor="new-user-dob">DOB</label><br />
                <input id="new-user-dob" name="dob" type="date" autoComplete="off" />
              </div>
            </div>
            {error && <p role="alert" className="form-err">{error}</p>}
            <div className="acts">
              <button className="btn-p" type="submit" disabled={pending}>{pending ? '…' : '+ Create'}</button>
              <button className="btn-s" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </Drawer>
      )}

      <div className="panel box">
        <h3>Users ({users.length})</h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>DOB</th><th>Since</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.full_name}</b>{u.id === meId ? <small style={{ color: 'var(--muted)' }}> (you)</small> : null}</td>
                  <td>{u.email}</td>
                  <td>{u.phone ?? '—'}</td>
                  <td>{u.dob ?? '—'}</td>
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

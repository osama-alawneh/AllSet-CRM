import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';

export default async function SettingsPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Settings / Users</h3>
        <p className="cap">User management arrives post-MVP; roles are seeded in the DB.</p>
      </div>
    </section>
  );
}

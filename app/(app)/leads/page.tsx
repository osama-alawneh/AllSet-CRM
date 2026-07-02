import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';

export default async function LeadsPage() {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Leads / Pipeline</h3>
        <p className="cap">Kanban pipeline arrives in Plan 3.</p>
      </div>
    </section>
  );
}

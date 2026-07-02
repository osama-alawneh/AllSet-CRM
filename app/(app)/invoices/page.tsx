import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';

export default async function InvoicesPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Invoices / Billing</h3>
        <p className="cap">Invoice CRUD + PDF arrives in Plan 5.</p>
      </div>
    </section>
  );
}

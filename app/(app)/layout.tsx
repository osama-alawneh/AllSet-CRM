import { redirect } from 'next/navigation';
import { getRole, guardDecision } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const to = guardDecision(role);
  if (to) redirect(to);
  return <div data-role={role ?? ''}>{children}</div>;
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <main className="login">
      <div className="login-card box">
        <div className="brand">
          <div className="logo">◇</div>
          <div>
            <b>AllSet</b>
            <small>BLUEPRINT+ CRM</small>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

import { Card } from '@clumera/ui';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getAdmin } from '@/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getAdmin()) redirect('/');
  if (!process.env.MANAGEMENT_ADMIN_PASSWORD_HASH?.trim()) redirect('/configurar');
  return (
    <main className="cx-auth">
      <div className="cx-auth__panel">
        <Card title="Clumera Management">
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}

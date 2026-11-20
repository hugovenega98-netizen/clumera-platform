import { publicVenues } from '@clumera/module-bookings';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from '@/components/LoginForm';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
import { safeNext } from '@/lib/safe-next';
import { getCurrentSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentSession()) redirect(next);
  // Reserva sin cuenta: solo si el módulo está licenciado y hay espacios habilitados para el público.
  const publicBooking = (await getLicenseState()).enabled.has('bookings') && (await publicVenues(getPrisma())).length > 0;
  return (
    <AuthShell title="Ingresar">
      <p>{clientConfig.login.description}</p>
      <LoginForm next={next} />
      {publicBooking ? (
        <p className="cx-muted">
          ¿No sos socio?{' '}
          <Link className="cx-link" href="/reservar">
            Reservá una cancha sin cuenta
          </Link>
        </p>
      ) : null}
    </AuthShell>
  );
}

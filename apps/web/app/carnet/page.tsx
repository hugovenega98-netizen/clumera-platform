import { familyView } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CardQr } from '@/components/CardQr';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getCredentials } from '@/lib/services';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mi carnet' };
export const dynamic = 'force-dynamic';

const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
const initials = (a: string, b: string) => `${a[0] ?? ''}${b[0] ?? ''}`.toUpperCase();

/** Mi carnet y, para quien es responsable, el de sus representados. */
export default async function CardPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const session = await requireSession('/carnet');
  const groups = await familyView(getPrisma(), session.personId);
  const people = [
    { personId: session.personId, firstName: session.firstName },
    ...groups.flatMap((g) => g.members.filter((m) => m.manageable && !m.isSelf && m.membership)),
  ].filter((p, i, all) => all.findIndex((q) => q.personId === p.personId) === i);
  const { persona = session.personId } = await searchParams;
  if (!people.some((p) => p.personId === persona)) notFound();
  const card = await getCredentials().memberCard(persona);
  if (!card) notFound();
  const m = card.membership;

  return (
    <AppShell session={session} current="/carnet" title="Mi carnet">
      {people.length > 1 ? (
        <nav className="cx-tabs" aria-label="Carnets del grupo familiar">
          {people.map((p) => (
            <Link key={p.personId} href={p.personId === session.personId ? '/carnet' : `/carnet?persona=${p.personId}`} aria-current={p.personId === persona ? 'page' : undefined}>
              {p.personId === session.personId ? 'Mi carnet' : p.firstName}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="cx-columns">
        <section className="credential" aria-label="Credencial social">
          <div className="credential__head">
            <span className="credential__avatar" aria-hidden="true">
              {initials(card.person.firstName, card.person.lastName)}
            </span>
            <div>
              <h1 className="credential__name">
                {card.person.firstName} {card.person.lastName}
              </h1>
              <div style={{ color: 'var(--cx-on-primary-2)' }}>{clientConfig.identity.displayName}</div>
            </div>
          </div>
          {m ? (
            <dl className="credential__facts">
              <div>
                <dt>Socio N°</dt>
                <dd>{m.number ?? '—'}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{m.category}</dd>
              </div>
              <div>
                <dt>Vigencia</dt>
                <dd>{m.validTo ? date.format(m.validTo) : 'Sin vencimiento'}</dd>
              </div>
            </dl>
          ) : null}
          {card.qr ? (
            <CardQr personId={persona} initial={{ token: card.qr.token, expiresAt: card.qr.expiresAt.toISOString() }} />
          ) : (
            <div className="credential__blocked" role="status">
              {m ? 'La membresía no está vigente: el carnet no habilita accesos. Consultá en Secretaría.' : 'Todavía no tenés membresía en el club.'}
            </div>
          )}
        </section>
        <Card title="Estado">
          <p>
            <span className={m?.active ? 'cx-tag cx-tag--ok' : 'cx-tag cx-tag--warn'}>{m?.active ? '● Membresía vigente' : 'Sin membresía vigente'}</span>
          </p>
          <p className="cx-muted">Mostrá el código en la entrada. Recepción ve si es válido y tu nombre; nunca tus pagos ni datos de salud.</p>
        </Card>
      </div>
    </AppShell>
  );
}

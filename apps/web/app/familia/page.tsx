import { familyView } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mi familia' };
export const dynamic = 'force-dynamic';

const ROLE = { guardian: 'Responsable', member: 'Integrante', dependent: 'A cargo' } as const;
const initials = (a: string, b: string) => `${a[0] ?? ''}${b[0] ?? ''}`.toUpperCase();

export default async function FamilyPage() {
  const session = await requireSession('/familia');
  const groups = await familyView(getPrisma(), session.personId);
  return (
    <AppShell session={session} current="/familia" title="Mi familia">
      {groups.length === 0 ? (
        <Card title="Sin grupo familiar">
          <p>Todavía no formás parte de un grupo familiar. Secretaría puede vincularte con tu familia.</p>
        </Card>
      ) : null}
      {groups.map((g) => (
        <section key={g.id} className="cx-stack" aria-label={g.name}>
          <h1>{g.name}</h1>
          <div className="family">
            {g.members.map((m) => (
              <Card key={m.personId} className="family__member">
                <div className="family__head">
                  <span className="family__avatar" aria-hidden="true">
                    {initials(m.firstName, m.lastName)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>
                      {m.firstName} {m.lastName}
                      {m.age !== null ? ` · ${m.age}` : ''}
                    </strong>
                    {m.isSelf ? <span className="cx-muted"> (vos)</span> : null}
                    <div className="cx-muted">
                      {m.relation ? `${m.relation[0]!.toUpperCase()}${m.relation.slice(1)} · ` : ''}
                      {ROLE[m.role]}
                      {m.hasAccount ? ' · tiene su cuenta' : m.manageable && !m.isSelf ? ' · la administrás vos' : ''}
                    </div>
                  </div>
                </div>
                <div className="cx-tags">
                  {m.membership ? (
                    <span className={m.membership.status === 'active' ? 'cx-tag cx-tag--ok' : 'cx-tag cx-tag--warn'}>
                      {m.membership.category}
                      {m.membership.status === 'active' ? '' : ' · no vigente'}
                    </span>
                  ) : (
                    <span className="cx-tag">No socio</span>
                  )}
                </div>
                {m.manageable && m.membership ? (
                  <Link className="cx-link" href={m.isSelf ? '/carnet' : `/carnet?persona=${m.personId}`}>
                    Ver carnet
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </AppShell>
  );
}

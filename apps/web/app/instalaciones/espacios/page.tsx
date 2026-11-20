import { formatMoney } from '@clumera/finance';
import { venuesAdmin, VENUE_STATUS_LABEL } from '@clumera/module-facilities';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CreateVenueForm, RemoveTariff, RuleForm, TariffForm } from '@/components/FacilitiesForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Espacios' };
export const dynamic = 'force-dynamic';

const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const daysLabel = (mask: number) => (mask === 127 ? 'Todos los días' : mask === 31 ? 'Lunes a viernes' : mask === 96 ? 'Fin de semana' : DAYS.filter((_, i) => mask & (1 << i)).join(' '));

/** Espacios, reglas de reserva y tarifas (solo con facilities:venue.manage). */
export default async function VenuesPage() {
  await requireModulePage('facilities');
  const { session, can } = await requireAdmin('/instalaciones/espacios', 'facilities:venue.view');
  const venues = (await venuesAdmin(getPrisma())).filter((v) => can('facilities:venue.view', { scopes: [{ type: 'venue', id: v.slug }] }));
  const manage = (slug: string) => can('facilities:venue.manage', { scopes: [{ type: 'venue', id: slug }] });
  return (
    <AppShell session={session} current="/instalaciones" title="Espacios" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/instalaciones">
          ← Agenda central
        </Link>
      </nav>
      <h1>Espacios, reglas y tarifas</h1>
      <div className="cx-stack">
        {venues.map((v) => (
          <Card key={v.id} aria-label={v.name}>
            <div className="team-card__head">
              <h2 className="cx-card__title" style={{ margin: 0 }}>
                {v.name}
              </h2>
              <span className={`cx-tag ${v.status === 'available' ? 'cx-tag--ok' : 'cx-tag--warn'}`}>{VENUE_STATUS_LABEL[v.status]}</span>
            </div>
            <p className="cx-muted">
              {v.group}
              {v.detail ? ` · ${v.detail}` : ''} ·{' '}
              {v.rule
                ? `turnos de ${v.rule.slotMinutes} min de ${hh(v.rule.openFrom)} a ${hh(v.rule.openTo)} · seña ${v.rule.depositPercent}% · cancelación ${v.rule.cancelHours} h${v.rule.payAtClub ? ' · se puede pagar en el club' : ''}`
                : 'no se reserva online'}
            </p>
            <div className="rows" aria-label={`Tarifas de ${v.name}`}>
              {v.tariffs.length === 0 ? <p className="cx-muted">Sin tarifas.</p> : null}
              {v.tariffs.map((t) => (
                <div key={t.id}>
                  <span className="grow">
                    <b>{t.label}</b>
                    <span className="cx-muted">
                      {' '}
                      · {daysLabel(t.days)} · {hh(t.fromMinute)} a {hh(t.toMinute)}
                    </span>
                  </span>
                  <span>
                    {formatMoney(t.memberPrice)} socio · {formatMoney(t.guestPrice)} no socio
                  </span>
                  {manage(v.slug) ? <RemoveTariff id={t.id} label={t.label} /> : null}
                </div>
              ))}
            </div>
            {manage(v.slug) ? (
              <details>
                <summary className="cx-link">Editar reglas y tarifas</summary>
                <div className="cx-columns" style={{ marginTop: 'var(--cx-space-3)' }}>
                  <RuleForm venueId={v.id} venueName={v.name} rule={v.rule} />
                  <TariffForm venueId={v.id} venueName={v.name} />
                </div>
              </details>
            ) : null}
          </Card>
        ))}
        {can('facilities:venue.manage') ? (
          <Card title="Nuevo espacio">
            <CreateVenueForm />
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

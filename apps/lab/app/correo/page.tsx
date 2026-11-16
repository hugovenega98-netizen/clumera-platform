import { Card } from '@clumera/ui';
import { LabShell } from '@/LabShell';
import { guardedDb } from '@/lab';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
const linkify = (text: string) => text.split(/(https?:\/\/\S+)/g).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} href={part}>{part}</a> : part));

/** Bandeja de correo de Lab: lo que la app «mandó», con los enlaces de un solo uso clickeables. */
export default async function LabMail() {
  const db = await guardedDb();
  const messages = await db.devMailMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  return (
    <LabShell current="/correo">
      <h1>Correos enviados</h1>
      {messages.length === 0 ? <p>No hay correos.</p> : null}
      <div className="lab-mail cx-stack">
      {messages.map((m) => (
        <Card key={m.id} title={m.subject}>
          <p className="cx-muted">
            Para {m.to} · {fmt.format(m.createdAt)}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{linkify(m.text)}</p>
        </Card>
      ))}
      </div>
    </LabShell>
  );
}

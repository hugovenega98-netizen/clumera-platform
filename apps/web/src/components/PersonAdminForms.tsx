'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson, type ApiError } from './forms';

async function send<T = Record<string, unknown>>(method: 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: ApiError };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? { code: 'http', message: `Error ${res.status}` } };
  } catch {
    return { ok: false, error: { code: 'network', message: 'No hay conexión. Probá de nuevo.' } };
  }
}

type Msg = { tone: 'ok' | 'bad'; text: string } | null;
const FIELD_LABEL: Record<string, string> = { firstName: 'nombre', lastName: 'apellido', document: 'documento', birthDate: 'nacimiento', email: 'email', phone: 'teléfono' };

/** Corregir datos de la persona. El documento solo se reemplaza: nunca se muestra el actual. */
export function EditPersonForm({ person }: { person: { id: string; firstName: string; lastName: string; birthDate: string; email: string; phone: string; docLast4: string | null } }) {
  const router = useRouter();
  const [v, setV] = useState({ firstName: person.firstName, lastName: person.lastName, birthDate: person.birthDate, email: person.email, phone: person.phone, document: '' });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const on = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const r = await send<{ changed: string[] }>('PATCH', `/api/identity/people/${person.id}`, { ...v, document: v.document || undefined });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setV({ ...v, document: '' });
    setMsg({ tone: 'ok', text: r.data.changed.length ? `Guardado: ${r.data.changed.map((f) => FIELD_LABEL[f] ?? f).join(', ')}.` : 'No había cambios.' });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Editar datos">
      <Field label="Nombre" name="firstName" required maxLength={80} value={v.firstName} onChange={on('firstName')} autoComplete="off" />
      <Field label="Apellido" name="lastName" required maxLength={80} value={v.lastName} onChange={on('lastName')} autoComplete="off" />
      <Field
        label="Documento"
        name="document"
        inputMode="numeric"
        maxLength={20}
        value={v.document}
        onChange={on('document')}
        autoComplete="off"
        hint={person.docLast4 ? `Cargado: ••• ${person.docLast4}. Escribí uno nuevo solo para reemplazarlo.` : 'Se guarda cifrado; solo se muestran los últimos 4.'}
      />
      <Field label="Fecha de nacimiento" name="birthDate" type="date" value={v.birthDate} onChange={on('birthDate')} />
      <Field label="Email" name="email" type="email" maxLength={200} value={v.email} onChange={on('email')} autoComplete="off" />
      <Field label="Teléfono" name="phone" type="tel" maxLength={40} value={v.phone} onChange={on('phone')} autoComplete="off" />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" disabled={busy}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Vigente' },
  { value: 'suspended', label: 'Suspendida' },
  { value: 'inactive', label: 'Inactiva' },
  { value: 'resigned', label: 'Baja' },
];

/** Estado (con motivo) y categoría de la membresía actual. */
export function MembershipActions({ membership, categories }: { membership: { id: string; status: string; categoryCode: string }; categories: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [status, setStatus] = useState(membership.status === 'active' ? 'suspended' : 'active');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(membership.categoryCode);
  const [catReason, setCatReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function change(body: Record<string, string>, done: string) {
    const r = await send('PATCH', `/api/identity/memberships/${membership.id}`, body);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: done });
    setReason('');
    setCatReason('');
    router.refresh();
  }
  return (
    <div className="cx-stack">
      <form
        className="form-grid"
        aria-label="Cambiar estado de la membresía"
        onSubmit={(e) => {
          e.preventDefault();
          void change({ status, reason }, 'Estado actualizado.');
        }}
      >
        <div className="cx-field">
          <label className="cx-label" htmlFor="ms-status">
            Nuevo estado
          </label>
          <select id="ms-status" className="cx-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.filter((o) => o.value !== membership.status).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Motivo" name="reason" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Falta de pago, pedido del socio…" />
        <div className="span-2">
          <Button type="submit" variant={status === 'active' ? 'primary' : 'danger'}>
            Cambiar estado
          </Button>
        </div>
      </form>
      <form
        className="form-grid"
        aria-label="Cambiar categoría"
        onSubmit={(e) => {
          e.preventDefault();
          void change({ categoryCode: category, reason: catReason }, 'Categoría actualizada.');
        }}
      >
        <div className="cx-field">
          <label className="cx-label" htmlFor="ms-cat">
            Categoría
          </label>
          <select id="ms-cat" className="cx-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Motivo del cambio" name="catReason" required minLength={3} maxLength={200} value={catReason} onChange={(e) => setCatReason(e.target.value)} placeholder="Cumplió 18, corrección…" />
        <div className="span-2">
          <Button type="submit" variant="secondary" disabled={category === membership.categoryCode}>
            Cambiar categoría
          </Button>
        </div>
      </form>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  );
}

/** Alta de membresía para quien no es socio (o lo fue). */
export function AddMembershipForm({ personId, categories }: { personId: string; categories: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]?.code ?? '');
  const [number, setNumber] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson<{ memberNumber: string }>(`/api/identity/people/${personId}/memberships`, { categoryCode: category, memberNumber: number || undefined });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: `Alta como socio N° ${r.data.memberNumber}.` });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Alta de membresía">
      <div className="cx-field">
        <label className="cx-label" htmlFor="am-cat">
          Categoría
        </label>
        <select id="am-cat" className="cx-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Field label="N° de socio" name="memberNumber" inputMode="numeric" pattern="[0-9]*" maxLength={9} hint="Vacío: el siguiente libre." value={number} onChange={(e) => setNumber(e.target.value)} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Dar de alta como socio</Button>
        </div>
      </div>
    </form>
  );
}

const ROLE_OPTIONS = [
  { value: 'guardian', label: 'Responsable' },
  { value: 'member', label: 'Integrante' },
  { value: 'dependent', label: 'A cargo' },
];

type Found = { id: string; name: string; detail: string };

/** Buscar una persona del padrón para sumarla a un grupo. */
function PersonPicker({ onPick, exclude }: { onPick: (p: Found) => void; exclude: string[] }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  async function search() {
    if (q.trim().length < 2) return;
    const res = await fetch(`/api/identity/people?q=${encodeURIComponent(q.trim())}`).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { items: Array<{ id: string; firstName: string; lastName: string; memberNumber: string | null; age: number | null }> }) : { items: [] };
    setFound(
      data.items
        .filter((p) => !exclude.includes(p.id))
        .slice(0, 6)
        .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, detail: [p.memberNumber ? `N° ${p.memberNumber}` : null, p.age !== null ? `${p.age} años` : null].filter(Boolean).join(' · ') })),
    );
  }
  return (
    <div className="cx-stack">
      <div className="search-row">
        <input
          type="search"
          className="cx-input"
          aria-label="Buscar persona para sumar"
          placeholder="Nombre, N° de socio o documento"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button variant="secondary" onClick={search}>
          Buscar
        </Button>
      </div>
      {found ? (
        found.length ? (
          <div className="rows">
            {found.map((p) => (
              <div key={p.id}>
                <span className="grow">
                  {p.name}
                  {p.detail ? <span className="cx-muted"> · {p.detail}</span> : null}
                </span>
                <button type="button" className="cx-link-button" onClick={() => onPick(p)} aria-label={`Elegir: ${p.name}`}>
                  Elegir
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="cx-muted">Sin resultados.</p>
        )
      ) : null}
    </div>
  );
}

function RoleSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="cx-field">
      <label className="cx-label" htmlFor={id}>
        Rol en la familia
      </label>
      <select id={id} className="cx-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Sumar a alguien a un grupo existente. */
export function AddFamilyMemberForm({ groupId, groupName, current }: { groupId: string; groupName: string; current: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Found | null>(null);
  const [role, setRole] = useState('dependent');
  const [relation, setRelation] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const r = await postJson(`/api/identity/families/${groupId}/members`, { personId: picked.id, role, relation: relation || undefined });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: `${picked.name} se sumó a ${groupName}.` });
    setPicked(null);
    setRelation('');
    router.refresh();
  }
  return (
    <form className="cx-stack" onSubmit={submit} aria-label={`Sumar a ${groupName}`}>
      {picked ? (
        <div className="form-grid">
          <p className="span-2">
            <strong>{picked.name}</strong>{' '}
            <button type="button" className="cx-link-button" onClick={() => setPicked(null)}>
              Cambiar
            </button>
          </p>
          <RoleSelect id={`fam-role-${groupId}`} value={role} onChange={setRole} />
          <Field label="Vínculo" name="relation" maxLength={40} placeholder="madre, hijo, tutora…" value={relation} onChange={(e) => setRelation(e.target.value)} />
          <div className="span-2">
            <Button type="submit">Sumar al grupo</Button>
          </div>
        </div>
      ) : (
        <PersonPicker onPick={setPicked} exclude={current} />
      )}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </form>
  );
}

/** Grupo nuevo con esta persona como primer integrante. */
export function CreateFamilyForm({ personId, lastName }: { personId: string; lastName: string }) {
  const router = useRouter();
  const [name, setName] = useState(`Familia ${lastName}`);
  const [role, setRole] = useState('guardian');
  const [relation, setRelation] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson('/api/identity/families', { name, members: [{ personId, role, relation: relation || undefined }] });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Crear grupo familiar">
      <Field label="Nombre del grupo" name="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <RoleSelect id="new-fam-role" value={role} onChange={setRole} />
      <Field label="Vínculo (opcional)" name="relation" maxLength={40} placeholder="madre, padre…" value={relation} onChange={(e) => setRelation(e.target.value)} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Crear grupo</Button>
        </div>
      </div>
    </form>
  );
}

export function RemoveFamilyMember({ groupId, personId, name }: { groupId: string; personId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function remove() {
    const r = await send('DELETE', `/api/identity/families/${groupId}/members/${personId}`);
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  return (
    <span className="cx-stack" style={{ gap: 4, alignItems: 'end' }}>
      <button type="button" className="cx-link-button" onClick={remove} aria-label={`Quitar del grupo: ${name}`}>
        Quitar
      </button>
      {error ? (
        <span role="alert" className="cx-muted" style={{ color: 'var(--cx-bad)', maxWidth: 260 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}

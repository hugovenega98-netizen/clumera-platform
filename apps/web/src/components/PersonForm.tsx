'use client';

import { Button, Field, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

/** Alta de persona. El documento se guarda como digest + últimos 4: nunca en claro. */
export function PersonForm({ categories }: { categories: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setExisting(null);
    const body = Object.fromEntries(['firstName', 'lastName', 'document', 'birthDate', 'email', 'phone', 'memberNumber'].map((k) => [k, String(form.get(k) ?? '')]));
    const r = await postJson<{ id: string }>('/api/identity/people', { ...body, categoryCode: category });
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      const id = r.error.details?.personId;
      if (typeof id === 'string') setExisting(id);
      return;
    }
    router.push(`/admin/personas/${r.data.id}`);
  }
  return (
    <form onSubmit={submit} className="form-grid" aria-label="Alta de persona">
      <Field label="Nombre" name="firstName" required maxLength={80} autoComplete="off" />
      <Field label="Apellido" name="lastName" required maxLength={80} autoComplete="off" />
      <Field label="Documento" name="document" inputMode="numeric" maxLength={20} hint="Se guarda cifrado; solo se muestran los últimos 4." autoComplete="off" />
      <Field label="Fecha de nacimiento" name="birthDate" type="date" />
      <Field label="Email" name="email" type="email" maxLength={200} autoComplete="off" />
      <Field label="Teléfono" name="phone" type="tel" maxLength={40} autoComplete="off" />
      <div className="cx-field">
        <label className="cx-label" htmlFor="category">
          Membresía social
        </label>
        <select id="category" className="cx-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">No es socio</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {category ? <Field label="N° de socio" name="memberNumber" inputMode="numeric" pattern="[0-9]*" maxLength={9} hint="Vacío: el siguiente libre." /> : <span />}
      <div className="span-2 cx-stack">
        {error ? (
          <Notice tone="bad">
            {error}
            {existing ? (
              <>
                {' '}
                <Link className="cx-link" href={`/admin/personas/${existing}`}>
                  Ver la ficha existente
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}
        <div className="adm-actions">
          <Button type="submit" disabled={busy}>
            Dar de alta
          </Button>
          <Link className="cx-btn cx-btn--secondary" href="/admin/personas">
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  );
}

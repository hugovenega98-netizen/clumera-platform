import { applyImport, IMPORT_MAX_BYTES, planImport, readSpreadsheet } from '@clumera/identity';
import { after, NextResponse } from 'next/server';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { docPepper, guard } from '@/lib/people-api';

export const maxDuration = 60;

/**
 * Importación del padrón. `modo=vista` devuelve el plan por fila sin tocar nada; `modo=aplicar`
 * vuelve a validar el mismo archivo y guarda solo las filas válidas. Nada del archivo se conserva.
 */
export async function POST(request: Request) {
  const g = await guard('identity:person.manage', 'No tenés permiso para importar el padrón');
  if (!g.ok) return g.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get('archivo');
  const mode = form?.get('modo');
  if (!(file instanceof File) || (mode !== 'vista' && mode !== 'aplicar')) return errorResponse('invalid_input', 'Elegí un archivo .xlsx o .csv', 400);
  if (file.size > IMPORT_MAX_BYTES) return errorResponse('invalid_input', 'El archivo supera los 2 MB', 400);
  let table: string[][];
  try {
    table = readSpreadsheet(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch {
    return errorResponse('invalid_input', 'No se pudo leer el archivo: guardalo como .xlsx o .csv', 400);
  }
  const db = getPrisma();
  const plan = await planImport(db, table, docPepper());
  // Sin datos personales de vuelta más allá de lo que la persona ya cargó: nombre, fila y qué pasa.
  const view = {
    missing: plan.missing,
    columns: plan.columns,
    counts: plan.counts,
    rows: plan.rows.map((r) => ({ line: r.line, action: r.action, name: r.name, messages: r.messages, fields: r.fields, personId: r.personId })),
  };
  if (mode === 'vista' || plan.missing.length) return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } });
  const result = await applyImport(db, g.session.personId, plan);
  after(() => deliverNow(db));
  return NextResponse.json({ ...view, result });
}

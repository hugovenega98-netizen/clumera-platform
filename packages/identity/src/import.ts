/**
 * Importación del padrón desde Excel (.xlsx) o CSV. Dos pasos sin estado: `planImport` valida cada
 * fila y dice qué haría (alta, actualización, error); `applyImport` vuelve a planificar sobre el mismo
 * archivo y aplica solo las filas válidas. Las personas se reconocen por documento (digest) o por N° de
 * socio: nunca se duplican. El documento se guarda como digest + últimos 4.
 */
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { createEvent } from '@clumera/kernel';
import { strFromU8, unzipSync } from 'fflate';
import { documentDigest } from './people';

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

// ───────────── Lectura del archivo ─────────────

/** CSV con «,» o «;» (el que use la primera línea), comillas dobles y saltos dentro de comillas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENTITIES[e]!));
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('');
const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Primera hoja de un .xlsx: texto de cada celda (números tal cual; fechas como número de serie). */
export function parseXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, { filter: (f) => f.name.startsWith('xl/') && f.name.endsWith('.xml') || f.name.endsWith('.rels') });
  const read = (name: string) => (files[name] ? strFromU8(files[name]!) : null);
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('No es un archivo de Excel (.xlsx)');
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = read('xl/_rels/workbook.xml.rels') ?? '';
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheet = read(sheetPath) ?? read('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('El Excel no tiene hojas');
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = [];
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = unescapeXml(v);
      const idx = ref ? colIndex(ref) : out.length;
      while (out.length < idx) out.push('');
      out[idx] = value;
    }
    if (out.some((x) => x.trim())) rows.push(out);
  }
  return rows;
}

export function readSpreadsheet(bytes: Uint8Array, filename: string): string[][] {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(filename)) return parseXlsx(bytes);
  return parseCsv(new TextDecoder('utf-8').decode(bytes));
}

// ───────────── Plan ─────────────

type Field = 'firstName' | 'lastName' | 'document' | 'birthDate' | 'email' | 'phone' | 'category' | 'memberNumber';
const HEADERS: Record<string, Field> = {
  nombre: 'firstName',
  nombres: 'firstName',
  apellido: 'lastName',
  apellidos: 'lastName',
  documento: 'document',
  dni: 'document',
  doc: 'document',
  nrodedocumento: 'document',
  nacimiento: 'birthDate',
  fechadenacimiento: 'birthDate',
  fechanacimiento: 'birthDate',
  email: 'email',
  correo: 'email',
  mail: 'email',
  telefono: 'phone',
  celular: 'phone',
  tel: 'phone',
  categoria: 'category',
  nsocio: 'memberNumber',
  nodesocio: 'memberNumber',
  nrodesocio: 'memberNumber',
  numerodesocio: 'memberNumber',
  socio: 'memberNumber',
};
export const IMPORT_COLUMNS = ['Nombre', 'Apellido', 'Documento', 'Nacimiento', 'Email', 'Teléfono', 'Categoría', 'N° de socio'] as const;
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** dd/mm/aaaa, aaaa-mm-dd o número de serie de Excel. */
export function parseDateCell(v: string): Date | null | 'invalid' {
  const s = v.trim();
  if (!s) return null;
  let d: Date | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  else if (/^\d{4,5}(\.\d+)?$/.test(s)) d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
  if (!d || Number.isNaN(d.getTime())) return 'invalid';
  if (m && d.getUTCDate() !== Number(m[1]!.length === 4 ? m[3] : m[1])) return 'invalid';
  return d;
}

export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface ImportRow {
  line: number;
  action: ImportAction;
  name: string;
  /** Persona existente (actualización). */
  personId: string | null;
  messages: string[];
  fields: string[];
  data: {
    firstName: string;
    lastName: string;
    doc: { docDigest: string; docLast4: string } | null;
    birthDate: Date | null;
    email: string | null;
    phone: string | null;
    categoryId: string | null;
    memberNumber: string | null;
  };
}

export interface ImportPlan {
  columns: Array<{ header: string; field: Field | null }>;
  missing: string[];
  rows: ImportRow[];
  counts: Record<ImportAction, number>;
}

export async function planImport(db: PrismaClient, table: string[][], pepper: string | undefined, at = new Date()): Promise<ImportPlan> {
  const [header = [], ...body] = table;
  const columns = header.map((h) => ({ header: h.trim(), field: HEADERS[norm(h)] ?? null }));
  const index = new Map<Field, number>();
  columns.forEach((c, i) => c.field && !index.has(c.field) && index.set(c.field, i));
  const missing = (['firstName', 'lastName'] as const).filter((f) => !index.has(f)).map((f) => (f === 'firstName' ? 'Nombre' : 'Apellido'));
  const counts: Record<ImportAction, number> = { create: 0, update: 0, unchanged: 0, error: 0 };
  if (missing.length) return { columns, missing, rows: [], counts };

  const categories = await db.membershipCategory.findMany({ where: { active: true }, select: { id: true, code: true, name: true } });
  const catBy = new Map<string, string>();
  for (const c of categories) {
    catBy.set(norm(c.code), c.id);
    catBy.set(norm(c.name), c.id);
  }
  const get = (r: string[], f: Field) => (index.has(f) ? (r[index.get(f)!] ?? '').trim() : '');

  // Primera pasada: normalizar y validar cada fila sola.
  const pre = body.slice(0, IMPORT_MAX_ROWS).map((r, i) => {
    const messages: string[] = [];
    const firstName = get(r, 'firstName').slice(0, 80);
    const lastName = get(r, 'lastName').slice(0, 80);
    if (!firstName || !lastName) messages.push('Falta nombre o apellido');
    let doc: ImportRow['data']['doc'] = null;
    const rawDoc = get(r, 'document');
    if (rawDoc) {
      if (!pepper) messages.push('Esta instalación no tiene configurada la clave de documentos');
      else
        try {
          doc = documentDigest(rawDoc, pepper);
        } catch {
          messages.push('Documento inválido');
        }
    }
    const bd = parseDateCell(get(r, 'birthDate'));
    if (bd === 'invalid') messages.push('Fecha de nacimiento inválida (usá dd/mm/aaaa)');
    else if (bd && bd > at) messages.push('La fecha de nacimiento no puede ser futura');
    const email = get(r, 'email').toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push('Email inválido');
    const cat = get(r, 'category');
    const categoryId = cat ? (catBy.get(norm(cat)) ?? null) : null;
    if (cat && !categoryId) messages.push(`Categoría «${cat}» inexistente`);
    const memberNumber = get(r, 'memberNumber').replace(/\.0$/, '') || null;
    if (memberNumber && !/^\d{1,9}$/.test(memberNumber)) messages.push('El N° de socio son solo números');
    return {
      line: i + 2,
      messages,
      data: { firstName, lastName, doc, birthDate: bd instanceof Date ? bd : null, email, phone: get(r, 'phone').slice(0, 40) || null, categoryId, memberNumber },
    };
  });

  // Repetidos dentro del archivo.
  const seenDoc = new Map<string, number>();
  const seenNum = new Map<string, number>();
  for (const p of pre) {
    if (p.data.doc) {
      const prev = seenDoc.get(p.data.doc.docDigest);
      if (prev) p.messages.push(`Documento repetido (fila ${prev})`);
      else seenDoc.set(p.data.doc.docDigest, p.line);
    }
    if (p.data.memberNumber) {
      const prev = seenNum.get(p.data.memberNumber);
      if (prev) p.messages.push(`N° de socio repetido (fila ${prev})`);
      else seenNum.set(p.data.memberNumber, p.line);
    }
  }

  // Contra el padrón: por documento, si no por N° de socio.
  const digests = pre.flatMap((p) => (p.data.doc ? [p.data.doc.docDigest] : []));
  const numbers = pre.flatMap((p) => (p.data.memberNumber ? [p.data.memberNumber] : []));
  const [byDoc, byNum] = await Promise.all([
    db.person.findMany({
      where: { docDigest: { in: digests } },
      select: { id: true, docDigest: true, firstName: true, lastName: true, birthDate: true, email: true, phone: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, select: { categoryId: true, memberNumber: true, status: true } } },
    }),
    db.clubMembership.findMany({ where: { memberNumber: { in: numbers } }, select: { memberNumber: true, personId: true } }),
  ]);
  const docMap = new Map(byDoc.map((p) => [p.docDigest!, p]));
  const numMap = new Map(byNum.map((m) => [m.memberNumber!, m.personId]));
  const byNumIds = [...new Set(byNum.map((m) => m.personId))].filter((id) => !byDoc.some((p) => p.id === id));
  const extra = byNumIds.length
    ? await db.person.findMany({
        where: { id: { in: byNumIds } },
        select: { id: true, docDigest: true, firstName: true, lastName: true, birthDate: true, email: true, phone: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, select: { categoryId: true, memberNumber: true, status: true } } },
      })
    : [];
  const byId = new Map([...byDoc, ...extra].map((p) => [p.id, p]));
  // Sin documento ni N° de socio no hay forma segura de reconocer a alguien: si ya hay una persona
  // con el mismo nombre (y nacimiento, si la fila lo trae), se frena en vez de duplicarla.
  const loose = pre.filter((p) => !p.messages.length && !p.data.doc && !p.data.memberNumber);
  const namesakes = loose.length
    ? await db.person.findMany({
        where: { OR: loose.map((p) => ({ firstName: { equals: p.data.firstName, mode: 'insensitive' as const }, lastName: { equals: p.data.lastName, mode: 'insensitive' as const } })) },
        select: { firstName: true, lastName: true, birthDate: true },
      })
    : [];
  const namesake = (d: ImportRow['data']) =>
    namesakes.some((n) => norm(n.firstName) === norm(d.firstName) && norm(n.lastName) === norm(d.lastName) && (!d.birthDate || !n.birthDate || n.birthDate.getTime() === d.birthDate.getTime()));

  const claimed = new Map<string, number>();
  const rows: ImportRow[] = pre.map((p) => {
    const d = p.data;
    const name = `${d.firstName} ${d.lastName}`.trim() || '(sin nombre)';
    const base = { line: p.line, name, data: d, fields: [] as string[], messages: p.messages };
    if (p.messages.length) return { ...base, action: 'error' as const, personId: null };
    const fromDoc = d.doc ? docMap.get(d.doc.docDigest) : undefined;
    const fromNum = d.memberNumber ? numMap.get(d.memberNumber) : undefined;
    if (fromDoc && fromNum && fromDoc.id !== fromNum) return { ...base, action: 'error' as const, personId: null, messages: ['El N° de socio es de otra persona del padrón'] };
    const existing = fromDoc ?? (fromNum ? byId.get(fromNum) : undefined);
    if (!existing) {
      if (!d.doc && !d.memberNumber && namesake(d)) return { ...base, action: 'error' as const, personId: null, messages: ['Ya hay alguien con ese nombre en el padrón: agregá el documento o el N° de socio para no duplicarlo'] };
      return { ...base, action: 'create' as const, personId: null };
    }
    if (d.doc && existing.docDigest && existing.docDigest !== d.doc.docDigest) return { ...base, action: 'error' as const, personId: existing.id, messages: ['El N° de socio es de una persona con otro documento'] };
    const prev = claimed.get(existing.id);
    if (prev) return { ...base, action: 'error' as const, personId: existing.id, messages: [`Es la misma persona que la fila ${prev}`] };
    claimed.set(existing.id, p.line);
    const fields: string[] = [];
    const messages: string[] = [];
    if (d.firstName !== existing.firstName) fields.push('firstName');
    if (d.lastName !== existing.lastName) fields.push('lastName');
    if (d.doc && !existing.docDigest) fields.push('document');
    if (d.birthDate && d.birthDate.getTime() !== existing.birthDate?.getTime()) fields.push('birthDate');
    if (d.email && d.email !== existing.email) fields.push('email');
    if (d.phone && d.phone !== existing.phone) fields.push('phone');
    const current = existing.memberships[0];
    if (d.categoryId && (!current || current.status === 'resigned' || current.status === 'inactive')) fields.push('membership');
    else if (d.categoryId && current && current.categoryId !== d.categoryId) messages.push('Tiene otra categoría: se cambia desde la ficha, no desde la importación');
    if (d.memberNumber && current?.memberNumber && current.memberNumber !== d.memberNumber && !fromNum) messages.push('Ya tiene otro N° de socio: no se cambia');
    return { ...base, action: fields.length ? ('update' as const) : ('unchanged' as const), personId: existing.id, fields, messages };
  });
  for (const r of rows) counts[r.action]++;
  if (body.length > IMPORT_MAX_ROWS) {
    counts.error += body.length - IMPORT_MAX_ROWS;
    rows.push({ line: IMPORT_MAX_ROWS + 2, action: 'error', name: '…', personId: null, fields: [], messages: [`Se importan hasta ${IMPORT_MAX_ROWS} filas por archivo`], data: pre[0]!.data });
  }
  return { columns, missing, rows, counts };
}

// ───────────── Aplicación ─────────────

async function nextMemberNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ n: number | null }>>`SELECT max(("memberNumber")::int) AS n FROM "ClubMembership" WHERE "memberNumber" ~ '^[0-9]{1,9}$'`;
  return String((rows[0]?.n ?? 0) + 1);
}

/** Aplica las altas y actualizaciones válidas del plan, una fila por transacción. */
export async function applyImport(db: PrismaClient, actorPersonId: string, plan: ImportPlan, at = new Date()): Promise<{ created: number; updated: number; failed: Array<{ line: number; message: string }> }> {
  let created = 0;
  let updated = 0;
  const failed: Array<{ line: number; message: string }> = [];
  const today = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  for (const r of plan.rows) {
    if (r.action !== 'create' && r.action !== 'update') continue;
    const d = r.data;
    try {
      await db.$transaction(async (tx) => {
        const addMembership = async (personId: string) => {
          if (!d.categoryId) return;
          const memberNumber = d.memberNumber ?? (await nextMemberNumber(tx));
          const m = await tx.clubMembership.create({ data: { personId, categoryId: d.categoryId, memberNumber, validFrom: today } });
          await tx.membershipStatusChange.create({ data: { membershipId: m.id, toStatus: 'active', reason: 'Alta por importación', changedById: actorPersonId } });
        };
        if (r.action === 'create') {
          const p = await tx.person.create({ data: { firstName: d.firstName, lastName: d.lastName, birthDate: d.birthDate, email: d.email, phone: d.phone, ...(d.doc ?? {}) } });
          await addMembership(p.id);
          await tx.auditLog.create({ data: { actorPersonId, action: 'person.created', entityType: 'person', entityId: p.id, diff: { source: 'import', membership: Boolean(d.categoryId) } } });
          await appendOutbox(tx, createEvent('person.created', 'identity', { personId: p.id, member: Boolean(d.categoryId) }));
          created++;
        } else {
          const id = r.personId!;
          const data: Prisma.PersonUpdateInput = {};
          if (r.fields.includes('firstName')) data.firstName = d.firstName;
          if (r.fields.includes('lastName')) data.lastName = d.lastName;
          if (r.fields.includes('document') && d.doc) Object.assign(data, d.doc);
          if (r.fields.includes('birthDate')) data.birthDate = d.birthDate;
          if (r.fields.includes('email')) data.email = d.email;
          if (r.fields.includes('phone')) data.phone = d.phone;
          if (Object.keys(data).length) await tx.person.update({ where: { id }, data });
          if (r.fields.includes('membership')) await addMembership(id);
          await tx.auditLog.create({ data: { actorPersonId, action: 'person.updated', entityType: 'person', entityId: id, diff: { source: 'import', fields: r.fields } } });
          await appendOutbox(tx, createEvent('person.updated', 'identity', { personId: id, fields: r.fields }));
          updated++;
        }
      });
    } catch (e) {
      // Carrera con otra carga (documento o N° de socio tomados entre el plan y la aplicación).
      const unique = typeof e === 'object' && e && 'code' in e && (e as { code?: string }).code === 'P2002';
      failed.push({ line: r.line, message: unique ? 'Documento o N° de socio ya usado' : 'No se pudo guardar' });
      if (!unique) throw e;
    }
  }
  return { created, updated, failed };
}

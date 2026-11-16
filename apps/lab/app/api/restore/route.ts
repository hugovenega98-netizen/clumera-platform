import { NextResponse } from 'next/server';
import { clientConfig, guardedDb, labMailer, labOrigin, sameOrigin } from '@/lab';
import { seedLab, wipeLab } from '@/seed';

/**
 * Restaura Lab al seed base. Fase 0: vacía la base dedicada de Lab entera y vuelve a sembrar
 * (assertLabTarget garantiza que no es una base comercial). La restauración por sesión de demo
 * (borrar solo lo que hizo cada visitante) llega cuando haya datos de módulos.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: { code: 'forbidden', message: 'Origen no permitido' } }, { status: 403 });
  const db = await guardedDb();
  await wipeLab(db);
  await seedLab(db, { publicOrigin: labOrigin(), clubName: clientConfig.identity.displayName, mailer: labMailer });
  const res = NextResponse.redirect(new URL('/lab?restaurado=1', request.url), 303);
  return res;
}

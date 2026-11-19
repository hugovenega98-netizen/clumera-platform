/** Dinero en centavos (enteros): nunca flotantes en cuentas. */
/**
 * $ 18.500 si es entero; $ 18.500,50 si tiene centavos. Sin Intl a propósito: el mismo resultado
 * en el servidor y en cualquier navegador, tenga o no el idioma español instalado.
 */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = abs % 100;
  return `${sign}$ ${int}${dec ? `,${String(dec).padStart(2, '0')}` : ''}`;
}

/** «18.500», «18500,50», «$ 18.500» → centavos. Null si no es un monto válido. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$\s]/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [int, dec = ''] = clean.replace(/\./g, '').split(',');
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export const receiptNumber = (n: number) => `R-${String(n).padStart(6, '0')}`;

/** AAAA-MM del día dado en la zona del club. */
export function periodOf(at: Date, timeZone = 'America/Argentina/Buenos_Aires'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  const name = MONTHS[Number(m) - 1] ?? m;
  return `${name![0]!.toUpperCase()}${name!.slice(1)} ${y}`;
}

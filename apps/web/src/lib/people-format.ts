/** Textos y estilos compartidos por las pantallas del padrón. */
export const MEMBERSHIP_STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: 'Vigente', tone: 'cx-tag--ok' },
  suspended: { label: 'Suspendida', tone: 'cx-tag--bad' },
  inactive: { label: 'Inactiva', tone: 'cx-tag--warn' },
  resigned: { label: 'Baja', tone: '' },
};
export const ACCOUNT_STATUS: Record<string, string> = { pending: 'Sin activar', active: 'Activada', locked: 'Bloqueada', disabled: 'Deshabilitada' };
export const initials = (a: string, b: string) => `${a[0] ?? ''}${b[0] ?? ''}`.toUpperCase();
export const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' });
export const dateTimeFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
export const num = new Intl.NumberFormat('es-AR');

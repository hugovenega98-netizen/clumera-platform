/** Estados de una inscripción de colonia, como los ve la familia. */
export const CAMP_STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: 'Confirmada', tone: 'cx-tag--ok' },
  pending: { label: 'Falta completar', tone: 'cx-tag--warn' },
  waitlist: { label: 'Espera', tone: 'cx-tag--info' },
};

export const DOC_STATUS: Record<string, { label: string; tone: string; mark: string }> = {
  missing: { label: 'Falta', tone: 'cx-tag--warn', mark: '!' },
  submitted: { label: 'En revisión', tone: 'cx-tag--info', mark: '…' },
  approved: { label: 'Aprobado', tone: 'cx-tag--ok', mark: '✓' },
  rejected: { label: 'Rechazado', tone: 'cx-tag--bad', mark: '✕' },
};

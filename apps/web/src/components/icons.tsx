import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h4M14 9h3v3h-3z" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M2 20c.7-3.5 3-5 6-5s5.3 1.5 6 5M14 20c.4-2.5 1.6-4 3-4s3 1 4 4" />
    </>
  ),
  payments: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </>
  ),
  sports: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-35 12 12)" />
      <path d="M9 15l6-6M10 10l1 1M13 13l1 1" />
    </>
  ),
  activities: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
  store: <path d="M5 8h14l-1 13H6zM9 8a3 3 0 0 1 6 0" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  ticket: <path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3zM14 6v12" />,
  more: <path d="M4 6h16M4 12h16M4 18h16" />,
  swap: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
};

/** Íconos de trazo para la navegación. Decorativos: el texto del enlace lleva el nombre. */
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.more}
    </svg>
  );
}

/** Ícono por ítem de navegación de los manifiestos (`<módulo>:<ítem>`). */
export const NAV_ICON: Record<string, string> = {
  'identity:card': 'card',
  'identity:family': 'family',
  'finance:payments': 'payments',
  'notifications:inbox': 'bell',
  'sports:my-sports': 'sports',
  'bookings:book': 'calendar',
  'schools:schools': 'activities',
  'summer:summer': 'sun',
  'events:events': 'ticket',
  'tournaments:tournaments': 'trophy',
  'store:store': 'store',
};

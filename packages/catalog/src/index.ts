import { ModuleRegistry } from '@clumera/kernel';
import { manifest as access } from '@clumera/module-access';
import { manifest as bookings } from '@clumera/module-bookings';
import { manifest as events } from '@clumera/module-events';
import { manifest as facilities } from '@clumera/module-facilities';
import { manifest as schools } from '@clumera/module-schools';
import { manifest as store } from '@clumera/module-store';
import { manifest as summer } from '@clumera/module-summer';
import { manifest as tournaments } from '@clumera/module-tournaments';
import { coreManifests } from './core';

export * from './core';
export * from './roles';

/** Los ocho módulos licenciables. */
export const moduleManifests = [facilities, bookings, access, schools, summer, tournaments, events, store];

/** Catálogo completo: lo usan apps/web para componer y apps/management para licenciar. */
export const catalog = new ModuleRegistry([...coreManifests, ...moduleManifests]);

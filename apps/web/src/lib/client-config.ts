import { parseClientConfigOrThrow, type ClientConfig } from '@clumera/config';

/** Config del club, validada al compilar (next.config.ts) e incrustada en el build. */
export const clientConfig: ClientConfig = parseClientConfigOrThrow(JSON.parse(process.env.CLUMERA_CLIENT_CONFIG_JSON ?? 'null'));

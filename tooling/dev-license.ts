/**
 * Genera un par de claves y una licencia firmada para desarrollo o Lab.
 * Producción: la licencia la firma Management con su clave privada; nunca se genera acá.
 *
 *   npm run license:dev -- facilities bookings
 */
import { generateLicenseKeys, signLicense } from '@clumera/kernel';
import { loadClientConfig } from '@clumera/config/node';

const modules = process.argv.slice(2);
const cfg = loadClientConfig();
const keys = await generateLicenseKeys();
const token = await signLicense(
  {
    v: 1,
    licenseId: `dev-${Date.now()}`,
    clientId: cfg.identity.clientId,
    modules,
    limits: { sports: 2 },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  },
  keys.privateKey,
);
console.log(`CLUMERA_LICENSE_PUBLIC_KEY=${keys.publicKey}`);
console.log(`CLUMERA_LICENSE=${token}`);

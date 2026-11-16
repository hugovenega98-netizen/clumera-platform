/** Genera el par de claves de licencias de Management. La privada va solo al entorno de Management. */
import { generateLicenseKeys } from '@clumera/kernel';

const keys = await generateLicenseKeys();
console.log(`MANAGEMENT_LICENSE_PUBLIC_KEY=${keys.publicKey}`);
console.log(`MANAGEMENT_LICENSE_PRIVATE_KEY=${keys.privateKey}`);

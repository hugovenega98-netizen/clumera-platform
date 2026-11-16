import { beforeAll, describe, expect, it } from 'vitest';
import { generateLicenseKeys, signLicense, verifyLicense, type LicensePayload } from '../src';

let keys: { publicKey: string; privateKey: string };
const payload: LicensePayload = {
  v: 1,
  licenseId: 'lic_1',
  clientId: 'club-ejemplo',
  modules: ['facilities', 'bookings'],
  limits: { sports: 2 },
  issuedAt: '2026-11-01T00:00:00.000Z',
  expiresAt: '2027-11-01T00:00:00.000Z',
};

beforeAll(async () => {
  keys = await generateLicenseKeys();
});

describe('licencias', () => {
  it('acepta una licencia firmada para esta instalación', async () => {
    const token = await signLicense(payload, keys.privateKey);
    const r = await verifyLicense(token, { publicKey: keys.publicKey, clientId: 'club-ejemplo', now: new Date('2026-12-01') });
    expect(r.ok && r.value.modules).toEqual(['facilities', 'bookings']);
  });

  it('rechaza una licencia alterada', async () => {
    const token = await signLicense(payload, keys.privateKey);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, modules: ['store'] })).toString('base64url');
    const r = await verifyLicense(`${forged}.${sig}`, { publicKey: keys.publicKey, clientId: 'club-ejemplo' });
    expect(r.ok).toBe(false);
  });

  it('rechaza la licencia de otro club, una vencida y una firmada con otra clave', async () => {
    const token = await signLicense(payload, keys.privateKey);
    const other = await generateLicenseKeys();
    const wrongClub = await verifyLicense(token, { publicKey: keys.publicKey, clientId: 'otro-club', now: new Date('2026-12-01') });
    const expired = await verifyLicense(token, { publicKey: keys.publicKey, clientId: 'club-ejemplo', now: new Date('2028-01-01') });
    const wrongKey = await verifyLicense(token, { publicKey: other.publicKey, clientId: 'club-ejemplo', now: new Date('2026-12-01') });
    for (const r of [wrongClub, expired, wrongKey]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('license_invalid');
    }
  });

  it('rechaza basura sin lanzar excepciones', async () => {
    for (const t of ['', 'abc', 'a.b.c', '!!.??']) {
      const r = await verifyLicense(t, { publicKey: keys.publicKey, clientId: 'club-ejemplo' });
      expect(r.ok).toBe(false);
    }
  });
});

import crypto from 'node:crypto';

// scrypt parameters (OWASP-recommended minimum: N=2^15, r=8, p=1 → ~32MB RAM per hash)
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Returns `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time verification. Returns false for malformed or missing hashes. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  try {
    if (typeof password !== 'string' || !stored) return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// Used to burn the same CPU time when the email does not exist (prevents user enumeration by timing).
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

/** Sync variant, for seeding only (never call from a request handler). */
export function hashPasswordSync(password: string): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

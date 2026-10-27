import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const AUTH_SECRET = process.env.AUTH_SECRET || 'dsa-academy-production-grade-secure-auth-secret-key-32b!';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'student' | 'admin';
}

/**
 * Signs a tamper-proof JWT token with HMAC-SHA256 signature and expiration.
 */
export function signAuthToken(
  user: { id: number; email: string; role: string },
  expiresInMs: number = 7 * 86400000
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Date.now() + expiresInMs,
    })
  ).toString('base64url');

  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verifies the signature and expiration of an auth token using timing-safe comparison.
 */
export function verifyAuthToken(token: string): { id: number; email: string; role: string } | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${payload}`).digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp === 'number' && Date.now() > data.exp) {
      return null; // Token expired
    }

    return { id: data.sub, email: data.email, role: data.role };
  } catch {
    return null;
  }
}

/**
 * Extracts auth token from Authorization header or session cookie.
 */
export function extractAuthToken(req: { headers: { authorization?: string; cookie?: string } }): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

/**
 * Resolves authenticated user from request without trusting insecure headers.
 */
export function userFromRequest(
  req: { headers: { authorization?: string; cookie?: string } },
  database: Database.Database
): AuthUser | null {
  const token = extractAuthToken(req);
  if (!token) return null;

  const decoded = verifyAuthToken(token);
  if (!decoded) return null;

  const row = database
    .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
    .get(decoded.id) as AuthUser | undefined;

  return row ?? null;
}

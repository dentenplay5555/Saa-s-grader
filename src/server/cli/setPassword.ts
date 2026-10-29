// Usage: npm run set-password -- user@example.com [newPassword]
// If newPassword is omitted it is read from the SET_PASSWORD env var, else a random one is generated and printed.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { hashPassword } from '../password.js';

const [email, argPw] = process.argv.slice(2);
if (!email) {
  console.error('usage: npm run set-password -- <email> [password]');
  process.exit(1);
}
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
if (!user) {
  console.error(`no such user: ${email}`);
  process.exit(1);
}
const generated = !argPw && !process.env.SET_PASSWORD;
const pw = argPw || process.env.SET_PASSWORD || crypto.randomBytes(9).toString('base64url');
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(pw), user.id);
console.log(generated ? `password for ${email}: ${pw}` : `password updated for ${email}`);

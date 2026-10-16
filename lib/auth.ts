// Staff login: two shared passwords from env vars.
//   ADMIN_PASSWORD  -> role "admin" (import data, records, photos, notice, results)
//   ENTRY_PASSWORD  -> role "entry" (enter and publish results only)
// The session is an HMAC-signed cookie, valid for 4 days (covers the whole meet).
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export type Role = 'admin' | 'entry';
const COOKIE = 'kp_staff';
const MAX_AGE = 4 * 24 * 3600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return s ?? 'dev-secret';
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function roleForPassword(pw: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'admin');
  const entry = process.env.ENTRY_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'entry');
  if (admin && safeEqual(pw, admin)) return 'admin';
  if (entry && safeEqual(pw, entry)) return 'entry';
  return null;
}

export async function startSession(role: Role, name: string) {
  const payload = Buffer.from(JSON.stringify({ role, name, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentStaff(): Promise<{ role: Role; name: string } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp < Date.now()) return null;
  return { role: data.role, name: data.name };
}

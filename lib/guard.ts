import 'server-only';
import { NextResponse } from 'next/server';
import { currentStaff, type Role } from './auth';
import { ConflictError } from './storage';

/** Wrap an admin API handler: checks the session role and turns errors into JSON. */
export async function guarded(need: Role, fn: (staff: { role: Role; name: string }) => Promise<unknown>) {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  if (need === 'admin' && staff.role !== 'admin') return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });
  try {
    return NextResponse.json(await fn(staff));
  } catch (e) {
    const status = e instanceof ConflictError ? 409 : e instanceof BadRequest ? 400 : 500;
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export class BadRequest extends Error {}

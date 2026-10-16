import { NextResponse } from 'next/server';
import { endSession, roleForPassword, startSession } from '@/lib/auth';

export async function POST(req: Request) {
  const { password, name } = await req.json();
  const role = roleForPassword(String(password ?? ''));
  if (!role) return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
  await startSession(role, String(name || role).slice(0, 30));
  return NextResponse.json({ role });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { endSession, roleForPassword, startSession } from '@/lib/auth';

export async function POST(req: Request) {
  const { password, name } = await req.json();
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
    return NextResponse.json({ error: '伺服器未設定 ADMIN_PASSWORD 或 SESSION_SECRET，請在 Vercel 填好後重新部署' }, { status: 503 });
  }
  const role = roleForPassword(String(password ?? ''));
  if (!role) {
    // slow down password guessing
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
  }
  await startSession(role, String(name || role).slice(0, 30));
  return NextResponse.json({ role });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}

// Viewer login: class code + the class's 4-digit PIN, or an athlete's bib + their class's PIN.
// On success returns the data key that decrypts meet.json / live.json in the browser.
import { NextResponse } from 'next/server';
import { normCls } from '@/lib/pins';
import { dataKeyB64, loadMeet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Best-effort brake on PIN guessing (per server instance): 10 failures per IP per 10 minutes.
const fails = new Map<string, { n: number; since: number }>();
const WINDOW = 10 * 60_000;
const LIMIT = 10;

function tooMany(ip: string) {
  const f = fails.get(ip);
  return Boolean(f && Date.now() - f.since < WINDOW && f.n >= LIMIT);
}
function fail(ip: string, error: string) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.since > WINDOW) fails.set(ip, { n: 1, since: Date.now() });
  else f.n += 1;
  return new Promise<NextResponse>((r) => setTimeout(() => r(NextResponse.json({ error }, { status: 401 })), 700));
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (tooMany(ip)) return NextResponse.json({ error: '嘗試次數太多，請 10 分鐘後再試' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();

  try {
    const { doc: meet } = await loadMeet();
    const pins = meet.classPins ?? {};
    if (body.type === 'class') {
      const cls = normCls(String(body.cls ?? ''));
      const entry = Object.entries(pins).find(([c]) => normCls(c) === cls);
      if (!entry || !/^\d{4}$/.test(pin) || entry[1] !== pin) return fail(ip, '班級或密碼不正確');
      return NextResponse.json({ key: dataKeyB64(), identity: { type: 'class', cls: entry[0] } });
    }
    if (body.type === 'athlete') {
      // an athlete proves membership with the bib plus the PIN of their own class
      const bib = String(body.bib ?? '').trim().toUpperCase();
      const a = meet.athletes.find((x) => x.bib.toUpperCase() === bib);
      if (!a || !/^\d{4}$/.test(pin) || pins[a.cls] !== pin) return fail(ip, '號碼布或密碼不正確');
      return NextResponse.json({ key: dataKeyB64(), identity: { type: 'athlete', cls: a.cls, bib: a.bib } });
    }
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `伺服器錯誤：${(e as Error).message}` }, { status: 500 });
  }
}

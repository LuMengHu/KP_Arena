// Fallback reader for the public JSON and thumbnails, used when NEXT_PUBLIC_DATA_URL
// is not set (local development, or before the R2 custom domain is ready).
// Serves the files exactly as stored, so with ACCESS_CODE on they stay encrypted here too.
import { NextResponse } from 'next/server';
import { getFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const key = (await ctx.params).path.join('/');
  if (key === 'meet.json' || key === 'live.json') {
    const f = await getFile(key);
    if (!f) return new NextResponse('not found', { status: 404 });
    return new NextResponse(new Uint8Array(f.body), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30' },
    });
  }
  if (/^photos\/[\w-]+\.jpg$/.test(key)) {
    const f = await getFile(key);
    if (!f) return new NextResponse('not found', { status: 404 });
    return new NextResponse(new Uint8Array(f.body), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }
  return new NextResponse('not found', { status: 404 });
}

// Fallback reader for the public JSON and thumbnails, used when NEXT_PUBLIC_DATA_URL
// is not set (local development, or before the R2 custom domain is ready).
import { NextResponse } from 'next/server';
import { getFile, loadLive, loadMeet } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const key = (await ctx.params).path.join('/');
  const headers = { 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30' };
  if (key === 'meet.json') return NextResponse.json((await loadMeet()).doc, { headers });
  if (key === 'live.json') return NextResponse.json((await loadLive()).doc, { headers });
  if (/^photos\/[\w-]+\.jpg$/.test(key)) {
    const f = await getFile(key);
    if (!f) return new NextResponse('not found', { status: 404 });
    return new NextResponse(new Uint8Array(f.body), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }
  return new NextResponse('not found', { status: 404 });
}

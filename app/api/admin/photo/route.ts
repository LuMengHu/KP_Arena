// Store a thumbnail (already shrunk in the browser) and link it to the full photo
// in an external album (Google Drive, Google Photos, OneDrive...).
import { randomUUID } from 'node:crypto';
import { BadRequest, guarded } from '@/lib/guard';
import { putPhoto, updateMeet } from '@/lib/storage';

export async function POST(req: Request) {
  const body = await req.json();
  return guarded('admin', async () => {
    const m = String(body.dataUrl ?? '').match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) throw new BadRequest('縮圖格式錯誤');
    const jpeg = Buffer.from(m[1], 'base64');
    if (jpeg.length > 400_000) throw new BadRequest('縮圖太大');
    const url = String(body.url ?? '').trim();
    if (!/^https:\/\//.test(url)) throw new BadRequest('請貼上以 https:// 開頭的原圖或相簿連結');
    const id = randomUUID().slice(0, 12);
    const thumb = `photos/${id}.jpg`;
    await putPhoto(thumb, jpeg);
    const meet = await updateMeet((mt) => {
      mt.photos.push({ id, thumb, url, caption: String(body.caption ?? '').slice(0, 80), day: body.day ? Number(body.day) : null });
    });
    return { meet };
  });
}

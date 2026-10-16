import { guarded } from '@/lib/guard';
import { loadLive, loadMeet, storageMode } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded('entry', async (staff) => {
    const [meet, live] = await Promise.all([loadMeet(), loadLive()]);
    return { staff, meet: meet.doc, live: live.doc, storageMode, dataUrl: process.env.NEXT_PUBLIC_DATA_URL ?? '' };
  });
}

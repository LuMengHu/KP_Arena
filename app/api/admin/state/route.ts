import { guarded } from '@/lib/guard';
import { encryption, loadLive, loadMeet, storageMode } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded('entry', async (staff) => {
    const [meet, live] = await Promise.all([loadMeet(), loadLive()]);
    // files still in plain text (or sealed with the old code) need a re-seal from the settings tab
    const needsReseal = encryption === 'on' && (meet.sealedWith !== 'current' || live.sealedWith !== 'current');
    return {
      staff,
      meet: meet.doc,
      live: live.doc,
      storageMode,
      encryption,
      needsReseal,
      dataUrl: process.env.NEXT_PUBLIC_DATA_URL ?? '',
    };
  });
}

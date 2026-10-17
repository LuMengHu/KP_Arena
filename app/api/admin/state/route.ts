import { guarded } from '@/lib/guard';
import { loadLive, loadMeet, resealAll, storageMode } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded('entry', async (staff) => {
    let [meet, live] = await Promise.all([loadMeet(), loadLive()]);
    // Files still in an old format (plain text, the old access code, or a previous SESSION_SECRET)
    // are rewritten the first time staff open the dashboard, which also creates public.json.
    if (!meet.current || !live.current) {
      await resealAll();
      [meet, live] = await Promise.all([loadMeet(), loadLive()]);
    }
    // class PINs are for the administrator only
    const doc = staff.role === 'admin' ? meet.doc : { ...meet.doc, classPins: undefined };
    return {
      staff,
      meet: doc,
      live: live.doc,
      storageMode,
      dataUrl: process.env.NEXT_PUBLIC_DATA_URL ?? '',
    };
  });
}

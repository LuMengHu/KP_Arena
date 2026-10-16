// Admin edits to meet.json: roster / start-list / record import, notice banner,
// schedule time changes, photo removal.
import { BadRequest, guarded } from '@/lib/guard';
import { updateMeet } from '@/lib/storage';
import type { Athlete, MeetRecord } from '@/lib/types';

interface EntryRow {
  roundId: string;
  bib?: string;
  team?: string;
  heat?: number;
  lane?: number;
}

export async function POST(req: Request) {
  const body = await req.json();
  return guarded('admin', async () => {
    switch (body.action) {
      case 'import': {
        const athletes = body.athletes as Athlete[] | undefined;
        const entries = body.entries as EntryRow[] | undefined;
        const records = body.records as MeetRecord[] | undefined;
        const unknownRounds = new Set<string>();
        const meet = await updateMeet((m) => {
          if (athletes) m.athletes = athletes;
          if (records) m.records = records;
          if (entries) {
            for (const r of m.rounds) r.entries = [];
            for (const e of entries) {
              const r = m.rounds.find((x) => x.id === e.roundId);
              if (!r) {
                unknownRounds.add(e.roundId);
                continue;
              }
              r.entries.push({ bib: e.bib || undefined, team: e.team || undefined, heat: e.heat || undefined, lane: e.lane || undefined });
            }
          }
          if (athletes || entries) m.demo = false;
        });
        return { meet, unknownRounds: [...unknownRounds] };
      }
      case 'notice': {
        const meet = await updateMeet((m) => {
          m.notice = String(body.notice ?? '').slice(0, 300);
        });
        return { meet };
      }
      case 'round': {
        if (!/^\d{1,2}:\d{2}$/.test(body.time)) throw new BadRequest('時間格式應為 9:30');
        const meet = await updateMeet((m) => {
          const r = m.rounds.find((x) => x.id === body.id);
          if (!r) throw new BadRequest('找不到此賽次');
          r.time = body.time;
          if (typeof body.note === 'string') r.note = body.note || undefined;
          m.rounds.sort((a, b) => a.day - b.day || toMin(a.time) - toMin(b.time) || a.id.localeCompare(b.id));
        });
        return { meet };
      }
      case 'photo-delete': {
        const meet = await updateMeet((m) => {
          m.photos = m.photos.filter((p) => p.id !== body.id);
        });
        return { meet };
      }
      default:
        throw new BadRequest('unknown action');
    }
  });
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

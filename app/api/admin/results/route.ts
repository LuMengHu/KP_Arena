// Publish / withdraw a round's results, or mark a round as running.
import { BadRequest, guarded } from '@/lib/guard';
import { finalizeRows, recordFor } from '@/lib/marks';
import { loadMeet, updateLive } from '@/lib/storage';
import type { ResultRow } from '@/lib/types';

export async function POST(req: Request) {
  const body = await req.json();
  return guarded('entry', async (staff) => {
    const { doc: meet } = await loadMeet();
    const round = meet.rounds.find((r) => r.id === body.roundId);
    if (!round) throw new BadRequest('找不到此賽次');

    if (body.action === 'running') {
      const live = await updateLive((l) => {
        l.running = l.running.filter((id) => id !== round.id);
        if (body.running) l.running.push(round.id);
      });
      return { live };
    }

    if (body.action === 'withdraw') {
      const live = await updateLive((l) => {
        delete l.results[round.id];
      });
      return { live };
    }

    const byBib = new Map(meet.athletes.map((a) => [a.bib, a]));
    const rows: ResultRow[] = (body.rows as ResultRow[])
      .filter((r) => r.bib || r.team || r.name)
      .map((r) => {
        const a = r.bib ? byBib.get(String(r.bib).trim()) : undefined;
        return {
          bib: r.bib ? String(r.bib).trim() : undefined,
          team: r.team?.trim() || undefined,
          name: r.name?.trim() || a?.name,
          cls: r.cls?.trim() || a?.cls,
          heat: r.heat ? Number(r.heat) : undefined,
          rank: r.rank ? Number(r.rank) : null,
          mark: String(r.mark ?? '').trim(),
          status: r.status || '',
        };
      });
    if (!rows.length) throw new BadRequest('沒有成績可發佈');
    const finalRows = finalizeRows(rows, round, recordFor(meet, round));
    const live = await updateLive((l) => {
      l.results[round.id] = { rows: finalRows, publishedAt: new Date().toISOString(), by: staff.name };
      l.running = l.running.filter((id) => id !== round.id);
    });
    return { live };
  });
}

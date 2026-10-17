import { lowerIsBetter, parseTitle, recordKey } from './eventName';
import type { Meet, MeetRecord, ResultRow, Round } from './types';

/** Paper-sheet notation 2'15"30 -> 2:15.30; strips a trailing unit. */
const normalizeMark = (mark: string) =>
  mark
    .trim()
    .replace(/\s*(秒|米|s|m)$/i, '')
    .replace(/[′']/g, ':')
    .replace(/[″"]/g, '.')
    .replace(/\.$/, '');

/** "12.34" -> 12.34, "2:15.30" -> 135.3, "5.20" -> 5.2. Returns null if unreadable. */
export function markValue(mark: string): number | null {
  const s = normalizeMark(mark);
  if (!s) return null;
  const parts = s.split(':');
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/**
 * Mark with its unit for display: running events and relays in seconds ("12.34秒", "2分15.30秒"),
 * jumps and throws in metres ("5.20米"). Anything unreadable is shown as typed.
 */
export function formatMark(mark: string, kind: Round['kind']): string {
  const s = normalizeMark(mark);
  if (!s || markValue(s) === null) return mark.trim();
  if (kind === 'field') return `${s}米`;
  const parts = s.split(':');
  if (parts.length === 3) return `${Number(parts[0])}時${Number(parts[1])}分${parts[2]}秒`;
  if (parts.length === 2) return `${Number(parts[0])}分${parts[1]}秒`;
  return `${s}秒`;
}

/** Same, when only the event title is at hand (e.g. a meet record keyed "男甲100M"). */
export const formatMarkFor = (mark: string, title: string) => formatMark(mark, parseTitle(title).kind);

export function recordFor(meet: Meet, round: Round): MeetRecord | null {
  const key = recordKey(parseTitle(round.title));
  return key ? meet.records.find((r) => r.key === key) ?? null : null;
}

/** Is this mark better than the record? Ties do not break a record. */
export function beats(mark: string, record: MeetRecord | null, kind: Round['kind']): boolean {
  if (!record) return false;
  const a = markValue(mark);
  const b = markValue(record.mark);
  if (a === null || b === null) return false;
  return lowerIsBetter(kind) ? a < b : a > b;
}

/**
 * Fill in missing ranks from marks (ties share a rank), put DNS/DNF/DQ last,
 * and flag rows that break the record.
 */
export function finalizeRows(rows: ResultRow[], round: Round, record: MeetRecord | null): ResultRow[] {
  const lower = lowerIsBetter(round.kind);
  const valid = rows.filter((r) => !r.status && markValue(r.mark) !== null);
  const invalid = rows.filter((r) => !valid.includes(r));
  const needRank = valid.some((r) => r.rank == null);
  if (needRank) {
    valid.sort((a, b) => (markValue(a.mark)! - markValue(b.mark)!) * (lower ? 1 : -1));
    valid.forEach((r, i) => {
      const prev = valid[i - 1];
      r.rank = prev && markValue(prev.mark) === markValue(r.mark) ? prev.rank : i + 1;
    });
  } else {
    valid.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }
  for (const r of valid) r.record = beats(r.mark, record, round.kind);
  for (const r of invalid) {
    r.rank = null;
    r.record = false;
  }
  return [...valid, ...invalid];
}

/** Sanity checks shown to the person entering results before they publish. */
export function warnings(rows: ResultRow[], round: Round, meet: Meet): string[] {
  const out: string[] = [];
  const bibs = new Set(meet.athletes.map((a) => a.bib));
  const seen = new Set<string>();
  for (const r of rows) {
    const who = r.bib || r.team || r.name || '?';
    if (r.bib) {
      if (seen.has(r.bib)) out.push(`號碼 ${r.bib} 重複`);
      seen.add(r.bib);
      if (bibs.size && !bibs.has(r.bib)) out.push(`號碼 ${r.bib} 不在名單中`);
    }
    if (!r.status && markValue(r.mark) === null) out.push(`${who} 的成績「${r.mark}」無法識別`);
    const v = markValue(r.mark);
    if (v !== null && round.kind === 'track') {
      const dist = Number(round.event.match(/(\d+)M/)?.[1] ?? 0);
      // Faster than ~10.5 m/s is almost certainly a typo for a school meet.
      if (dist && v < dist / 10.5) out.push(`${who} 的 ${r.mark} 秒快得不合理，請核對`);
    }
  }
  return out;
}

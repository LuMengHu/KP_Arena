import { lowerIsBetter, parseTitle, recordKey } from './eventName';
import type { Meet, MeetRecord, ResultRow, Round } from './types';

/**
 * How a mark was typed. Times: "23.69" = 秒.百分秒, "10.20.39" = 分.秒.百分秒 (also 10:20.39 or the
 * paper-sheet 10'20"39). Distances: "5.20" = 米.厘米.
 */
export type MarkShape = 's' | 's.c' | 'm:s' | 'm:s.c';

export interface ParsedMark {
  value: number; // seconds or metres, for sorting and record checks
  shape: MarkShape;
  canonical: string; // stored form: "23.69", "10:20.39", "5.20"
}

const MINUTE_SEP = /^(分|:|：|'|′|’)$/;
const pad2 = (s: string) => s.padStart(2, '0');

export function parseMark(mark: string, kind?: Round['kind']): ParsedMark | null {
  const s = mark.trim().replace(/\s*(秒|米|s|m)$/i, '');
  if (!s) return null;
  const tokens = s.split(/(分|:|：|'|′|’|\.|。|"|″|”|秒|\s+)/).filter((t) => t !== '');
  const nums = tokens.filter((_, i) => i % 2 === 0);
  const seps = tokens.filter((_, i) => i % 2 === 1);
  if (!nums.length || nums.some((n) => !/^\d+$/.test(n)) || seps.some((x) => x.length > 1 && !/^\s+$/.test(x))) return null;
  if (nums.length === 1) return { value: Number(nums[0]), shape: 's', canonical: String(Number(nums[0])) };
  if (nums.length === 2) {
    const [a, b] = nums;
    if (kind !== 'field' && MINUTE_SEP.test(seps[0])) {
      if (Number(b) >= 60 || b.length > 2) return null;
      return { value: Number(a) * 60 + Number(b), shape: 'm:s', canonical: `${Number(a)}:${pad2(b)}` };
    }
    if (b.length > 3) return null;
    return { value: Number(`${a}.${b}`), shape: 's.c', canonical: `${Number(a)}.${b}` };
  }
  if (nums.length === 3 && kind !== 'field') {
    const [m, sec, c] = nums;
    if (Number(sec) >= 60 || sec.length > 2 || c.length > 3) return null;
    return { value: Number(m) * 60 + Number(`${sec}.${c}`), shape: 'm:s.c', canonical: `${Number(m)}:${pad2(sec)}.${c}` };
  }
  return null;
}

/** "12.34" -> 12.34, "10.20.39" -> 620.39, "5.20" -> 5.2. Returns null if unreadable. */
export function markValue(mark: string, kind?: Round['kind']): number | null {
  return parseMark(mark, kind)?.value ?? null;
}

export const shapeLabel = (shape: MarkShape, kind: Round['kind']) =>
  kind === 'field' ? (shape === 's' ? '整數米' : '米.厘米') : { s: '整數秒', 's.c': '秒.百分秒', 'm:s': '分.秒', 'm:s.c': '分.秒.百分秒' }[shape];

/**
 * Mark with its unit for display: running events and relays in seconds ("12.34秒", "10分20.39秒"),
 * jumps and throws in metres ("5.20米"). Anything unreadable is shown as typed.
 */
export function formatMark(mark: string, kind: Round['kind']): string {
  const p = parseMark(mark, kind);
  if (!p) return mark.trim();
  if (kind === 'field') return `${p.canonical}米`;
  const [min, sec] = p.canonical.includes(':') ? p.canonical.split(':') : [null, p.canonical];
  return min ? `${min}分${sec}秒` : `${sec}秒`;
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
  const a = markValue(mark, kind);
  const b = markValue(record.mark, kind);
  if (a === null || b === null) return false;
  return lowerIsBetter(kind) ? a < b : a > b;
}

/**
 * Fill in missing ranks from marks (ties share a rank), put DNS/DNF/DQ last,
 * and flag rows that break the record.
 */
export function finalizeRows(rows: ResultRow[], round: Round, record: MeetRecord | null): ResultRow[] {
  const lower = lowerIsBetter(round.kind);
  const k = round.kind;
  const valid = rows.filter((r) => !r.status && markValue(r.mark, k) !== null);
  const invalid = rows.filter((r) => !valid.includes(r));
  const needRank = valid.some((r) => r.rank == null);
  if (needRank) {
    valid.sort((a, b) => (markValue(a.mark, k)! - markValue(b.mark, k)!) * (lower ? 1 : -1));
    valid.forEach((r, i) => {
      const prev = valid[i - 1];
      r.rank = prev && markValue(prev.mark, k) === markValue(r.mark, k) ? prev.rank : i + 1;
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
    if (!r.status && r.mark.trim() && markValue(r.mark, round.kind) === null) out.push(`${who} 的成績「${r.mark}」無法識別`);
    const v = r.status ? null : markValue(r.mark, round.kind);
    if (v !== null && round.kind === 'track') {
      const dist = Number(round.event.match(/(\d+)M/)?.[1] ?? 0);
      // Faster than ~10.5 m/s is almost certainly a typo for a school meet.
      if (dist && v < dist / 10.5) out.push(`${who} 的 ${formatMark(r.mark, round.kind)} 快得不合理，請核對（超過一分鐘要輸入三段，例如 10.20.39）`);
    }
  }
  const mixed = shapeMix(rows, round.kind);
  if (mixed) out.push(mixed);
  return out;
}

/**
 * Self-check: every mark in one event should be typed the same way (all 秒.百分秒, or all 分.秒.百分秒).
 * Returns a message naming the odd ones out, or '' when consistent.
 */
export function shapeMix(rows: ResultRow[], kind: Round['kind']): string {
  const groups = new Map<MarkShape, string[]>();
  for (const r of rows) {
    if (r.status) continue;
    const p = parseMark(r.mark, kind);
    if (!p) continue;
    groups.set(p.shape, [...(groups.get(p.shape) ?? []), r.bib || r.team || r.name || '?']);
  }
  if (groups.size < 2) return '';
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const [main, ...rest] = sorted;
  return `成績格式不一致：大部分是「${shapeLabel(main[0], kind)}」，但 ${rest
    .map(([shape, who]) => `${who.join('、')} 是「${shapeLabel(shape, kind)}」`)
    .join('；')}。請核對是否漏打或多打一段。`;
}

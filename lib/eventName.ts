// Parse a Chinese event title from the schedule (e.g. "男甲110M(欄)決[1.00M]")
// into structured parts.

export type Kind = 'track' | 'field' | 'relay' | 'other';

export interface ParsedTitle {
  gender: 'M' | 'F' | null;
  group: string | null; // 甲乙丙丁戊
  event: string; // e.g. "100M", "跳高", "110M(欄)", "4x100M(接)", "三項全能100M"
  round: string; // 初 | 複 | 決 | 分組決 | 合組決
  hurdle: string | null; // "1.00M"
  kind: Kind;
}

const FIELD = ['跳高', '跳遠', '三級跳遠', '鉛球', '壘球', '標槍', '鐵餅'];

export function parseTitle(raw: string): ParsedTitle {
  const title = raw.replace(/\s+/g, '');
  const m = title.match(/^(男|女)(甲|乙|丙|丁|戊)(.*)$/);
  if (!m) return { gender: null, group: null, event: title, round: '決', hurdle: null, kind: 'other' };
  let rest = m[3];
  let hurdle: string | null = null;
  const h = rest.match(/\[(.+?)\]/);
  if (h) {
    hurdle = h[1];
    rest = rest.replace(h[0], '');
  }
  let round = '決';
  const r = rest.match(/(分組決|合組決|初|複|決)$/);
  if (r) {
    round = r[1];
    rest = rest.slice(0, -r[1].length);
  }
  const event = rest;
  const bare = event.replace('三項全能', '');
  let kind: Kind = 'track';
  if (event.includes('(接)')) kind = 'relay';
  else if (FIELD.includes(bare)) kind = 'field';
  return { gender: m[1] === '男' ? 'M' : 'F', group: m[2], event, round, hurdle, kind };
}

/** Key used to look up the meet record for an event: "男甲100M". Combined-event parts have no record. */
export function recordKey(p: ParsedTitle): string | null {
  if (!p.gender || !p.group || p.event.startsWith('三項全能')) return null;
  return `${p.gender === 'M' ? '男' : '女'}${p.group}${p.event}`;
}

export const lowerIsBetter = (kind: Kind) => kind !== 'field';

/** Titles typed into Excel sometimes carry stray spaces ("男甲 100M 初"); drop them for display. */
export const titleFor = (raw: string) => raw.replace(/\s+/g, '');

export const groupLabel = (group: string) => `${group}組`;

export const genderLabel = (g: 'M' | 'F') => (g === 'M' ? '男' : '女');

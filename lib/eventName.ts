// Parse a Chinese event title from the schedule (e.g. "男甲110M(欄)決[1.00M]")
// into structured parts, and render it in zh / en / pt.

export type Lang = 'zh' | 'en' | 'pt';
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

const GROUP_EN: Record<string, string> = { 甲: 'A', 乙: 'B', 丙: 'C', 丁: 'D', 戊: 'E' };

const FIELD_NAMES: Record<string, { en: string; pt: string }> = {
  跳高: { en: 'High Jump', pt: 'Salto em Altura' },
  跳遠: { en: 'Long Jump', pt: 'Salto em Comprimento' },
  三級跳遠: { en: 'Triple Jump', pt: 'Triplo Salto' },
  鉛球: { en: 'Shot Put', pt: 'Lançamento do Peso' },
  壘球: { en: 'Softball Throw', pt: 'Lançamento da Bola' },
  標槍: { en: 'Javelin', pt: 'Lançamento do Dardo' },
  鐵餅: { en: 'Discus', pt: 'Lançamento do Disco' },
};

const ROUND_NAMES: Record<string, { zh: string; en: string; pt: string }> = {
  初: { zh: '初賽', en: 'Heats', pt: 'Eliminatórias' },
  複: { zh: '複賽', en: 'Semi-final', pt: 'Meias-finais' },
  決: { zh: '決賽', en: 'Final', pt: 'Final' },
  分組決: { zh: '分組決賽', en: 'Final (by heats)', pt: 'Final por Séries' },
  合組決: { zh: '合組決賽', en: 'Combined Final', pt: 'Final Conjunta' },
};

const SPECIAL: Record<string, { en: string; pt: string }> = {
  親子接力賽: { en: 'Parent-Child Relay', pt: 'Estafeta Pais e Filhos' },
  鏡平校友師生接力賽: { en: 'Alumni & Staff Relay', pt: 'Estafeta de Antigos Alunos e Professores' },
};

function eventName(event: string, lang: 'en' | 'pt'): string {
  let e = event;
  let prefix = '';
  if (e.startsWith('三項全能')) {
    prefix = lang === 'en' ? 'Triathlon ' : 'Triatlo ';
    e = e.replace('三項全能', '');
  }
  if (FIELD_NAMES[e]) return prefix + FIELD_NAMES[e][lang];
  const dist = e.match(/^(\d+x)?(\d+)M/i);
  if (!dist) return prefix + e;
  const d = `${dist[1] ?? ''}${dist[2]}m`;
  if (e.includes('(欄)')) return prefix + (lang === 'en' ? `${d} Hurdles` : `${d} Barreiras`);
  if (e.includes('(接)')) return prefix + (lang === 'en' ? `${d} Relay` : `Estafeta ${d}`);
  return prefix + d;
}

export function titleFor(raw: string, lang: Lang): string {
  const title = raw.replace(/\s+/g, '');
  if (lang === 'zh') return raw.replace(/(\S)\s(\S)/g, '$1$2');
  if (SPECIAL[title]) return SPECIAL[title][lang];
  const p = parseTitle(title);
  if (!p.gender) return title;
  const g =
    lang === 'en'
      ? `${p.gender === 'M' ? 'Boys' : 'Girls'} ${GROUP_EN[p.group!]}`
      : `${p.gender === 'M' ? 'Rapazes' : 'Raparigas'} ${GROUP_EN[p.group!]}`;
  const parts = [g, eventName(p.event, lang)];
  if (p.kind !== 'field' || p.round !== '決') parts.push(ROUND_NAMES[p.round][lang]);
  return parts.join(' · ') + (p.hurdle ? ` [${p.hurdle.replace('M', 'm')}]` : '');
}

export function groupLabel(group: string, lang: Lang): string {
  if (lang === 'zh') return `${group}組`;
  return `${lang === 'en' ? 'Group' : 'Grupo'} ${GROUP_EN[group] ?? group}`;
}

export function genderLabel(g: 'M' | 'F', lang: Lang): string {
  if (lang === 'zh') return g === 'M' ? '男' : '女';
  if (lang === 'en') return g === 'M' ? 'Boys' : 'Girls';
  return g === 'M' ? 'Rapazes' : 'Raparigas';
}

// Generates demo data (fake names) so the app can be tried before the school's Excel arrives:
//   samples/demo.xlsx     -> import it in /admin to fill roster, start lists and records
//   public/template.xlsx  -> empty template with the expected column names
//   .data/meet.json, .data/live.json -> local-mode data with some results already published
// Run: npm run seed-demo
import { mkdirSync, writeFileSync } from 'node:fs';
import writeXlsxFile from 'write-excel-file/node';
import schedule from '../data/schedule.json';
import { parseTitle, recordKey } from '../lib/eventName';
import { finalizeRows } from '../lib/marks';
import type { Athlete, Live, Meet, MeetRecord, ResultRow, Round } from '../lib/types';

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const SURNAMES = '陳李黃張梁林何吳劉郭蔡鄭謝羅馮甘歐蘇葉潘'.split('');
const GIVEN_M = '浩俊子軒志偉家樂嘉豪文傑卓霖柏宇天朗'.split('');
const GIVEN_F = '詩穎嘉欣曉彤芷晴凱琳思敏雅婷佩珊慧怡'.split('');
const GROUP_CLASSES: Record<string, string[]> = {
  甲: ['S5A', 'S5B', 'S6A', 'S6B'],
  乙: ['S3A', 'S3B', 'S4A', 'S4B'],
  丙: ['S1A', 'S1B', 'S2A', 'S2B'],
  丁: ['P5A', 'P5B', 'P6A', 'P6B'],
  戊: ['P3A', 'P3B', 'P4A', 'P4B'],
};

const rounds = structuredClone(schedule.rounds) as Round[];
const athletes: Athlete[] = [];
let bibNo = 1001;
const pools = new Map<string, Athlete[]>();
for (const [group, classes] of Object.entries(GROUP_CLASSES)) {
  for (const gender of ['M', 'F'] as const) {
    const pool: Athlete[] = [];
    for (let i = 0; i < 70; i++) {
      const given = gender === 'M' ? GIVEN_M : GIVEN_F;
      const a: Athlete = {
        bib: String(bibNo++),
        name: pick(SURNAMES) + pick(given) + pick(given),
        cls: pick(classes),
        gender,
        group,
      };
      athletes.push(a);
      pool.push(a);
    }
    pools.set(gender + group, pool);
  }
}

// Start lists for first rounds and single finals; later rounds stay empty until results exist.
for (const r of rounds) {
  if (!r.gender || !r.group || r.round === '複' || (r.round === '決' && rounds.some((x) => x.event === r.event && x.gender === r.gender && x.group === r.group && x.round === '初'))) continue;
  const pool = [...pools.get(r.gender + r.group)!].sort(() => rand() - 0.5);
  const n = Math.min(r.count ?? 8, pool.length);
  const heats = r.heats ?? 1;
  if (r.kind === 'relay') {
    const classes = GROUP_CLASSES[r.group];
    for (let i = 0; i < Math.min(n, classes.length * 2); i++)
      r.entries.push({ team: `${classes[i % classes.length]}${i >= classes.length ? '-2' : ''}`, heat: (i % heats) + 1, lane: Math.floor(i / heats) + 1 });
    continue;
  }
  for (let i = 0; i < n; i++) {
    r.entries.push({ bib: pool[i].bib, heat: r.kind === 'field' ? undefined : (i % heats) + 1, lane: r.kind === 'field' ? undefined : Math.floor(i / heats) + 1 });
  }
}

// Plausible marks per event for demo results and records.
function fakeMark(r: Round, quality: number): string {
  const p = parseTitle(r.title);
  const youth = { 甲: 1, 乙: 1.06, 丙: 1.12, 丁: 1.22, 戊: 1.32 }[p.group ?? '甲'] ?? 1;
  const girl = p.gender === 'F' ? 1.12 : 1;
  const dist = Number(r.event.match(/(\d+)M/)?.[1] ?? 0);
  if (r.kind === 'field') {
    const base: Record<string, number> = { 跳高: 1.5, 跳遠: 5.2, 三級跳遠: 11, 鉛球: 9.5, 壘球: 45, 標槍: 32, 鐵餅: 28 };
    const b = base[p.event.replace('三項全能', '')] ?? 5;
    return ((b / youth / girl) * (0.8 + 0.25 * quality)).toFixed(2);
  }
  const speed = dist <= 110 ? 7.6 : dist <= 400 ? 6.6 : dist <= 1500 ? 5.4 : 4.9;
  let secs = (dist / speed) * youth * girl * (1.15 - 0.2 * quality);
  if (r.event.includes('(欄)')) secs *= 1.15;
  if (r.kind === 'relay') secs = ((Number(r.event.match(/x(\d+)/)?.[1] ?? 100) * 4) / speed) * youth * girl * (1.1 - 0.15 * quality);
  if (secs < 60) return secs.toFixed(2);
  const m = Math.floor(secs / 60);
  return `${m}:${(secs - m * 60).toFixed(2).padStart(5, '0')}`;
}

const records: MeetRecord[] = [];
const seen = new Set<string>();
for (const r of rounds) {
  const key = recordKey(parseTitle(r.title));
  if (!key || seen.has(key)) continue;
  seen.add(key);
  records.push({ key, mark: fakeMark(r, 1.05), holder: pick(SURNAMES) + pick(GIVEN_M) + pick(GIVEN_F), year: String(2010 + Math.floor(rand() * 15)) });
}

// Publish results for the first morning so the public pages have something to show.
const live: Live = { version: 1, updatedAt: new Date().toISOString(), results: {}, running: [] };
const meet: Meet = {
  version: 1,
  updatedAt: new Date().toISOString(),
  name: { zh: '2026學年度鏡平學校田徑運動會', en: 'Kiang Ping School Athletics Meet 2026', pt: 'Encontro de Atletismo da Escola Kiang Ping 2026' },
  days: schedule.days,
  rounds,
  athletes,
  records,
  photos: [],
  notice: '',
  demo: true,
};
const byBib = new Map(athletes.map((a) => [a.bib, a]));
for (const r of rounds.filter((x) => x.day === 1 && Number(x.id) <= 120 && x.entries.length)) {
  const rows: ResultRow[] = r.entries.map((e) => ({
    bib: e.bib,
    team: e.team,
    name: e.bib ? byBib.get(e.bib)?.name : undefined,
    cls: e.bib ? byBib.get(e.bib)?.cls : e.team,
    heat: e.heat,
    rank: null,
    mark: rand() < 0.04 ? '' : fakeMark(r, rand() * (r.id === '105' ? 1.2 : 1)),
    status: '',
  }));
  for (const row of rows) if (!row.mark) row.status = 'DNS';
  const rec = records.find((x) => x.key === recordKey(parseTitle(r.title))) ?? null;
  live.results[r.id] = { rows: finalizeRows(rows, r, rec), publishedAt: new Date(Date.now() - (130 - Number(r.id)) * 60000).toISOString(), by: 'demo' };
}
live.running = ['121', '122'];

mkdirSync('.data', { recursive: true });
writeFileSync('.data/meet.json', JSON.stringify(meet));
writeFileSync('.data/live.json', JSON.stringify(live));

// ---- spreadsheets ----
type Cell = { value: string | number; fontWeight?: 'bold' } | null;
const head = (xs: string[]): Cell[] => xs.map((value) => ({ value, fontWeight: 'bold' }));
const rowOf = (xs: (string | number | undefined)[]): Cell[] => xs.map((v) => (v === undefined || v === '' ? null : { value: v }));

const athleteSheet = (list: Athlete[]) => [head(['號碼布', '姓名', '班級', '性別', '組別']), ...list.map((a) => rowOf([a.bib, a.name, a.cls, a.gender === 'M' ? '男' : '女', a.group]))];
const entrySheet = (list: Round[]) => [
  head(['序號', '項目', '號碼布', '班級/隊伍', '組次', '道次']),
  ...list.flatMap((r) => r.entries.map((e) => rowOf([r.id, r.title, e.bib, e.team, e.heat, e.lane]))),
];
const recordSheet = (list: MeetRecord[]) => [head(['項目', '成績', '保持者', '年份']), ...list.map((r) => rowOf([r.key, r.mark, r.holder, r.year]))];

mkdirSync('samples', { recursive: true });
await writeXlsxFile(
  [
    { sheet: '運動員', data: athleteSheet(athletes) as never },
    { sheet: '參賽名單', data: entrySheet(rounds) as never },
    { sheet: '大會紀錄', data: recordSheet(records) as never },
  ],
).toFile('samples/demo.xlsx');

const r101 = rounds.find((r) => r.id === '105')!;
await writeXlsxFile(
  [
    { sheet: '運動員', data: athleteSheet([{ bib: '1001', name: '陳大文', cls: 'S5A', gender: 'M', group: '甲' }]) as never },
    { sheet: '參賽名單', data: entrySheet([{ ...r101, entries: [{ bib: '1001', heat: 1, lane: 4 }] }, { ...rounds.find((r) => r.id === '156')!, entries: [{ team: 'S1A', heat: 1, lane: 3 }] }]) as never },
    { sheet: '大會紀錄', data: recordSheet([{ key: '男甲100M', mark: '11.52', holder: '李小明', year: '2019' }]) as never },
  ],
).toFile('public/template.xlsx');

console.log(`${athletes.length} athletes, ${rounds.reduce((n, r) => n + r.entries.length, 0)} entries, ${records.length} records, ${Object.keys(live.results).length} demo results`);

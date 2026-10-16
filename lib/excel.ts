// Read the school's Excel workbook (in the browser) into roster, start lists and records.
// Column headers are matched loosely so small differences in the school's sheet still work.
import readXlsxFile from 'read-excel-file/browser';
import type { Athlete, MeetRecord, Round } from './types';

type Cell = string | number | boolean | Date | null;

const ALIASES = {
  bib: ['號碼布', '號碼', '编号', '編號', '號碼牌', '号码布', '号码', 'bib'],
  name: ['姓名', '名字', 'name'],
  cls: ['班級', '班別', '班级', '班别', 'class'],
  gender: ['性別', '性别', 'gender', 'sex'],
  group: ['組別', '组别', 'group'],
  roundId: ['序號', '序号', '賽次', '赛次', '場次', 'id'],
  title: ['項目', '项目', '比賽項目', 'event'],
  team: ['隊伍', '队伍', '班級/隊伍', 'team'],
  heat: ['組次', '组次', '組', '组', 'heat'],
  lane: ['道次', '道', 'lane'],
  mark: ['成績', '成绩', '紀錄', '纪录', 'mark', 'record'],
  holder: ['保持者', '紀錄保持者', 'holder'],
  year: ['年份', '年度', 'year'],
} as const;
type Field = keyof typeof ALIASES;

const norm = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());

/** Map header row -> field -> column index. */
function headerMap(header: Cell[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const s = norm(h).toLowerCase().replace(/\s+/g, '');
    for (const [field, names] of Object.entries(ALIASES) as [Field, readonly string[]][]) {
      if (out[field] === undefined && names.some((n) => s === n.toLowerCase())) out[field] = i;
    }
  });
  return out;
}

function findSheet(sheets: { sheet: string; data: Cell[][] }[], need: Field[], skip: Field[] = []) {
  for (const s of sheets) {
    // header may not be on the first row (titles above the table are common)
    for (let r = 0; r < Math.min(5, s.data.length); r++) {
      const map = headerMap(s.data[r]);
      if (need.every((f) => map[f] !== undefined) && skip.every((f) => map[f] === undefined)) {
        return { name: s.sheet, map, rows: s.data.slice(r + 1).filter((row) => row.some((c) => norm(c))) };
      }
    }
  }
  return null;
}

export interface ImportResult {
  athletes?: Athlete[];
  entries?: { roundId: string; bib?: string; team?: string; heat?: number; lane?: number }[];
  records?: MeetRecord[];
  problems: string[];
  sheets: string[];
}

export async function parseWorkbook(file: File, rounds: Round[]): Promise<ImportResult> {
  const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: Cell[][] }[];
  const result: ImportResult = { problems: [], sheets: [] };
  const get = (row: Cell[], map: Partial<Record<Field, number>>, f: Field) => (map[f] === undefined ? '' : norm(row[map[f]!]));

  const ath = findSheet(sheets, ['bib', 'name', 'cls']);
  if (ath) {
    result.sheets.push(`${ath.name}（運動員）`);
    result.athletes = [];
    for (const row of ath.rows) {
      const g = get(row, ath.map, 'gender');
      const gender = /^(男|m|male|b)/i.test(g) ? 'M' : /^(女|f|female|g)/i.test(g) ? 'F' : null;
      const group = get(row, ath.map, 'group').replace(/組|组/, '');
      const a = { bib: get(row, ath.map, 'bib'), name: get(row, ath.map, 'name'), cls: get(row, ath.map, 'cls') };
      if (!a.bib) continue;
      if (!gender) result.problems.push(`運動員 ${a.bib} 的性別「${g}」無法識別`);
      result.athletes.push({ ...a, gender: gender ?? 'M', group });
    }
  }

  const byTitle = new Map(rounds.map((r) => [r.title, r.id]));
  const ent =
    findSheet(sheets, ['roundId'], ['gender']) ?? findSheet(sheets, ['title', 'heat'], ['gender']) ?? findSheet(sheets, ['title', 'lane'], ['gender']);
  if (ent && ent.map.mark === undefined) {
    result.sheets.push(`${ent.name}（參賽名單）`);
    result.entries = [];
    for (const row of ent.rows) {
      let roundId = get(row, ent.map, 'roundId');
      if (!roundId) roundId = byTitle.get(get(row, ent.map, 'title').replace(/\s+/g, '')) ?? '';
      const bib = get(row, ent.map, 'bib');
      const team = get(row, ent.map, 'team') || (bib ? '' : get(row, ent.map, 'cls'));
      if (!roundId) {
        result.problems.push(`參賽名單有一行找不到賽次：${row.map(norm).join(' ')}`);
        continue;
      }
      result.entries.push({
        roundId,
        bib: bib || undefined,
        team: team || undefined,
        heat: Number(get(row, ent.map, 'heat')) || undefined,
        lane: Number(get(row, ent.map, 'lane')) || undefined,
      });
    }
  }

  const rec = findSheet(sheets, ['title', 'mark'], ['bib']);
  if (rec) {
    result.sheets.push(`${rec.name}（大會紀錄）`);
    result.records = rec.rows
      .map((row) => ({
        key: get(row, rec.map, 'title').replace(/\s+/g, '').replace(/\[.*\]/, '').replace(/(分組決|合組決|初|複|決)$/, ''),
        mark: get(row, rec.map, 'mark'),
        holder: get(row, rec.map, 'holder'),
        year: get(row, rec.map, 'year'),
      }))
      .filter((r) => r.key && r.mark);
  }

  if (!result.sheets.length) result.problems.push('找不到可辨認的工作表，請參考範本的欄位名稱');
  return result;
}

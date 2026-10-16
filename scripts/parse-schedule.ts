// Turns the text extracted from the official schedule PDF (pdftotext -layout)
// into data/schedule.json. Run: npm run parse-schedule
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTitle } from '../lib/eventName';
import type { Day, Round } from '../lib/types';

const text = readFileSync(new URL('../data/schedule-source.txt', import.meta.url), 'utf8');
const days: Day[] = [];
const rounds: Round[] = [];
let day = 0;
const lines = text.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const head = line.match(/(\d+)月(\d+)日(星期.)/);
  if (head) {
    const date = `2026-${head[1].padStart(2, '0')}-${head[2].padStart(2, '0')}`;
    if (!days.find((d) => d.date === date)) {
      days.push({ day: days.length + 1, date, label: `${head[1]}月${head[2]}日${head[3]}` });
    }
    day = days.find((d) => d.date === date)!.day;
    continue;
  }
  const m = line.match(/^\s*(\d{3})\s+(\d{1,2}:\d{2})\s+(.+?)\s{2,}(\d+)(?:\s+(\d+))?\s*$/);
  if (!m) continue;
  const [, id, time, rawTitle, count, heats] = m;
  const title = rawTitle.replace(/\s+/g, '');
  const p = parseTitle(title);
  const r: Round = {
    id,
    day,
    time,
    title,
    gender: p.gender,
    group: p.group,
    event: p.event,
    round: p.round,
    kind: p.kind,
    count: Number(count),
    heats: heats ? Number(heats) : null,
    entries: [],
  };
  // "合組決" rows: two events share one race, written over three lines in the PDF.
  if (!heats && lines[i + 1]?.includes('合組決')) {
    const next = lines[i + 2]?.match(/^\s*(\d{3})\s+/);
    r.round = '合組決';
    r.heats = 1;
    if (next) r.note = `與 ${next[1]} 合組決賽`;
  } else if (!heats) {
    const prev = rounds[rounds.length - 1];
    if (prev?.note?.includes(id)) {
      r.round = '合組決';
      r.heats = 1;
      r.note = `與 ${prev.id} 合組決賽`;
    }
  }
  rounds.push(r);
}

writeFileSync(
  new URL('../data/schedule.json', import.meta.url),
  JSON.stringify({ days, rounds }, null, 1) + '\n',
);
console.log(`${days.length} days, ${rounds.length} rounds`);
for (const k of ['track', 'field', 'relay', 'other']) {
  console.log(k, rounds.filter((r) => r.kind === k).length);
}

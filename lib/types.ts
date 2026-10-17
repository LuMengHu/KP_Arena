import type { Kind } from './eventName';

export interface Day {
  day: number; // 1..3
  date: string; // 2026-10-28
  label: string; // 10月28日星期三
}

export interface Entry {
  bib?: string; // individual events
  team?: string; // relays: class code or team name
  heat?: number;
  lane?: number;
}

export interface Round {
  id: string; // 序號, e.g. "101"
  day: number;
  time: string; // "9:00"
  title: string; // original Chinese title, e.g. "男甲100M初"
  gender: 'M' | 'F' | null;
  group: string | null;
  event: string;
  round: string;
  kind: Kind;
  count: number | null; // 人數/隊
  heats: number | null; // 組數
  note?: string; // e.g. "與154合組決"
  entries: Entry[];
}

export interface Athlete {
  bib: string;
  name: string;
  cls: string;
  gender: 'M' | 'F';
  group: string;
}

export interface MeetRecord {
  key: string; // "男甲100M"
  mark: string;
  holder: string;
  year: string;
}

export interface Photo {
  id: string;
  thumb: string; // path inside the bucket, e.g. "photos/abc.jpg"
  url: string; // external album / full-size link
  caption: string;
  day: number | null;
}

export interface Meet {
  version: number;
  updatedAt: string;
  name: { zh: string; en: string; pt: string };
  days: Day[];
  rounds: Round[];
  athletes: Athlete[];
  records: MeetRecord[];
  photos: Photo[];
  notice: string; // banner text, empty = none
  demo?: boolean;
  /** class code -> 4-digit login PIN. Server-side only: stripped from every published copy. */
  classPins?: Record<string, string>;
}

/**
 * public.json: what visitors who are not logged in may see. The schedule only: no names,
 * start lists or marks; just which rounds are running or have results.
 */
export interface PublicView {
  version: number;
  updatedAt: string;
  name: Meet['name'];
  days: Day[];
  rounds: Round[]; // entries always []
  notice: string;
  demo?: boolean;
  running: string[];
  done: string[];
}

export interface ResultRow {
  bib?: string;
  team?: string;
  name?: string; // snapshot for display (filled from roster, or typed for relays/specials)
  cls?: string;
  heat?: number;
  rank?: number | null;
  mark: string; // "12.34", "2:15.30", "5.20", or "" when status set
  status?: '' | 'DNS' | 'DNF' | 'DQ';
  record?: boolean; // breaks the meet record
}

export interface RoundResult {
  rows: ResultRow[];
  publishedAt: string;
  by: string;
}

export interface Live {
  version: number;
  updatedAt: string;
  results: Record<string, RoundResult>;
  /** round ids marked as currently running */
  running: string[];
}

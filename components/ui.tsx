'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { titleFor, type Lang } from '@/lib/eventName';
import type { Live, ResultRow, Round } from '@/lib/types';
import { useApp } from './AppProvider';

export function LangSwitch() {
  const { lang, setLang } = useApp();
  const opts: [Lang, string][] = [
    ['zh', '中文'],
    ['en', 'EN'],
    ['pt', 'PT'],
  ];
  return (
    <div className="lang">
      {opts.map(([l, label]) => (
        <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Shell({ title, back = true, children }: { title: string; back?: boolean; children: React.ReactNode }) {
  const { t, meet, offline, lastFetch } = useApp();
  const router = useRouter();
  return (
    <div className="page">
      <header className="bar">
        {back ? (
          <button className="back" aria-label={t('back')} onClick={() => (history.length > 1 ? router.back() : router.push('/'))}>
            ‹
          </button>
        ) : (
          <span className="back" />
        )}
        <h1>{title}</h1>
        <span className="back" />
      </header>
      {meet?.notice ? <div className="notice">{meet.notice}</div> : null}
      {meet?.demo ? <div className="demo">{t('demo')}</div> : null}
      <main>{children}</main>
      <footer className="foot">
        <div>{offline ? t('offline') : t('autoRefresh')}</div>
        {lastFetch ? (
          <div>
            {t('updated')} {lastFetch.toLocaleTimeString('zh-Hant', { hour12: false })}
          </div>
        ) : null}
        <div>{t('disclaimer')}</div>
      </footer>
    </div>
  );
}

export type Status = 'done' | 'running' | 'upcoming';

export function statusOf(round: Round, live: Live | null): Status {
  if (live?.results[round.id]) return 'done';
  if (live?.running.includes(round.id)) return 'running';
  return 'upcoming';
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useApp();
  if (status === 'upcoming') return null;
  return <span className={`badge ${status}`}>{status === 'done' ? t('done') : t('running')}</span>;
}

export function RoundLink({ round, extra }: { round: Round; extra?: React.ReactNode }) {
  const { lang, live } = useApp();
  const status = statusOf(round, live);
  const hasRecord = live?.results[round.id]?.rows.some((r) => r.record);
  return (
    <Link href={`/round/${round.id}`} className={`round ${status}`}>
      <span className="time">{round.time}</span>
      <span className="rtitle">
        {titleFor(round.title, lang)}
        {hasRecord ? <span className="fire" title="record"> 🔥</span> : null}
        {extra ? <span className="extra">{extra}</span> : null}
      </span>
      <StatusBadge status={status} />
    </Link>
  );
}

export function ResultTable({ rows, highlight }: { rows: ResultRow[]; highlight?: (r: ResultRow) => boolean }) {
  const { t, athleteByBib } = useApp();
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{t('rank')}</th>
          <th>{t('name')}</th>
          <th className="num">{t('mark')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const a = r.bib ? athleteByBib.get(r.bib) : undefined;
          const name = r.name || a?.name || r.team || r.bib || '';
          const cls = r.cls || a?.cls || '';
          return (
            <tr key={i} className={highlight?.(r) ? 'me' : ''}>
              <td className="rank">{r.rank ?? '–'}</td>
              <td>
                <div>{name}</div>
                <div className="sub">
                  {[r.bib, cls].filter(Boolean).join(' · ')}
                  {r.heat ? ` · ${t('heat', { n: r.heat })}` : ''}
                </div>
              </td>
              <td className="num">
                {r.status || r.mark}
                {r.record ? <div className="rec">🔥 {t('newRecord')}</div> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Macau local time (UTC+8) as "YYYY-MM-DD" and minutes since midnight. */
export function macauNow() {
  const d = new Date(Date.now() + 8 * 3600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const LOCALE = { zh: 'zh-HK', en: 'en-GB', pt: 'pt-PT' } as const;

/** "10月28日 週三" / "Wed 28 Oct" / "qua., 28/10" from an ISO date, in the chosen language. */
export function dayLabel(date: string | undefined, lang: Lang): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'Asia/Macau',
  });
}

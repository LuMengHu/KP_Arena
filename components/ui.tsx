'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { titleFor } from '@/lib/eventName';
import type { Live, Meet, ResultRow, Round } from '@/lib/types';
import { useApp } from './AppProvider';
import { Icon, type IconName } from './icons';

const TABS: [string, IconName, string][] = [
  ['/', 'home', '首頁'],
  ['/schedule', 'calendar', '賽程'],
  ['/results', 'trophy', '成績'],
  ['/me', 'star', '我的'],
];

function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="主選單">
      {TABS.map(([href, icon, label]) => (
        <Link key={href} href={href} className={path === href ? 'on' : ''} aria-current={path === href ? 'page' : undefined}>
          <Icon name={icon} size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * Page frame shared by every public screen: sticky title bar (or a custom header on the home
 * screen), notice banners, footer with refresh state, and the bottom tab bar.
 */
export function Shell({
  title,
  header,
  members,
  children,
}: {
  title?: string;
  header?: React.ReactNode;
  /** page only for logged-in classes and athletes */
  members?: boolean;
  children: React.ReactNode;
}) {
  const { t, meet, offline, lastFetch, refresh, loggedIn } = useApp();
  const router = useRouter();
  const path = usePathname();
  const isTab = TABS.some(([href]) => href === path);
  return (
    <div className="page">
      {header ?? (
        <header className="bar">
          {isTab ? (
            <span className="back" />
          ) : (
            <button className="back" aria-label={t('back')} onClick={() => (history.length > 1 ? router.back() : router.push('/'))}>
              <Icon name="back" size={24} />
            </button>
          )}
          <h1>{title}</h1>
          <span className="back" />
        </header>
      )}
      <main className={header ? 'overlap' : ''}>
        {meet?.notice ? (
          <div className="notice" role="status">
            <Icon name="megaphone" size={18} />
            <span>{meet.notice}</span>
          </div>
        ) : null}
        {meet?.demo ? <div className="demo">{t('demo')}</div> : null}
        {members && !loggedIn ? <LoginNeeded /> : meet ? children : <Skeleton />}
      </main>
      <footer className="foot">
        <button className={`sync ${offline ? 'off' : ''}`} onClick={refresh}>
          <span className="dot" />
          {offline ? t('offline') : t('autoRefresh')}
          {lastFetch && !offline ? ` · ${t('updated')} ${lastFetch.toLocaleTimeString('zh-HK', { hour12: false, timeZone: 'Asia/Macau' })}` : ''}
          <Icon name="refresh" size={14} />
        </button>
        <div>{t('disclaimer')}</div>
      </footer>
      <TabBar />
    </div>
  );
}

/** Shown to visitors in place of names and results. */
export function LoginNeeded({ compact }: { compact?: boolean }) {
  return (
    <section className={`card gate ${compact ? '' : 'lift'}`}>
      <span className="ico">
        <Icon name="lock" size={24} />
      </span>
      <h2>登入後可查看</h2>
      <p className="sub">比賽名單、成績和相片只供本校班級及運動員查看。請用班級或號碼布，加上班級密碼登入。</p>
      <Link href="/#login" className="primary inline">
        前往登入
      </Link>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="載入中">
      <div />
      <div />
      <div />
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

export function RoundLink({ round, extra, showDay }: { round: Round; extra?: React.ReactNode; showDay?: boolean }) {
  const { live, t } = useApp();
  const status = statusOf(round, live);
  const hasRecord = live?.results[round.id]?.rows.some((r) => r.record);
  return (
    <Link href={`/round/${round.id}`} className={`round ${status}`}>
      <span className="time">
        {showDay ? <small>{t('day', { n: round.day })}</small> : null}
        {round.time}
      </span>
      <span className="rtitle">
        {titleFor(round.title)}
        {hasRecord ? (
          <span className="flame" title={t('newRecord')}>
            <Icon name="flame" size={14} />
          </span>
        ) : null}
        {extra ? <span className="extra">{extra}</span> : null}
      </span>
      <StatusBadge status={status} />
      <Icon name="chevron" size={16} className="chev" />
    </Link>
  );
}

/** Rank number; 1–3 get medal colours. */
export function Rank({ n }: { n?: number | null }) {
  if (!n) return <span className="rankno">–</span>;
  return <span className={`rankno ${n <= 3 ? `m${n}` : ''}`}>{n}</span>;
}

export function ResultTable({ rows, highlight }: { rows: ResultRow[]; highlight?: (r: ResultRow) => boolean }) {
  const { t, athleteByBib } = useApp();
  return (
    <ol className="results">
      {rows.map((r, i) => {
        const a = r.bib ? athleteByBib.get(r.bib) : undefined;
        const name = r.name || a?.name || r.team || r.bib || '';
        const cls = r.cls || a?.cls || '';
        return (
          <li key={i} className={`${highlight?.(r) ? 'me' : ''} ${r.status ? 'out' : ''}`}>
            <Rank n={r.status ? null : r.rank} />
            <div className="who">
              <div className="nm">{name}</div>
              <div className="sub">
                {[r.bib && r.bib !== name ? r.bib : '', cls !== name ? cls : '', r.heat ? t('heat', { n: r.heat }) : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="mk">
              {r.status ? <span className="st">{STATUS[r.status]}</span> : r.mark}
              {r.record ? (
                <span className="rec">
                  <Icon name="flame" size={12} /> {t('newRecord')}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STATUS: Record<string, string> = {
  DNS: '缺席',
  DNF: '未完成',
  DQ: '犯規',
};

export function Empty({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <p>{children}</p>
    </div>
  );
}

/** Macau local time (UTC+8) as "YYYY-MM-DD" and minutes since midnight. */
export function macauNow() {
  const d = new Date(Date.now() + 8 * 3600_000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** "10/28" from an ISO date. */
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** "10月28日 週三" from an ISO date. */
export function dayLabel(date: string | undefined): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('zh-HK', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'Asia/Macau',
  });
}

export type Phase =
  | { kind: 'before'; daysLeft: number }
  | { kind: 'during'; day: number; done: number; total: number }
  | { kind: 'between' }
  | { kind: 'after'; done: number };

/** Where we are relative to the meet, for the status strip on the home screen. */
export function phaseOf(meet: Meet, live: Live | null): Phase {
  const { date } = macauNow();
  const days = meet.days;
  const doneIn = (rounds: Round[]) => rounds.filter((r) => live?.results[r.id]).length;
  if (!days.length || date < days[0].date) {
    const first = days[0]?.date;
    const daysLeft = first ? Math.round((Date.parse(first) - Date.parse(date)) / 86_400_000) : 0;
    return { kind: 'before', daysLeft };
  }
  const today = days.find((d) => d.date === date);
  if (today) {
    const rounds = meet.rounds.filter((r) => r.day === today.day);
    return {
      kind: 'during',
      day: today.day,
      done: doneIn(rounds),
      total: rounds.length,
    };
  }
  if (date > days[days.length - 1].date) return { kind: 'after', done: doneIn(meet.rounds) };
  return { kind: 'between' };
}

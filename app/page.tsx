'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Icon, Kapok, type IconName } from '@/components/icons';
import { RoundLink, Shell, macauNow, phaseOf, toMinutes } from '@/components/ui';

function Hero() {
  const { t, meet, live } = useApp();
  const phase = meet ? phaseOf(meet, live) : null;
  return (
    <header className="hero">
      <div className="petals" aria-hidden="true">
        <Kapok size={180} petal="rgba(255,255,255,.07)" heart="rgba(255,255,255,.07)" />
      </div>
      <div className="mark">
        <Kapok size={44} petal="#c62f2a" heart="#f5b42a" />
      </div>
      <div className="school">
        {t('school')} · {t('sportsDay')}
      </div>
      <h1>{t('appName')}</h1>
      <div className="en">KP ARENA</div>
      <div className="pill">{t('dates')}</div>
      {phase ? <PhaseStrip phase={phase} /> : null}
    </header>
  );
}

function PhaseStrip({ phase }: { phase: ReturnType<typeof phaseOf> }) {
  const { t } = useApp();
  if (phase.kind === 'before')
    return (
      <div className="phase">
        {phase.daysLeft > 0 ? (
          <>
            距離開幕還有 <b>{phase.daysLeft}</b> 日
          </>
        ) : (
          '運動會即將開始'
        )}
      </div>
    );
  if (phase.kind === 'during')
    return (
      <div className="phase">
        <div>
          {t('day', { n: phase.day })} · 已出成績 <b>{phase.done}</b> / {phase.total} 場
        </div>
        <div className="bar-track">
          <div style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
        </div>
      </div>
    );
  if (phase.kind === 'after') return <div className="phase">運動會圓滿結束 · 共 {phase.done} 場成績</div>;
  return null;
}

function IdentityPicker() {
  const { t, meet, setIdentity } = useApp();
  const [mode, setMode] = useState<'student' | 'class' | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim().toUpperCase();
    if (!v) return;
    const athletes = meet?.athletes ?? [];
    if (mode === 'student') {
      // Before the roster is loaded we can't check, so accept any number.
      const match = athletes.find((a) => a.bib.toUpperCase() === v);
      if (athletes.length && !match) return setError(t('notFoundBib'));
      setIdentity({ type: 'student', bib: match?.bib ?? v });
    } else {
      const match = athletes.find((a) => a.cls.toUpperCase() === v);
      if (athletes.length && !match) return setError(t('notFoundClass'));
      setIdentity({ type: 'class', cls: match?.cls ?? v });
    }
  };

  const options: ['student' | 'class' | 'guest', IconName, string, string][] = [
    ['student', 'cap', t('student'), t('studentHint')],
    ['class', 'school', t('cls'), t('classHint')],
    ['guest', 'users', t('other'), t('otherHint')],
  ];

  return (
    <section className="card lift">
      <h2 className="center">{t('chooseIdentity')}</h2>
      {mode ? (
        <form onSubmit={submit} className="idform">
          <label className="sub" htmlFor="idv">
            {mode === 'student' ? t('studentHint') : t('classHint')}
          </label>
          <input
            id="idv"
            autoFocus
            autoComplete="off"
            inputMode={mode === 'student' ? 'numeric' : 'text'}
            placeholder={mode === 'student' ? '例如 1021' : '例如 S5A'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
          {error ? <div className="err">{error}</div> : null}
          <div className="row">
            <button type="button" className="ghost" onClick={() => setMode(null)}>
              {t('cancel')}
            </button>
            <button type="submit" className="primary">
              {t('enter')}
            </button>
          </div>
        </form>
      ) : (
        <div className="ids">
          {options.map(([key, icon, label, hint]) => (
            <button key={key} onClick={() => (key === 'guest' ? setIdentity({ type: 'guest' }) : setMode(key))}>
              <span className="ico">
                <Icon name={icon} size={24} />
              </span>
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      )}
      <p className="sub center privacy">身份只存在這部手機，用來標出你的項目，不會上傳。</p>
    </section>
  );
}

function Menu() {
  const { t, identity, setIdentity, athleteByBib, meet, live } = useApp();
  const student = identity?.type === 'student' ? athleteByBib.get(identity.bib) : undefined;
  const who =
    identity?.type === 'student'
      ? (student?.name ?? identity.bib)
      : identity?.type === 'class'
        ? `${identity.cls} 班`
        : t('guest');
  const whoSub =
    identity?.type === 'student' ? [identity.bib, student?.cls].filter(Boolean).join(' · ') : identity?.type === 'class' ? '班級身份' : '可瀏覽全部賽程與成績';

  const rounds = meet?.rounds ?? [];
  const published = rounds.filter((r) => live?.results[r.id]);
  const recordCount = published.reduce((n, r) => n + live!.results[r.id].rows.filter((x) => x.record).length, 0);
  const withEntries = rounds.filter((r) => r.entries.length).length;

  const tiles: [string, IconName, string, string][] = [
    ['/schedule', 'calendar', t('schedule'), `${meet?.days.length ?? 3} 日 · ${rounds.length} 場`],
    ['/entries', 'list', t('entries'), withEntries ? `${withEntries} 場已公佈` : '稍後公佈'],
    ['/results', 'trophy', t('results'), published.length ? `${published.length} 場已出成績` : '比賽開始後更新'],
    ['/photos', 'camera', t('photos'), meet?.photos.length ? `${meet.photos.length} 張` : '稍後上載'],
  ];

  // What is happening now: rounds marked running, then the next ones today, then the latest results.
  const now = macauNow();
  const today = meet?.days.find((d) => d.date === now.date);
  const running = rounds.filter((r) => live?.running.includes(r.id));
  const next = today
    ? rounds.filter((r) => r.day === today.day && toMinutes(r.time) >= now.minutes - 5 && !live?.results[r.id] && !live?.running.includes(r.id)).slice(0, 3)
    : [];
  const latest = [...published].sort((a, b) => live!.results[b.id].publishedAt.localeCompare(live!.results[a.id].publishedAt)).slice(0, 3);

  return (
    <>
      <section className="card lift idcard">
        <span className="avatar">
          <Icon name={identity?.type === 'class' ? 'school' : identity?.type === 'guest' ? 'users' : 'user'} size={22} />
        </span>
        <div className="grow">
          <div className="nm">
            {t('hello')}，{who}
          </div>
          <div className="sub">{whoSub}</div>
        </div>
        <button className="chip" onClick={() => setIdentity(null)}>
          {t('switchIdentity')}
        </button>
      </section>

      {identity?.type !== 'guest' ? (
        <Link href="/me" className="cta">
          <Icon name="star" size={20} />
          <span className="grow">{identity?.type === 'class' ? t('classResults') : t('myResults')}</span>
          <Icon name="chevron" size={18} />
        </Link>
      ) : null}

      <div className="tiles">
        {tiles.map(([href, icon, label, sub]) => (
          <Link key={href} href={href} className="tile">
            <span className="ico">
              <Icon name={icon} size={22} />
            </span>
            <b>{label}</b>
            <small>{sub}</small>
          </Link>
        ))}
      </div>

      <Link href="/records" className="cta hot">
        <Icon name="flame" size={20} />
        <span className="grow">{t('records')}</span>
        {recordCount ? <span className="count">{recordCount}</span> : null}
        <Icon name="chevron" size={18} />
      </Link>

      {running.length ? (
        <section className="card">
          <h3 className="live-h">
            <span className="pulse" />
            {t('running')}
          </h3>
          {running.map((r) => (
            <RoundLink key={r.id} round={r} />
          ))}
        </section>
      ) : null}
      {next.length ? (
        <section className="card">
          <h3>接下來</h3>
          {next.map((r) => (
            <RoundLink key={r.id} round={r} />
          ))}
        </section>
      ) : null}
      {latest.length ? (
        <section className="card">
          <h3>最新成績</h3>
          {latest.map((r) => (
            <RoundLink
              key={r.id}
              round={r}
              showDay
              extra={live!.results[r.id].rows
                .filter((x) => x.rank === 1)
                .map((x) => `冠軍 ${x.name || athleteByBib.get(x.bib ?? '')?.name || x.team || x.bib} ${x.mark}`)
                .join('、')}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

export default function Home() {
  const { identity } = useApp();
  return (
    <Shell header={<Hero />}>
      {identity ? <Menu /> : <IdentityPicker />}
    </Shell>
  );
}

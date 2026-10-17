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
          <div
            style={{
              width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    );
  if (phase.kind === 'after') return <div className="phase">運動會圓滿結束 · 共 {phase.done} 場成績</div>;
  return null;
}

function LoginCard() {
  const { login, expired } = useApp();
  const [mode, setMode] = useState<'class' | 'athlete'>('class');
  const [cls, setCls] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cls.trim() || !secret.trim()) return setError(mode === 'class' ? '請輸入班級和密碼' : '請輸入班級和號碼布');
    setBusy(true);
    const err = await login(mode === 'class' ? { type: 'class', cls, pin: secret } : { type: 'athlete', cls, bib: secret });
    setBusy(false);
    setError(err);
  };

  return (
    <section className="card lift login" id="login">
      <h2 className="center">登入查看名單和成績</h2>
      {expired ? <div className="warn">登入已失效，請重新登入</div> : null}
      <div className="seg" role="tablist">
        {(
          [
            ['class', 'school', '班級'],
            ['athlete', 'cap', '運動員'],
          ] as const
        ).map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            className={mode === k ? 'on' : ''}
            onClick={() => {
              setMode(k);
              setSecret('');
              setError('');
            }}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="idform">
        <label>
          <span className="sub">班級代號</span>
          <input
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="例如 S5A"
            value={cls}
            onChange={(e) => {
              setCls(e.target.value);
              setError('');
            }}
          />
        </label>
        <label>
          <span className="sub">{mode === 'class' ? '班級密碼（4 位數字，向班主任索取）' : '號碼布'}</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            type={mode === 'class' ? 'password' : 'text'}
            maxLength={mode === 'class' ? 4 : 10}
            placeholder={mode === 'class' ? '••••' : '例如 1021'}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              setError('');
            }}
          />
        </label>
        {error ? <div className="err">{error}</div> : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? '登入中…' : '登入'}
        </button>
      </form>
      <p className="sub center">未登入可瀏覽賽程</p>
    </section>
  );
}

function Menu() {
  const { t, identity, logout, athleteByBib, meet, live } = useApp();
  const athlete = identity?.type === 'athlete' ? athleteByBib.get(identity.bib) : undefined;
  const who = identity?.type === 'athlete' ? (athlete?.name ?? identity.bib) : identity?.type === 'class' ? `${identity.cls} 班` : t('guest');
  const whoSub = identity?.type === 'athlete' ? `運動員 · ${identity.bib} · ${identity.cls}` : '班級身份';

  const rounds = meet?.rounds ?? [];
  const published = rounds.filter((r) => live?.results[r.id]);
  const recordCount = published.reduce((n, r) => n + live!.results[r.id].rows.filter((x) => x.record).length, 0);
  const withEntries = rounds.filter((r) => r.entries.length).length;

  const tiles: [string, IconName, string, string][] = [['/schedule', 'calendar', t('schedule'), `${meet?.days.length ?? 3} 日 · ${rounds.length} 場`]];
  if (identity)
    tiles.push(
      ['/entries', 'list', t('entries'), withEntries ? `${withEntries} 場已公佈` : '稍後公佈'],
      ['/results', 'trophy', t('results'), published.length ? `${published.length} 場已出成績` : '比賽開始後更新'],
      ['/photos', 'camera', t('photos'), meet?.photos.length ? `${meet.photos.length} 張` : '稍後上載'],
    );

  // What is happening now: rounds marked running, then the next ones today, then the latest results.
  const now = macauNow();
  const today = meet?.days.find((d) => d.date === now.date);
  const running = rounds.filter((r) => live?.running.includes(r.id));
  const next = today
    ? rounds.filter((r) => r.day === today.day && toMinutes(r.time) >= now.minutes - 5 && !live?.results[r.id] && !live?.running.includes(r.id)).slice(0, 3)
    : [];
  const latest = !identity ? [] : [...published].sort((a, b) => live!.results[b.id].publishedAt.localeCompare(live!.results[a.id].publishedAt)).slice(0, 3);

  return (
    <>
      {identity ? (
        <>
          <section className="card lift idcard">
            <span className="avatar">
              <Icon name={identity.type === 'class' ? 'school' : 'user'} size={22} />
            </span>
            <div className="grow">
              <div className="nm">
                {t('hello')}，{who}
              </div>
              <div className="sub">{whoSub}</div>
            </div>
            <button className="chip" onClick={() => confirm('確定登出？') && logout()}>
              {t('logout')}
            </button>
          </section>
          <Link href="/me" className="cta">
            <Icon name="star" size={20} />
            <span className="grow">{identity.type === 'class' ? t('classResults') : t('myResults')}</span>
            <Icon name="chevron" size={18} />
          </Link>
        </>
      ) : (
        <LoginCard />
      )}

      <div className={`tiles ${tiles.length === 1 ? 'one' : ''}`}>
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

      {identity ? (
        <Link href="/records" className="cta hot">
          <Icon name="flame" size={20} />
          <span className="grow">{t('records')}</span>
          {recordCount ? <span className="count">{recordCount}</span> : null}
          <Icon name="chevron" size={18} />
        </Link>
      ) : null}

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
  return (
    <Shell header={<Hero />}>
      <Menu />
    </Shell>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { LangSwitch, RoundLink, macauNow, toMinutes } from '@/components/ui';

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
      if (athletes.length && !athletes.some((a) => a.bib.toUpperCase() === v)) return setError(t('notFoundBib'));
      const bib = athletes.find((a) => a.bib.toUpperCase() === v)?.bib ?? v;
      setIdentity({ type: 'student', bib });
    } else {
      const match = athletes.find((a) => a.cls.toUpperCase() === v);
      if (athletes.length && !match) return setError(t('notFoundClass'));
      setIdentity({ type: 'class', cls: match?.cls ?? v });
    }
  };

  return (
    <section className="sheet">
      <h2>{t('chooseIdentity')}</h2>
      {mode ? (
        <form onSubmit={submit} className="idform">
          <input
            autoFocus
            inputMode={mode === 'student' ? 'numeric' : 'text'}
            placeholder={mode === 'student' ? t('studentHint') : t('classHint')}
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
          <button onClick={() => setMode('student')}>
            <span className="ico">🎓</span>
            <b>{t('student')}</b>
            <small>{t('studentHint')}</small>
          </button>
          <button onClick={() => setMode('class')}>
            <span className="ico">🏫</span>
            <b>{t('cls')}</b>
            <small>{t('classHint')}</small>
          </button>
          <button onClick={() => setIdentity({ type: 'guest' })}>
            <span className="ico">👥</span>
            <b>{t('other')}</b>
            <small>{t('otherHint')}</small>
          </button>
        </div>
      )}
    </section>
  );
}

function Menu() {
  const { t, identity, setIdentity, athleteByBib, meet, live } = useApp();
  const who =
    identity?.type === 'student'
      ? `${athleteByBib.get(identity.bib)?.name ?? ''} ${identity.bib}`
      : identity?.type === 'class'
        ? identity.cls
        : t('guest');
  const tiles = [
    ['/schedule', '📅', t('schedule')],
    ['/entries', '📋', t('entries')],
    ['/results', '🏆', t('results')],
    ['/photos', '📷', t('photos')],
  ] as const;

  // What is happening now: rounds marked running, else the next three today.
  const now = macauNow();
  const today = meet?.days.find((d) => d.date === now.date);
  const running = meet?.rounds.filter((r) => live?.running.includes(r.id)) ?? [];
  const next = today
    ? meet!.rounds.filter((r) => r.day === today.day && toMinutes(r.time) >= now.minutes - 5 && !live?.results[r.id]).slice(0, 3)
    : [];
  const shown = running.length ? running : next;

  return (
    <>
      <div className="who">
        <span>
          {t('hello')}，{who}
        </span>
        <button className="link" onClick={() => setIdentity(null)}>
          {t('switchIdentity')}
        </button>
      </div>
      {identity?.type !== 'guest' ? (
        <Link href="/me" className="mine">
          ⭐ {identity?.type === 'class' ? t('classResults') : t('myResults')} ›
        </Link>
      ) : null}
      <div className="tiles">
        {tiles.map(([href, ico, label]) => (
          <Link key={href} href={href} className="tile">
            <span className="ico">{ico}</span>
            {label}
          </Link>
        ))}
      </div>
      <Link href="/records" className="mine records">
        🔥 {t('records')} ›
      </Link>
      {shown.length ? (
        <section className="card">
          <h3>{running.length ? t('running') : t('upcoming')}</h3>
          {shown.map((r) => (
            <RoundLink key={r.id} round={r} />
          ))}
        </section>
      ) : null}
    </>
  );
}

export default function Home() {
  const { t, identity, meet, offline } = useApp();
  return (
    <div className="page home">
      <div className="hero-wrap">
        <LangSwitch />
        <div className="hero">
          <div className="logo">鏡平</div>
          <div className="school">{t('school')}</div>
          <div className="title">紅棉賽場 KP Arena</div>
          <div className="school">{t('sportsDay')}</div>
          <div className="pill">{t('dates')}</div>
        </div>
      </div>
      {meet?.notice ? <div className="notice">{meet.notice}</div> : null}
      {meet?.demo ? <div className="demo">{t('demo')}</div> : null}
      <main>{identity ? <Menu /> : <IdentityPicker />}</main>
      <footer className="foot">
        <div>{offline ? t('offline') : t('autoRefresh')}</div>
        <div>{t('disclaimer')}</div>
      </footer>
    </div>
  );
}

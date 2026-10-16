'use client';

import Link from 'next/link';
import { useApp } from '@/components/AppProvider';
import { Shell, StatusBadge, statusOf } from '@/components/ui';
import { titleFor } from '@/lib/eventName';

// "My results": a student's own events, or every event a class takes part in.
export default function MePage() {
  const { t, lang, identity, meet, live, athleteByBib } = useApp();
  if (!identity || identity.type === 'guest') {
    return (
      <Shell title={t('myResults')}>
        <p className="empty card">{t('signInFirst')}</p>
      </Shell>
    );
  }
  const mine = (bib?: string, team?: string) =>
    identity.type === 'student'
      ? bib === identity.bib
      : team === identity.cls || (bib ? athleteByBib.get(bib)?.cls === identity.cls : false);

  const rounds = (meet?.rounds ?? []).filter(
    (r) => r.entries.some((e) => mine(e.bib, e.team)) || live?.results[r.id]?.rows.some((x) => mine(x.bib, x.team ?? x.cls)),
  );
  const me = identity.type === 'student' ? athleteByBib.get(identity.bib) : null;

  return (
    <Shell title={identity.type === 'class' ? `${t('classResults')} ${identity.cls}` : t('myResults')}>
      {me ? (
        <section className="card meta">
          <b>{me.name}</b> <span className="sub">{me.bib} · {me.cls}</span>
        </section>
      ) : null}
      {rounds.length === 0 ? <p className="empty card">{t('noMine')}</p> : null}
      {rounds.map((r) => {
        const rows = (live?.results[r.id]?.rows ?? []).filter((x) => mine(x.bib, x.team ?? x.cls));
        const entries = r.entries.filter((e) => mine(e.bib, e.team));
        return (
          <Link key={r.id} href={`/round/${r.id}`} className="card mineCard">
            <div className="mhead">
              <span>
                {t('day', { n: r.day })} {r.time}
              </span>
              <StatusBadge status={statusOf(r, live)} />
            </div>
            <div className="rtitle">{titleFor(r.title, lang)}</div>
            {rows.length
              ? rows.map((x, i) => (
                  <div key={i} className="mres">
                    {identity.type === 'class' ? <span>{x.name || athleteByBib.get(x.bib ?? '')?.name || x.team}</span> : null}
                    <span>
                      {x.rank ? `#${x.rank}` : ''} <b>{x.status || x.mark}</b> {x.record ? '🔥' : ''}
                    </span>
                  </div>
                ))
              : entries.map((e, i) => (
                  <div key={i} className="sub">
                    {identity.type === 'class' ? `${athleteByBib.get(e.bib ?? '')?.name ?? e.team ?? ''} ` : ''}
                    {e.heat ? t('heat', { n: e.heat }) : ''} {e.lane ? `${t('lane')} ${e.lane}` : ''}
                  </div>
                ))}
          </Link>
        );
      })}
    </Shell>
  );
}

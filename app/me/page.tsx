'use client';

import Link from 'next/link';
import { useApp } from '@/components/AppProvider';
import { Icon } from '@/components/icons';
import { Empty, Rank, Shell, StatusBadge, statusOf } from '@/components/ui';
import { titleFor } from '@/lib/eventName';
import { formatMark } from '@/lib/marks';

// "My results": an athlete's own events, or every event a class takes part in.
export default function MePage() {
  const { t, identity, meet, live, athleteByBib } = useApp();
  if (!identity)
    return (
      <Shell title={t('myResults')} members>
        {null}
      </Shell>
    );
  const mine = (bib?: string, team?: string) =>
    identity.type === 'athlete' ? bib === identity.bib : team === identity.cls || (bib ? athleteByBib.get(bib)?.cls === identity.cls : false);

  const rounds = (meet?.rounds ?? []).filter(
    (r) => r.entries.some((e) => mine(e.bib, e.team)) || live?.results[r.id]?.rows.some((x) => mine(x.bib, x.team ?? x.cls)),
  );
  const me = identity.type === 'athlete' ? athleteByBib.get(identity.bib) : null;
  const medals = rounds.flatMap((r) => (live?.results[r.id]?.rows ?? []).filter((x) => mine(x.bib, x.team ?? x.cls) && x.rank && x.rank <= 3 && !x.status));
  const count = (n: number) => medals.filter((m) => m.rank === n).length;

  return (
    <Shell title={identity.type === 'class' ? `${t('classResults')} · ${identity.cls}` : t('myResults')}>
      <section className="card mehead">
        <span className="avatar big">
          <Icon name={identity.type === 'class' ? 'school' : 'user'} size={26} />
        </span>
        <div className="grow">
          <div className="nm">{me ? me.name : identity.type === 'class' ? `${identity.cls} 班` : identity.bib}</div>
          <div className="sub">{me ? `${me.bib} · ${me.cls} · ${me.gender === 'M' ? '男' : '女'}${me.group}組` : `${rounds.length} 個項目`}</div>
        </div>
        <div className="medals">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`medal m${n} ${count(n) ? '' : 'zero'}`}>
              {count(n)}
            </span>
          ))}
        </div>
      </section>
      {rounds.length === 0 ? (
        <section className="card">
          <Empty icon="list">{t('noMine')}</Empty>
        </section>
      ) : null}
      {rounds.map((r) => {
        const rows = (live?.results[r.id]?.rows ?? []).filter((x) => mine(x.bib, x.team ?? x.cls));
        const entries = r.entries.filter((e) => mine(e.bib, e.team));
        return (
          <Link key={r.id} href={`/round/${r.id}`} className="card mineCard">
            <div className="mhead">
              <span>
                {t('day', { n: r.day })} · {r.time}
              </span>
              <StatusBadge status={statusOf(r, live)} />
            </div>
            <div className="rtitle">{titleFor(r.title)}</div>
            {rows.length
              ? rows.map((x, i) => (
                  <div key={i} className="mres">
                    <Rank n={x.status ? null : x.rank} />
                    <span className="grow">{identity.type === 'class' ? x.name || athleteByBib.get(x.bib ?? '')?.name || x.team : ''}</span>
                    <b>{x.status ? x.status : formatMark(x.mark, r.kind)}</b>
                    {x.record ? <Icon name="flame" size={14} className="flame" /> : null}
                  </div>
                ))
              : entries.map((e, i) => (
                  <div key={i} className="sub">
                    {identity.type === 'class' ? `${athleteByBib.get(e.bib ?? '')?.name ?? e.team ?? ''} ` : ''}
                    {e.heat ? t('heat', { n: e.heat }) : ''} {e.lane ? `第${e.lane}${t('lane')}` : ''}
                  </div>
                ))}
          </Link>
        );
      })}
    </Shell>
  );
}

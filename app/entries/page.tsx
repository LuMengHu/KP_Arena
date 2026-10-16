'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Icon } from '@/components/icons';
import { Empty, RoundLink, Shell, dayLabel, macauNow } from '@/components/ui';
import { genderLabel, groupLabel, titleFor } from '@/lib/eventName';

// Start lists: search an athlete (or class) and see their events, or browse by event.
export default function EntriesPage() {
  const { t, meet } = useApp();
  const [q, setQ] = useState('');
  const [day, setDay] = useState(1);
  useEffect(() => {
    const today = meet?.days.find((d) => d.date === macauNow().date);
    if (today) setDay(today.day);
  }, [meet]);
  const query = q.trim().toUpperCase();

  const eventsByBib = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of meet?.rounds ?? []) for (const e of r.entries) if (e.bib) m.set(e.bib, [...(m.get(e.bib) ?? []), r.id]);
    return m;
  }, [meet]);

  const athletes = useMemo(() => {
    if (!query) return [];
    return (meet?.athletes ?? [])
      .filter((a) => a.name.toUpperCase().includes(query) || a.bib.toUpperCase() === query || a.cls.toUpperCase() === query)
      .slice(0, 60);
  }, [meet, query]);

  const rounds = meet?.rounds ?? [];
  return (
    <Shell title={t('entries')}>
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {query ? (
        <section className="card">
          {athletes.length === 0 ? <Empty icon="search">找不到「{q.trim()}」</Empty> : null}
          {athletes.map((a) => (
            <div key={a.bib} className="athlete">
              <div>
                <b>{a.name}</b>{' '}
                <span className="sub">
                  {a.bib} · {a.cls} · {genderLabel(a.gender)}
                  {groupLabel(a.group)}
                </span>
              </div>
              {(eventsByBib.get(a.bib) ?? []).map((id) => {
                const r = rounds.find((x) => x.id === id)!;
                return (
                  <Link key={id} href={`/round/${id}`} className="evlink">
                    <span className="sub">
                      {t('day', { n: r.day })} {r.time}
                    </span>
                    <span className="grow">{titleFor(r.title)}</span>
                    <Icon name="chevron" size={16} />
                  </Link>
                );
              })}
            </div>
          ))}
        </section>
      ) : (
        <>
          <div className="tabs">
            {(meet?.days ?? []).map((d) => (
              <button key={d.day} className={d.day === day ? 'on' : ''} onClick={() => setDay(d.day)}>
                <b>{t('day', { n: d.day })}</b>
                <small>{dayLabel(d.date)}</small>
              </button>
            ))}
          </div>
          <section className="card">
            {rounds
              .filter((r) => r.day === day)
              .map((r) => (
                <RoundLink key={r.id} round={r} extra={r.entries.length ? `${r.entries.length} ${r.kind === 'relay' ? '隊' : '人'}` : '名單未公佈'} />
              ))}
          </section>
        </>
      )}
    </Shell>
  );
}

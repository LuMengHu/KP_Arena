'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { RoundLink, Shell, dayLabel } from '@/components/ui';
import { genderLabel, groupLabel, titleFor } from '@/lib/eventName';

// Start lists: search an athlete (or class) and see their events, or browse by event.
export default function EntriesPage() {
  const { t, lang, meet } = useApp();
  const [q, setQ] = useState('');
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
      <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {query ? (
        <section className="card">
          {athletes.length === 0 ? <p className="empty">—</p> : null}
          {athletes.map((a) => (
            <div key={a.bib} className="athlete">
              <div>
                <b>{a.name}</b>{' '}
                <span className="sub">
                  {a.bib} · {a.cls} · {genderLabel(a.gender, lang)}
                  {groupLabel(a.group, lang)}
                </span>
              </div>
              {(eventsByBib.get(a.bib) ?? []).map((id) => {
                const r = rounds.find((x) => x.id === id)!;
                return (
                  <Link key={id} href={`/round/${id}`} className="evlink">
                    {r.time} {titleFor(r.title, lang)} ›
                  </Link>
                );
              })}
            </div>
          ))}
        </section>
      ) : (
        (meet?.days ?? []).map((d) => (
          <section key={d.day} className="card">
            <h3>
              {t('day', { n: d.day })} · {dayLabel(d.date, lang)}
            </h3>
            {rounds
              .filter((r) => r.day === d.day)
              .map((r) => (
                <RoundLink key={r.id} round={r} extra={r.entries.length ? `${r.entries.length}` : null} />
              ))}
          </section>
        ))
      )}
    </Shell>
  );
}

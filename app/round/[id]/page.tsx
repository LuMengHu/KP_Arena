'use client';

import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { ResultTable, Shell, StatusBadge, dayLabel, statusOf } from '@/components/ui';
import { titleFor } from '@/lib/eventName';
import { recordFor } from '@/lib/marks';
import type { Entry } from '@/lib/types';

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang, meet, live, athleteByBib, identity } = useApp();
  const round = meet?.rounds.find((r) => r.id === id);
  if (!meet) return <Shell title="…">{null}</Shell>;
  if (!round) return <Shell title="404">{null}</Shell>;

  const result = live?.results[round.id];
  const record = recordFor(meet, round);
  const day = meet.days.find((d) => d.day === round.day);
  const isMe = (bib?: string, cls?: string) =>
    (identity?.type === 'student' && bib === identity.bib) ||
    (identity?.type === 'class' && (cls === identity.cls || athleteByBib.get(bib ?? '')?.cls === identity.cls));

  const heats = new Map<number, Entry[]>();
  for (const e of round.entries) {
    const h = e.heat ?? 1;
    heats.set(h, [...(heats.get(h) ?? []), e]);
  }

  return (
    <Shell title={titleFor(round.title, lang)}>
      <section className="card meta">
        <div>
          <b>
            #{round.id} · {dayLabel(day?.date, lang)} {round.time}
          </b>{' '}
          <StatusBadge status={statusOf(round, live)} />
        </div>
        <div className="sub">
          {round.count ? `${round.count} ${round.kind === 'relay' ? '' : t('members')}` : ''}
          {round.heats && round.heats > 1 ? ` · ${round.heats} ${lang === 'zh' ? '組' : 'heats'}` : ''}
          {round.note ? ` · ${round.note}` : ''}
        </div>
        {record ? (
          <div className="sub">
            {t('record')}：{record.mark} · {record.holder} · {record.year}
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="card">
          <h3>{t('results')}</h3>
          <ResultTable rows={result.rows} highlight={(r) => isMe(r.bib, r.cls ?? r.team)} />
        </section>
      ) : null}

      <section className="card">
        <h3>{t('entries')}</h3>
        {round.entries.length === 0 ? (
          <p className="empty">{t('noEntries')}</p>
        ) : (
          [...heats.entries()].map(([h, list]) => (
            <div key={h}>
              {heats.size > 1 ? <h4>{t('heat', { n: h })}</h4> : null}
              <table className="tbl">
                <tbody>
                  {list
                    .sort((a, b) => (a.lane ?? 99) - (b.lane ?? 99))
                    .map((e, i) => {
                      const a = e.bib ? athleteByBib.get(e.bib) : undefined;
                      return (
                        <tr key={i} className={isMe(e.bib, e.team) ? 'me' : ''}>
                          <td className="rank">{e.lane ?? ''}</td>
                          <td>
                            <div>{a?.name ?? e.team ?? e.bib}</div>
                            <div className="sub">{[e.bib, a?.cls].filter(Boolean).join(' · ')}</div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>
    </Shell>
  );
}

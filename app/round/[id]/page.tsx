'use client';

import { useParams } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { Icon } from '@/components/icons';
import { Empty, LoginNeeded, ResultTable, Shell, StatusBadge, dayLabel, statusOf } from '@/components/ui';
import { titleFor } from '@/lib/eventName';
import { formatMark, recordFor } from '@/lib/marks';
import type { Entry } from '@/lib/types';

const ROUND_NAME: Record<string, string> = {
  初: '初賽',
  複: '複賽',
  決: '決賽',
  分組決: '分組決賽',
  合組決: '合組決賽',
};

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const { t, meet, live, athleteByBib, identity, loggedIn } = useApp();
  const round = meet?.rounds.find((r) => r.id === id);
  if (!meet) return <Shell title="">{null}</Shell>;
  if (!round)
    return (
      <Shell title="找不到賽次">
        <Empty icon="calendar">沒有序號 {id} 的賽次</Empty>
      </Shell>
    );

  const result = live?.results[round.id];
  const record = recordFor(meet, round);
  const day = meet.days.find((d) => d.day === round.day);
  const broke = result?.rows.filter((r) => r.record) ?? [];
  const isMe = (bib?: string, cls?: string) =>
    (identity?.type === 'athlete' && bib === identity.bib) ||
    (identity?.type === 'class' && (cls === identity.cls || athleteByBib.get(bib ?? '')?.cls === identity.cls));

  const heats = new Map<number, Entry[]>();
  for (const e of round.entries) {
    const h = e.heat ?? 1;
    heats.set(h, [...(heats.get(h) ?? []), e]);
  }

  const facts = [
    `#${round.id}`,
    ROUND_NAME[round.round],
    round.count ? `${round.count} ${round.kind === 'relay' ? '隊' : t('members')}` : '',
    round.heats && round.heats > 1 ? `${round.heats} 組` : '',
    round.note ?? '',
  ].filter(Boolean);

  return (
    <Shell title={titleFor(round.title)}>
      <section className="card roundhead">
        <div className="when">
          <Icon name="clock" size={16} />
          {t('day', { n: round.day })} · {dayLabel(day?.date)} · <b>{round.time}</b>
          <StatusBadge status={statusOf(round, live)} />
        </div>
        <div className="facts">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        {record ? (
          <div className="recbox">
            <span className="lbl">{t('record')}</span>
            <b>{formatMark(record.mark, round.kind)}</b>
            <span className="sub">
              {record.holder} · {record.year}
            </span>
          </div>
        ) : null}
      </section>

      {!loggedIn ? <LoginNeeded compact /> : null}

      {loggedIn && broke.length ? (
        <div className="banner-rec">
          <Icon name="flame" size={22} />
          <div>
            <b>打破大會紀錄！</b>
            <div>{broke.map((r) => `${r.name || athleteByBib.get(r.bib ?? '')?.name || r.team} ${formatMark(r.mark, round.kind)}`).join('、')}</div>
          </div>
        </div>
      ) : null}

      {loggedIn && result ? (
        <section className="card">
          <h3>
            {t('results')}
            <span className="sub right">
              {new Date(result.publishedAt).toLocaleTimeString('zh-HK', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Macau',
              })}{' '}
              發佈
            </span>
          </h3>
          <ResultTable rows={result.rows} kind={round.kind} highlight={(r) => isMe(r.bib, r.cls ?? r.team)} />
        </section>
      ) : null}

      {loggedIn ? (
        <section className="card">
          <h3>{t('entries')}</h3>
          {round.entries.length === 0 ? (
            <Empty icon="list">{t('noEntries')}</Empty>
          ) : (
            [...heats.entries()]
              .sort(([a], [b]) => a - b)
              .map(([h, list]) => (
                <div key={h} className="heat">
                  {heats.size > 1 ? <h4>{t('heat', { n: h })}</h4> : null}
                  <ul className="startlist">
                    {[...list]
                      .sort((a, b) => (a.lane ?? 99) - (b.lane ?? 99))
                      .map((e, i) => {
                        const a = e.bib ? athleteByBib.get(e.bib) : undefined;
                        return (
                          <li key={i} className={isMe(e.bib, e.team) ? 'me' : ''}>
                            {e.lane ? (
                              <span className="lane">
                                <small>道</small>
                                {e.lane}
                              </span>
                            ) : null}
                            <div className="grow">
                              <div className="nm">{a?.name ?? e.team ?? e.bib}</div>
                              <div className="sub">{[e.bib, a?.cls].filter(Boolean).join(' · ')}</div>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))
          )}
        </section>
      ) : null}
    </Shell>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { RoundLink, Shell, dayLabel, macauNow, toMinutes } from '@/components/ui';
import { groupLabel } from '@/lib/eventName';

const GROUPS = ['甲', '乙', '丙', '丁', '戊'];

export default function SchedulePage() {
  const { t, lang, meet } = useApp();
  const [day, setDay] = useState(1);
  const [gender, setGender] = useState<'' | 'M' | 'F'>('');
  const [group, setGroup] = useState('');

  // Open on today's tab during the meet.
  useEffect(() => {
    const today = meet?.days.find((d) => d.date === macauNow().date);
    if (today) setDay(today.day);
  }, [meet]);

  const rounds = useMemo(
    () =>
      (meet?.rounds ?? []).filter(
        (r) =>
          r.day === day &&
          (!gender || r.gender === gender || r.gender === null) &&
          (!group || r.group === group || r.group === null),
      ),
    [meet, day, gender, group],
  );

  const now = macauNow();
  const isToday = meet?.days.find((d) => d.day === day)?.date === now.date;
  const nowIndex = isToday ? rounds.findIndex((r) => toMinutes(r.time) > now.minutes) : -1;

  // Group rows by start time so parallel events sit together like the paper timetable.
  const slots: { time: string; items: typeof rounds; nowBefore: boolean }[] = [];
  rounds.forEach((r, i) => {
    const last = slots[slots.length - 1];
    if (last && last.time === r.time) last.items.push(r);
    else slots.push({ time: r.time, items: [r], nowBefore: i === nowIndex });
  });

  return (
    <Shell title={t('schedule')}>
      <div className="tabs">
        {(meet?.days ?? []).map((d) => (
          <button key={d.day} className={d.day === day ? 'on' : ''} onClick={() => setDay(d.day)}>
            <b>{t('day', { n: d.day })}</b>
            <small>
              {dayLabel(d.date, lang)} · {t('events', { n: meet!.rounds.filter((r) => r.day === d.day).length })}
            </small>
          </button>
        ))}
      </div>
      <div className="chips">
        {(
          [
            ['', t('all')],
            ['M', t('boys')],
            ['F', t('girls')],
          ] as const
        ).map(([g, label]) => (
          <button key={g} className={gender === g ? 'on' : ''} onClick={() => setGender(g)}>
            {label}
          </button>
        ))}
        <span className="sep" />
        <button className={group === '' ? 'on' : ''} onClick={() => setGroup('')}>
          {t('all')}
        </button>
        {GROUPS.map((g) => (
          <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
            {groupLabel(g, lang)}
          </button>
        ))}
      </div>
      <div className="timeline">
        {slots.map((s) => (
          <div key={s.time + s.items[0].id}>
            {s.nowBefore ? <div className="now">{t('nowLine')} {`${Math.floor(now.minutes / 60)}:${String(now.minutes % 60).padStart(2, '0')}`}</div> : null}
            <div className="slot">
              <div className="dot" />
              {s.items.map((r) => (
                <RoundLink key={r.id} round={r} extra={r.note ? `${t('combined')} ${r.note.match(/\d+/)?.[0]}` : null} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

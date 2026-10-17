'use client';

import { useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Empty, RoundLink, Shell } from '@/components/ui';
import { formatMark } from '@/lib/marks';

const GROUPS = ['甲', '乙', '丙', '丁', '戊'];

// Published results, newest first, with a group filter.
export default function ResultsPage() {
  const { t, meet, live, athleteByBib } = useApp();
  const [group, setGroup] = useState('');
  const done = (meet?.rounds ?? [])
    .filter((r) => live?.results[r.id] && (!group || r.group === group))
    .sort((a, b) => live!.results[b.id].publishedAt.localeCompare(live!.results[a.id].publishedAt));
  return (
    <Shell title={t('results')} members>
      <div className="chips">
        <button className={group === '' ? 'on' : ''} onClick={() => setGroup('')}>
          {t('all')}
        </button>
        {GROUPS.map((g) => (
          <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
            {g}組
          </button>
        ))}
      </div>
      <section className="card">
        {done.length === 0 ? <Empty icon="trophy">{t('noResults')}</Empty> : null}
        {done.map((r) => {
          const top = live!.results[r.id].rows.filter((x) => x.rank === 1 && !x.status);
          const names = top.map((x) => `${x.name || athleteByBib.get(x.bib ?? '')?.name || x.team || x.bib} ${formatMark(x.mark, r.kind)}`);
          return <RoundLink key={r.id} round={r} showDay extra={names.length ? `冠軍 ${names.join('、')}` : null} />;
        })}
      </section>
    </Shell>
  );
}

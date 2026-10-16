'use client';

import { useApp } from '@/components/AppProvider';
import { RoundLink, Shell } from '@/components/ui';

// Published results, newest first.
export default function ResultsPage() {
  const { t, meet, live } = useApp();
  const done = (meet?.rounds ?? [])
    .filter((r) => live?.results[r.id])
    .sort((a, b) => live!.results[b.id].publishedAt.localeCompare(live!.results[a.id].publishedAt));
  return (
    <Shell title={t('results')}>
      <section className="card">
        {done.length === 0 ? <p className="empty">{t('noResults')}</p> : null}
        {done.map((r) => {
          const top = live!.results[r.id].rows.filter((x) => x.rank === 1);
          return <RoundLink key={r.id} round={r} extra={top.map((x) => x.name || x.team).join('、')} />;
        })}
      </section>
    </Shell>
  );
}

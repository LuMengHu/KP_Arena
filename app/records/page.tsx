'use client';

import Link from 'next/link';
import { useApp } from '@/components/AppProvider';
import { Icon } from '@/components/icons';
import { Empty, Shell } from '@/components/ui';
import { titleFor } from '@/lib/eventName';
import { formatMark, formatMarkFor, recordFor } from '@/lib/marks';

export default function RecordsPage() {
  const { t, meet, live, athleteByBib } = useApp();
  const broken = (meet?.rounds ?? []).flatMap((r) =>
    (live?.results[r.id]?.rows ?? []).filter((row) => row.record).map((row) => ({ r, row })),
  );
  return (
    <Shell title={t('records')} members>
      {broken.length === 0 ? (
        <section className="card">
          <Empty icon="flame">{t('noRecordsBroken')}</Empty>
        </section>
      ) : null}
      {broken.map(({ r, row }, i) => {
        const old = meet ? recordFor(meet, r) : null;
        const name = row.name || athleteByBib.get(row.bib ?? '')?.name || row.team;
        const cls = row.cls || athleteByBib.get(row.bib ?? '')?.cls;
        return (
          <Link key={i} href={`/round/${r.id}`} className="card reccard">
            <span className="ico">
              <Icon name="flame" size={22} />
            </span>
            <div className="grow">
              <div className="sub">{titleFor(r.title)}</div>
              <div className="nm">
                {name} {cls ? <span className="sub">{cls}</span> : null}
              </div>
              {old ? (
                <div className="sub">
                  舊紀錄 {formatMark(old.mark, r.kind)}（{old.holder} {old.year}）
                </div>
              ) : null}
            </div>
            <b className="mk">{formatMark(row.mark, r.kind)}</b>
          </Link>
        );
      })}
      {meet?.records.length ? (
        <section className="card">
          <h3>{t('allRecords')}</h3>
          <ul className="reclist">
            {meet.records.map((rec) => (
              <li key={rec.key}>
                <span className="grow">{titleFor(rec.key)}</span>
                <span className="sub">
                  {rec.holder} {rec.year}
                </span>
                <b>{formatMarkFor(rec.mark, rec.key)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}

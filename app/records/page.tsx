'use client';

import Link from 'next/link';
import { useApp } from '@/components/AppProvider';
import { Shell } from '@/components/ui';
import { titleFor } from '@/lib/eventName';
import { recordFor } from '@/lib/marks';

export default function RecordsPage() {
  const { t, lang, meet, live } = useApp();
  const broken = (meet?.rounds ?? []).flatMap((r) =>
    (live?.results[r.id]?.rows ?? []).filter((row) => row.record).map((row) => ({ r, row })),
  );
  return (
    <Shell title={t('records')}>
      <section className="card">
        {broken.length === 0 ? <p className="empty">{t('noRecordsBroken')}</p> : null}
        {broken.map(({ r, row }, i) => {
          const old = meet ? recordFor(meet, r) : null;
          return (
            <Link key={i} href={`/round/${r.id}`} className="recrow">
              <div>
                🔥 <b>{titleFor(r.title, lang)}</b>
              </div>
              <div>
                {row.name || row.team} {row.cls ? `(${row.cls})` : ''} · <b>{row.mark}</b>
              </div>
              {old ? (
                <div className="sub">
                  {t('record')}：{old.mark} · {old.holder} · {old.year}
                </div>
              ) : null}
            </Link>
          );
        })}
      </section>
      {meet?.records.length ? (
        <section className="card">
          <h3>{t('allRecords')}</h3>
          <table className="tbl">
            <tbody>
              {meet.records.map((rec) => (
                <tr key={rec.key}>
                  <td>{titleFor(rec.key, lang)}</td>
                  <td className="num">{rec.mark}</td>
                  <td className="sub">
                    {rec.holder} {rec.year}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </Shell>
  );
}

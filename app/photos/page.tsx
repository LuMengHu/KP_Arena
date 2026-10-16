'use client';

import { useApp } from '@/components/AppProvider';
import { Empty, Shell } from '@/components/ui';

// Thumbnails live in our bucket; tapping one opens the full photo in the external album.
export default function PhotosPage() {
  const { t, meet, assetUrl } = useApp();
  const photos = [...(meet?.photos ?? [])].reverse();
  return (
    <Shell title={t('photos')}>
      {photos.length === 0 ? (
        <section className="card">
          <Empty icon="camera">{t('noPhotos')}</Empty>
        </section>
      ) : (
        <p className="sub center">點相片打開原圖</p>
      )}
      <div className="grid">
        {photos.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="ph">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(p.thumb)} alt={p.caption} loading="lazy" />
            {p.caption ? <span>{p.caption}</span> : null}
          </a>
        ))}
      </div>
    </Shell>
  );
}

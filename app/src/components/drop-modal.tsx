import { useEffect, useRef, useState } from 'react';
import { dropInfo, formatDuration } from '../lib/drops';
import { iconFallbackURL, iconURL, type BannerMeta } from '../lib/fashion';

export interface DropEntry {
  banner: BannerMeta;
  typeLabel: string;
  kind: 'crate' | 'style-coupon';
  /** Matching-sex items first; hair ids are style ids. */
  items: Array<{ id: number; name: string; sub: string; isHair?: boolean; sex?: 'm' | 'f' | 'u' }>;
}

const PREVIEW_COUNT = 8;

/** Hair and faces interleave so a style drop previews both; crates just take the first few. */
function previewItems(items: DropEntry['items']): DropEntry['items'] {
  const hairs = items.filter((i) => i.isHair);
  const rest = items.filter((i) => !i.isHair);
  if (!hairs.length) return rest.slice(0, PREVIEW_COUNT);
  const half = PREVIEW_COUNT / 2;
  return [...hairs.slice(0, half), ...rest.slice(0, half)];
}

export default function DropModal(props: {
  entries: DropEntry[];
  onTry: (entry: DropEntry) => void;
  onOpen: (entry: DropEntry) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  return (
    <>
      <div className="drops-scrim" aria-hidden="true" onClick={props.onClose} />
      <div className="drops-modal" role="dialog" aria-modal="true" aria-labelledby="drops-title">
        <header className="drops-head">
          <div>
            <h2 id="drops-title">What's new</h2>
            <p>Try it on before you spend a single NX.</p>
          </div>
          <button ref={closeRef} type="button" className="drops-x" aria-label="Close" onClick={props.onClose}>✕</button>
        </header>
        <div className="drops-list">
          {props.entries.map((entry) => {
            const info = dropInfo(entry.banner, now);
            const upcoming = info.state === 'upcoming';
            return (
              <section key={entry.banner.id} className={'drops-card' + (upcoming ? ' upcoming' : ' live')}>
                <div className="drops-card-top">
                  <span className="drops-type">{entry.typeLabel}</span>
                  <span className={'drops-pill' + (upcoming ? ' upcoming' : ' live')}>
                    <i aria-hidden="true" />
                    {upcoming
                      ? `Drops in ${formatDuration(info.startsInMs!)}`
                      : info.endsInMs != null ? `Just dropped · ends in ${formatDuration(info.endsInMs)}` : 'Just dropped'}
                  </span>
                </div>
                <h3>{entry.banner.label}</h3>
                {entry.banner.note && <p className="drops-note">{entry.banner.note}</p>}
                <div className="drops-preview" aria-hidden="true">
                  {previewItems(entry.items).map((item) => (
                    <img
                      key={`${item.isHair ? 'h' : 'i'}${item.id}`}
                      src={iconURL(item.isHair ? item.id * 10 : item.id)}
                      alt=""
                      title={item.name}
                      loading="lazy"
                      draggable={false}
                      onError={(e) => { const next = iconFallbackURL(e.currentTarget.src); if (next) e.currentTarget.src = next; }}
                    />
                  ))}
                  {entry.items.length > PREVIEW_COUNT && <span className="drops-more">+{entry.items.length - PREVIEW_COUNT}</span>}
                </div>
                <div className="drops-actions">
                  <button type="button" className="drops-try" onClick={() => props.onTry(entry)}>
                    {upcoming ? 'Try it on early' : 'Try it on'}
                  </button>
                  <button type="button" className="drops-all" onClick={() => props.onOpen(entry)}>See everything</button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

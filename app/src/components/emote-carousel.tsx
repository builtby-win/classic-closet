import { useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { EMOTES } from '../lib/fashion';
import { faceExpressionSprites } from '../lib/layered-client-renderer';

/** Expression art of the worn face, so the picker shows exactly what each emote will look like. */
export function useEmoteSprites(faceId: number): Record<string, string> {
  const [loaded, setLoaded] = useState<{ faceId: number; sprites: Record<string, string> }>({ faceId, sprites: {} });
  useEffect(() => {
    let cancelled = false;
    faceExpressionSprites(faceId).then((sprites) => { if (!cancelled) setLoaded({ faceId, sprites }); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [faceId]);
  return loaded.faceId === faceId ? loaded.sprites : {};
}

/** Shown on the open button until an emote is picked. */
export const PREVIEW_EMOTE = 'troubled';

interface EmoteCarouselProps {
  faceId: number;
  value: string | undefined;
  onPick: (emote: string | undefined) => void;
  onClose: () => void;
}

/** One entry per emote plus a leading "Default"; picking applies instantly and the sheet stays open. */
const ITEMS = [{ id: undefined, label: 'Default', key: undefined }, ...EMOTES];

/** Free-scrolling emote strip that covers the stage's bottom bar while open. */
export default function EmoteCarousel({ faceId, value, onPick, onClose }: EmoteCarouselProps) {
  const sprites = useEmoteSprites(faceId);
  const [viewportRef, embla] = useEmblaCarousel({ dragFree: true, align: 'start', containScroll: 'trimSnaps' });

  // Open on the worn emote so it is never off-screen.
  useEffect(() => {
    const index = ITEMS.findIndex((item) => item.id === value);
    if (embla && index > 0) embla.scrollTo(Math.max(0, index - 1), true);
    // Only on open: later picks must not re-scroll under the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embla]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') embla?.scrollNext();
      else if (event.key === 'ArrowLeft') embla?.scrollPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embla, onClose]);

  return (
    <div className="emote-sheet" role="group" aria-label="Face emotes">
      <button type="button" className="emote-nav" aria-label="Scroll emotes left" onClick={() => embla?.scrollPrev()}>‹</button>
      <div className="emote-viewport" ref={viewportRef}>
        <div className="emote-track">
          {ITEMS.map((item) => (
            <button key={item.id ?? 'default'} type="button" className={'emote-item' + (item.id && !item.key ? ' unreleased' : '')}
              aria-pressed={value === item.id} aria-label={item.key ? `${item.key} ${item.label}` : item.label}
              title={item.key ? `${item.key} · ${item.label}` : item.id ? `${item.label} (unreleased)` : item.label}
              onClick={() => onPick(value === item.id ? undefined : item.id)}>
              <span className="sprite" aria-hidden="true">{sprites[item.id ?? 'default'] && <img src={sprites[item.id ?? 'default']} alt="" draggable={false} />}</span>
              <span className="name">{item.key ?? item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="emote-nav" aria-label="Scroll emotes right" onClick={() => embla?.scrollNext()}>›</button>
      <button type="button" className="emote-close" aria-label="Close emotes" onClick={onClose}>✓</button>
    </div>
  );
}

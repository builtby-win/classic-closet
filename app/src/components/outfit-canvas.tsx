import { useEffect, useRef, useState } from 'react';
import type { Look } from '../lib/fashion';
import { renderLayeredCharacter } from '../lib/layered-client-renderer';
import { outfitKey } from '../lib/outfits';
import { SPRITE_CANVAS } from '../lib/play-controller';

// The character lives in the centered 128px box of the 256px sprite canvas.
const BOX = { x: (SPRITE_CANVAS - 128) / 2, y: (SPRITE_CANVAS - 128) / 2, size: 128 };

/** Compare panes: a little tighter than the full box so outfit details read larger. */
const FRAMED = { x: BOX.x + 12, y: BOX.y + 10, size: 104 };

/** Tighter crop for strip portraits: the standing character fills ~60% of the box. */
const PORTRAIT = { x: BOX.x + 24, y: BOX.y + 20, size: 80 };

/** Renders are cheap but bursty (a full strip mounts at once), so run them one at a time. */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

async function paint(look: Look, target: HTMLCanvasElement | null, crop = BOX): Promise<HTMLCanvasElement> {
  const buffer = document.createElement('canvas');
  buffer.width = SPRITE_CANVAS;
  buffer.height = SPRITE_CANVAS;
  const ctx = buffer.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  await renderLayeredCharacter(ctx, look, SPRITE_CANVAS, SPRITE_CANVAS);
  const out = target ?? document.createElement('canvas');
  out.width = crop.size;
  out.height = crop.size;
  const outCtx = out.getContext('2d');
  outCtx?.clearRect(0, 0, crop.size, crop.size);
  outCtx?.drawImage(buffer, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
  return out;
}

const thumbs = new Map<string, string>();

/** Small, cached portrait of an outfit for the strip. `look` must already carry the pose to draw. */
export function OutfitThumb({ look, size = 60 }: { look: Look; size?: number }) {
  const key = outfitKey(look);
  const [src, setSrc] = useState<string | undefined>(() => thumbs.get(key));
  useEffect(() => {
    const hit = thumbs.get(key);
    if (hit) { setSrc(hit); return; }
    let cancelled = false;
    setSrc(undefined);
    void enqueue(() => paint(look, null, PORTRAIT)).then((canvas) => {
      const url = canvas.toDataURL();
      thumbs.set(key, url);
      if (!cancelled) setSrc(url);
    }).catch(() => {});
    return () => { cancelled = true; };
    // `look` is fully described by `key`; re-rendering on identity would redo cached work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return src
    ? <img className="oc-thumb" src={src} width={size} height={size} alt="" draggable={false} />
    : <span className="oc-thumb oc-thumb-pending" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Large, crisp render for the compare view. Draws straight into its own canvas, no shared play state. */
export function OutfitStage({ look, label }: { look: Look; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    // Draw into a scratch canvas first so the visible one never flashes empty mid-render.
    void enqueue(() => paint(look, null, FRAMED)).then((scratch) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      canvas.width = scratch.width;
      canvas.height = scratch.height;
      canvas.getContext('2d')?.drawImage(scratch, 0, 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [look]);
  return <canvas ref={ref} className="oc-stage" width={FRAMED.size} height={FRAMED.size} role="img" aria-label={label} />;
}

import { useMemo } from 'react';
import type { Look } from '../lib/fashion';
import { OutfitStage } from './outfit-canvas';

interface CompareViewProps {
  /** The pinned outfit: stays put while you try things on. */
  a: Look;
  /** The live look being tried on. */
  b: Look;
  /** Pose steering so each outfit's weapon gets its own stance. */
  normalize: (look: Look) => Look;
}

/** Two characters in the stage's own footprint: pinned on the left, live on the right. The bottom bar's Apply keeps the live one. */
export default function CompareView({ a, b, normalize }: CompareViewProps) {
  // Both sides share B's pose so differences come from the outfit, not the stance.
  const aPosed = useMemo(() => normalize({ ...a, anim: b.anim, frame: b.frame }), [a, b.anim, b.frame, normalize]);

  return (
    <section id="compare" aria-label="Compare outfits">
      <figure className="cmp-char">
        <OutfitStage look={aPosed} label="Pinned outfit" />
        <figcaption className="cmp-label">Pinned</figcaption>
      </figure>
      <figure className="cmp-char">
        <OutfitStage look={b} label="Current outfit" />
        <figcaption className="cmp-label">Current</figcaption>
      </figure>
    </section>
  );
}

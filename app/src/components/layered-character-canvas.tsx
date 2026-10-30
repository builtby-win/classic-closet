import { useEffect, useMemo, useRef, useState } from 'react';
import type { Look } from '../lib/fashion';
import { lookIdentity, posedFrame, readyPosedFrame, type PosedFrame } from '../lib/layered-client-renderer';
import { getPlayPose, setPlayOrigin, SPRITE_CANVAS, subscribePlayPose } from '../lib/play-controller';

const EMOTE_FRAME_MS = 250;

interface LayeredCharacterCanvasProps {
  look: Look;
  onRendered?: (canvas?: HTMLCanvasElement) => void;
}

/** Canvas view for the independent, local-only layer compositor. */
export default function LayeredCharacterCanvas({ look: savedLook, onRendered }: LayeredCharacterCanvasProps) {
  // Multi-frame emotes (at most two frames) alternate while one is picked; the saved look never carries the frame.
  const [emoteFrame, setEmoteFrame] = useState(0);
  useEffect(() => {
    if (!savedLook.emote) return;
    const timer = window.setInterval(() => setEmoteFrame((frame) => 1 - frame), EMOTE_FRAME_MS);
    return () => {
      window.clearInterval(timer);
      setEmoteFrame(0);
    };
  }, [savedLook.emote]);
  const baseLook = useMemo(() => (savedLook.emote ? { ...savedLook, emoteFrame } : savedLook), [savedLook, emoteFrame]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onRendered);
  useEffect(() => {
    callbackRef.current = onRendered;
  }, [onRendered]);

  // Play mode overrides only the pose, and only here, so the saved look is untouched. The play-pose store is
  // read outside React: a pose change blits an already-composited frame synchronously instead of re-rendering.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const identity = lookIdentity(baseLook);
    let cancelled = false;
    let latest = 0;
    let renderState = '';

    const apply = (frame: PosedFrame, look: Look, playing: boolean) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame.canvas, 0, 0);
      setPlayOrigin(frame.origin);
      const state = frame.missing.length || frame.unresolved.length ? 'partial' : 'ready';
      canvas.dataset.pose = `${look.anim}:${look.frame}`;
      if (state !== renderState) {
        renderState = state;
        canvas.dataset.renderState = state;
        canvas.dataset.missingAssets = frame.missing.join(',');
        canvas.dataset.unresolvedLayers = frame.unresolved.join(',');
      }
      if (!playing) callbackRef.current?.(canvas);
    };

    const show = () => {
      const pose = getPlayPose();
      const look = pose ? { ...baseLook, anim: pose.anim, frame: pose.frame } : baseLook;
      const mine = ++latest;
      const ready = readyPosedFrame(identity, look, canvas.width);
      if (ready) {
        apply(ready, look, !!pose);
        return;
      }
      renderState = 'loading';
      canvas.dataset.renderState = 'loading';
      canvas.dataset.pose = `${look.anim}:${look.frame}`;
      posedFrame(identity, look, canvas.width).then((frame) => {
        if (!cancelled && mine === latest) apply(frame, look, !!pose);
      }).catch((error: unknown) => {
        if (cancelled || mine !== latest) return;
        renderState = 'error';
        canvas.dataset.renderState = 'error';
        canvas.title = error instanceof Error ? error.message : 'Could not render this look';
        callbackRef.current?.();
      });
    };

    show();
    const unsubscribe = subscribePlayPose(show);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [baseLook]);

  return (
    <div id="preview" role="img" aria-label="Character preview">
      <canvas ref={canvasRef} className="preview-local" width={SPRITE_CANVAS} height={SPRITE_CANVAS} aria-hidden="true" />
      {/* Skill effects: twice the sprite canvas so casts can reach far past the character; see play-controller. */}
      <canvas className="preview-fx" width={SPRITE_CANVAS * 2} height={SPRITE_CANVAS * 2} aria-hidden="true" />
    </div>
  );
}

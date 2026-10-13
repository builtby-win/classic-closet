import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Look } from '../lib/fashion';
import { renderLayeredCharacter } from '../lib/layered-client-renderer';
import { getPlayPose, setPlayOrigin, SPRITE_CANVAS, subscribePlayPose } from '../lib/play-controller';

interface LayeredCharacterCanvasProps {
  look: Look;
  onRendered?: (canvas?: HTMLCanvasElement) => void;
}

/** Canvas view for the independent, local-only layer compositor. */
export default function LayeredCharacterCanvas({ look: baseLook, onRendered }: LayeredCharacterCanvasProps) {
  // Play mode overrides only the pose, and only here, so the saved look is untouched.
  const playPose = useSyncExternalStore(subscribePlayPose, getPlayPose, () => null);
  const look = useMemo(
    () => playPose ? { ...baseLook, anim: playPose.anim, frame: playPose.frame } : baseLook,
    [baseLook, playPose],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onRendered);
  useEffect(() => {
    callbackRef.current = onRendered;
  }, [onRendered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let cancelled = false;
    canvas.dataset.renderState = 'loading';
    const buffer = document.createElement('canvas');
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const bufferContext = buffer.getContext('2d');
    if (!bufferContext) return;

    void renderLayeredCharacter(bufferContext, look, canvas.width, canvas.height).then((result) => {
      if (cancelled) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(buffer, 0, 0);
      setPlayOrigin(result.origin);
      canvas.dataset.renderState = result.missing.length || result.unresolved.length ? 'partial' : 'ready';
      canvas.dataset.missingAssets = result.missing.join(',');
      canvas.dataset.unresolvedLayers = result.unresolved.join(',');
      if (!playPose) callbackRef.current?.(canvas);
    }).catch((error: unknown) => {
      if (cancelled) return;
      canvas.dataset.renderState = 'error';
      canvas.title = error instanceof Error ? error.message : 'Could not render this look';
      callbackRef.current?.();
    });

    return () => { cancelled = true; };
  }, [look, playPose]);

  return (
    <div id="preview" role="img" aria-label="Character preview">
      <canvas ref={canvasRef} className="preview-local" width={SPRITE_CANVAS} height={SPRITE_CANVAS} aria-hidden="true" />
      {/* Skill effects: twice the sprite canvas so casts can reach far past the character; see play-controller. */}
      <canvas className="preview-fx" width={SPRITE_CANVAS * 2} height={SPRITE_CANVAS * 2} aria-hidden="true" />
    </div>
  );
}

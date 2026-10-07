import { useEffect, useRef } from 'react';
import type { Look } from '../lib/fashion';
import { renderLayeredCharacter } from '../lib/layered-client-renderer';

interface LayeredCharacterCanvasProps {
  look: Look;
  onRendered?: () => void;
}

/** Canvas view for the independent, local-only layer compositor. */
export default function LayeredCharacterCanvas({ look, onRendered }: LayeredCharacterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onRendered);
  callbackRef.current = onRendered;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let cancelled = false;
    canvas.dataset.renderState = 'loading';

    void renderLayeredCharacter(ctx, look, canvas.width, canvas.height).then((result) => {
      if (cancelled) return;
      canvas.dataset.renderState = result.missing.length || result.unresolved.length ? 'partial' : 'ready';
      canvas.dataset.missingAssets = result.missing.join(',');
      canvas.dataset.unresolvedLayers = result.unresolved.join(',');
      callbackRef.current?.();
    }).catch((error: unknown) => {
      if (cancelled) return;
      canvas.dataset.renderState = 'error';
      canvas.title = error instanceof Error ? error.message : 'Could not render this look';
      callbackRef.current?.();
    });

    return () => { cancelled = true; };
  }, [look]);

  return (
    <div id="preview" role="img" aria-label="Character preview">
      <canvas ref={canvasRef} className="preview-local" width={128} height={128} aria-hidden="true" />
    </div>
  );
}

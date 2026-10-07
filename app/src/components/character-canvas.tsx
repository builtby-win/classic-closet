import { useEffect, useRef, useState } from 'react';
import { renderURL, type Look } from '../lib/fashion';
import { renderCharacterToCanvas } from '../lib/canvas-renderer';

interface CharacterCanvasProps {
  look: Look;
  onRendered?: () => void;
}

export default function CharacterCanvas({ look, onRendered }: CharacterCanvasProps) {
  const url = renderURL(look);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (failedUrl !== url) {
    return (
      <img
        id="preview"
        src={url}
        alt="character preview"
        onLoad={() => onRendered?.()}
        onError={() => setFailedUrl(url)}
      />
    );
  }

  return <LocalCharacterCanvas look={look} onRendered={onRendered} />;
}

function LocalCharacterCanvas({ look, onRendered }: CharacterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    async function draw() {
      if (cancelled) return;
      const complete = await renderCharacterToCanvas(ctx!, lookRef.current, canvas!.width, canvas!.height);
      if (!cancelled) {
        if (complete) {
          onRendered?.();
        } else {
          // If some layers were still fetching, re-draw once they resolve
          requestAnimationFrame(draw);
        }
      }
    }

    draw();

    return () => {
      cancelled = true;
    };
  }, [look, onRendered]);

  return (
    <canvas
      ref={canvasRef}
      id="preview"
      width={128}
      height={128}
      aria-label="character preview"
    />
  );
}

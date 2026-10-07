import { useEffect, useRef, useState } from 'react';
import { renderURL, type Look } from '../lib/fashion';
import { renderCharacterToCanvas } from '../lib/canvas-renderer';

interface CharacterCanvasProps {
  look: Look;
  onRendered?: () => void;
}

export default function CharacterCanvas({ look, onRendered }: CharacterCanvasProps) {
  const url = renderURL(look);
  const [remoteImage, setRemoteImage] = useState<{ url: string; src: string } | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  useEffect(() => {
    setRemoteImage(null);
    setLoadedUrl(null);
    setLoadingUrl(url);

    const controller = new AbortController();
    let objectUrl: string | null = null;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          setLoadingUrl((current) => current === url ? null : current);
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setRemoteImage({ url, src: objectUrl });
      } catch {
        // Keep showing the client-rendered character when the remote render fails.
        setLoadingUrl((current) => current === url ? null : current);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div id="preview" className={loadedUrl === url ? 'remote-ready' : ''} role="img" aria-label="Character preview">
      <LocalCharacterCanvas look={look} onRendered={onRendered} />
      {loadingUrl === url && <span className="preview-loading" role="status" aria-label="Loading official character render" />}
      {remoteImage?.url === url && <img
          className={'preview-resolved' + (loadedUrl === url ? ' loaded' : '')}
          src={remoteImage.src}
          alt=""
          aria-hidden="true"
          onLoad={() => { setLoadedUrl(url); setLoadingUrl(null); onRenderedRef.current?.(); }}
          onError={() => {
            setLoadingUrl(null);
            setRemoteImage((current) => {
              if (current?.url !== url) return current;
              URL.revokeObjectURL(current.src);
              return null;
            });
          }}
        />}
    </div>
  );
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
      className="preview-local"
      width={128}
      height={128}
      aria-hidden="true"
    />
  );
}

import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { PlayController, PlayInput } from '../lib/play-controller';

const KEYS: Record<string, PlayInput> = {
  ArrowLeft: 'left', a: 'left',
  ArrowRight: 'right', d: 'right',
  ArrowDown: 'down', s: 'down',
  ArrowUp: 'jump', w: 'jump', ' ': 'jump',
  z: 'attack', x: 'attack', Control: 'attack',
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}

function PadButton({ input, controller, className, label, children }: {
  input: PlayInput;
  controller: PlayController;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.set(input, true);
  };
  const up = () => controller.set(input, false);
  return (
    <button
      type="button"
      className={`pad-btn ${className}`}
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(event) => event.preventDefault()}
    >{children}</button>
  );
}

/** On-screen pad for play mode; keyboard works at the same time on desktop. */
export default function GamePad({ controller, onExit }: { controller: PlayController; onExit: () => void }) {
  const swipeY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent, down: boolean) => {
      if (isTyping(event.target)) return;
      if (down && event.key === 'Escape') { onExit(); return; }
      const input = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!input) return;
      event.preventDefault();
      if (down && event.repeat) return;
      controller.set(input, down);
    };
    const keydown = (event: KeyboardEvent) => onKey(event, true);
    const keyup = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [controller, onExit]);

  return (
    <div id="gamepad" role="group" aria-label="Character controls">
      <button
        type="button"
        id="pad-grip"
        aria-label="Back to closet"
        onClick={onExit}
        onPointerDown={(event) => { swipeY.current = event.clientY; }}
        onPointerUp={(event) => {
          if (swipeY.current !== null && swipeY.current - event.clientY > 30) onExit();
          swipeY.current = null;
        }}
      ><span /></button>
      <div className="pad-row">
        <div className="pad-dir">
          <PadButton input="left" controller={controller} className="pad-left" label="Walk left">◀</PadButton>
          <PadButton input="down" controller={controller} className="pad-down" label="Duck">▼</PadButton>
          <PadButton input="right" controller={controller} className="pad-right" label="Walk right">▶</PadButton>
        </div>
        <div className="pad-actions">
          <PadButton input="jump" controller={controller} className="pad-jump" label="Jump">Jump</PadButton>
          <PadButton input="attack" controller={controller} className="pad-attack" label="Attack">Attack</PadButton>
        </div>
      </div>
      <p className="pad-hint">←/→ walk · ↓ duck · Space jump · Z attack · Esc closet</p>
    </div>
  );
}

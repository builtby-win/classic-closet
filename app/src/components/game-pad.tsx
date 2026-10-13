import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { PlayController, PlayInput } from '../lib/play-controller';
import { SWIPE_LEVELS, swipeDot } from '../lib/afterimage';
import { loadSkills, SKILL_IDS, type BakedSkill } from '../lib/skills';

const KEYS: Record<string, PlayInput> = {
  ArrowLeft: 'left', a: 'left',
  ArrowRight: 'right', d: 'right',
  ArrowDown: 'down', s: 'down',
  ArrowUp: 'jump', w: 'jump', ' ': 'jump',
  z: 'attack', x: 'attack', Control: 'attack',
  c: 'skill',
};

const ARROW_ROTATE = { left: 270, down: 180, right: 90 } as const;

/** Chunky white arrow with a dark outline, in the MapleStory UI style. */
function Arrow({ dir }: { dir: keyof typeof ARROW_ROTATE }) {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" style={{ transform: `rotate(${ARROW_ROTATE[dir]}deg)` }}>
      <path d="M12 3 L21 13 H15.5 V21 H8.5 V13 H3 Z" fill="#fff" stroke="#1d2b4a" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}

function PadButton({ input, controller, className, label, hotkey, children }: {
  input: PlayInput;
  controller: PlayController;
  className: string;
  label: string;
  hotkey?: string;
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
    >{children}{hotkey && <kbd className="pad-key" aria-hidden="true">{hotkey}</kbd>}</button>
  );
}

/** On-screen pad for play mode; keyboard works at the same time on desktop. */
export default function GamePad({ controller, onExit }: { controller: PlayController; onExit: () => void }) {
  const swipeY = useRef<number | null>(null);
  const [skills, setSkills] = useState<BakedSkill[]>([]);
  const [picked, setPicked] = useState(0);
  const skill = skills[picked];
  const [swipe, setSwipe] = useState(() => {
    const saved = Number(window.localStorage.getItem('mf-swipe'));
    return Number.isInteger(saved) && saved >= 0 && saved < SWIPE_LEVELS.length ? saved : 0;
  });
  const tier = SWIPE_LEVELS[swipe]!;
  useEffect(() => {
    controller.setSwipeLevel(tier.level);
    window.localStorage.setItem('mf-swipe', String(swipe));
  }, [controller, swipe, tier.level]);
  useEffect(() => {
    void loadSkills().then((all) => setSkills(SKILL_IDS.flatMap((id) => all[id] ?? [])));
  }, []);
  useEffect(() => {
    if (skill) controller.selectSkill(skill.id);
  }, [controller, skill]);

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
      ><span /><small>Closet</small></button>
      <button type="button" className="pad-mastery" onClick={() => setSwipe((current) => (current + 1) % SWIPE_LEVELS.length)} aria-label={`Weapon swipe: ${tier.name}. Tap to change`}>
        <i style={{ background: tier.level === null ? 'conic-gradient(#6f96ff, #c86eff, #ff5f6e, #6f96ff)' : swipeDot(tier.level) }} />Swipe · {tier.name}
      </button>
      <div className="pad-row">
        <div className="pad-dir">
          <PadButton input="left" controller={controller} className="pad-left" label="Walk left"><Arrow dir="left" /></PadButton>
          <PadButton input="down" controller={controller} className="pad-down" label="Duck"><Arrow dir="down" /></PadButton>
          <PadButton input="right" controller={controller} className="pad-right" label="Walk right"><Arrow dir="right" /></PadButton>
        </div>
        <div className="pad-actions">
          {skill && <div className="pad-skill">
            <PadButton input="skill" controller={controller} className="pad-cast" label={`Cast ${skill.name}`} hotkey="C">
              <img src={skill.icon} alt="" draggable={false} />
            </PadButton>
            {skills.length > 1 && <button type="button" className="pad-swap" aria-label={`Skill: ${skill.name}. Tap to switch`} title={skill.name} onClick={() => setPicked((picked + 1) % skills.length)}>⇄</button>}
          </div>}
          <PadButton input="jump" controller={controller} className="pad-jump" label="Jump" hotkey="Space">Jump</PadButton>
          <PadButton input="attack" controller={controller} className="pad-attack" label="Attack" hotkey="Z">Attack</PadButton>
        </div>
      </div>
      <p className="pad-hint">←/→ or A/D walk · ↓ duck · Space jump · Z attack · C skill · Esc closet</p>
    </div>
  );
}

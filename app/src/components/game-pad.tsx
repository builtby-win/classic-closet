import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { MASTERY_TIERS, type PlayController, type PlayInput } from '../lib/play-controller';
import { loadSkills, SKILL_IDS, type BakedSkill } from '../lib/skills';

const KEYS: Record<string, PlayInput> = {
  ArrowLeft: 'left', a: 'left',
  ArrowRight: 'right', d: 'right',
  ArrowDown: 'down', s: 'down',
  ArrowUp: 'jump', w: 'jump', ' ': 'jump',
  z: 'attack', x: 'attack', Control: 'attack',
  c: 'skill',
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
  const [skills, setSkills] = useState<BakedSkill[]>([]);
  const [picked, setPicked] = useState(0);
  const skill = skills[picked];
  const [mastery, setMastery] = useState(() => {
    const saved = Number(window.localStorage.getItem('mf-mastery'));
    return Number.isInteger(saved) && saved >= 0 && saved < MASTERY_TIERS.length ? saved : 0;
  });
  const tier = MASTERY_TIERS[mastery]!;
  useEffect(() => {
    controller.setMastery(mastery);
    window.localStorage.setItem('mf-mastery', String(mastery));
  }, [controller, mastery]);

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
      <button type="button" className="pad-mastery" onClick={() => setMastery((current) => (current + 1) % MASTERY_TIERS.length)} aria-label={`Weapon swipe mastery ${mastery + 1}: ${tier.name}. Tap to change`}>
        <i style={{ background: tier.dot }} />Mastery {mastery + 1}
      </button>
      <div className="pad-row">
        <div className="pad-dir">
          <PadButton input="left" controller={controller} className="pad-left" label="Walk left">◀</PadButton>
          <PadButton input="down" controller={controller} className="pad-down" label="Duck">▼</PadButton>
          <PadButton input="right" controller={controller} className="pad-right" label="Walk right">▶</PadButton>
        </div>
        <div className="pad-actions">
          {skill && <div className="pad-skill">
            <PadButton input="skill" controller={controller} className="pad-cast" label={`Cast ${skill.name}`}>
              <img src={skill.icon} alt="" draggable={false} />
            </PadButton>
            {skills.length > 1 && <button type="button" className="pad-swap" aria-label={`Skill: ${skill.name}. Tap to switch`} title={skill.name} onClick={() => setPicked((picked + 1) % skills.length)}>⇄</button>}
          </div>}
          <PadButton input="jump" controller={controller} className="pad-jump" label="Jump">Jump</PadButton>
          <PadButton input="attack" controller={controller} className="pad-attack" label="Attack">Attack</PadButton>
        </div>
      </div>
      <p className="pad-hint">←/→ walk · ↓ duck · Space jump · Z attack · C skill · Esc closet</p>
    </div>
  );
}

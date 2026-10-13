import { weaponMotion } from './fashion';

/** Pose override read by the preview canvas while play mode is running. */
export interface PlayPose {
  anim: string;
  frame: number;
}

let pose: PlayPose | null = null;
const listeners = new Set<() => void>();

export function getPlayPose(): PlayPose | null {
  return pose;
}

export function subscribePlayPose(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setPlayPose(next: PlayPose | null): void {
  if (pose === next || (pose && next && pose.anim === next.anim && pose.frame === next.frame)) return;
  pose = next;
  listeners.forEach((listener) => listener());
}

export type PlayInput = 'left' | 'right' | 'down' | 'attack' | 'jump';

/** Frame counts of the baked play poses (base.json). */
const ATTACK_FRAMES: Record<string, number> = {
  swingO1: 3, stabO1: 2, swingT1: 3, stabT1: 3, swingP1: 3, shoot1: 3, shoot2: 5,
};
export const PLAY_POSES = [
  { anim: 'walk1', frames: 4 }, { anim: 'walk2', frames: 4 }, { anim: 'prone', frames: 1 }, { anim: 'jump', frames: 1 },
  ...Object.entries(ATTACK_FRAMES).map(([anim, frames]) => ({ anim, frames })),
];

const WALK_MS = 140;
const IDLE_MS = 500;
const ATTACK_MS = 150;
const JUMP_MS = 620;
const JUMP_HEIGHT = 0.3; // fraction of the canvas
const SPEED = 0.45; // canvas widths per second
const IDLE_CYCLE = [0, 1, 2, 1];

/**
 * Rudimentary mock-control loop: keeps a pose in the play-pose store and moves
 * the preview element with CSS only, so React never re-renders per frame.
 * Sprites face left, so facing right is a horizontal flip.
 */
export class PlayController {
  private held = new Set<PlayInput>();
  private raf = 0;
  private last = 0;
  private x = 0;
  private facing: -1 | 1 = -1;
  private clock = 0; // ms in the current pose
  private mode: 'idle' | 'walk' | 'prone' | 'attack' = 'idle';
  private attackAnim = 'swingO1';
  private jumpAt = -1; // ms since takeoff, -1 on the ground
  private attackQueued = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly weaponSub: () => string | undefined,
  ) {}

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.held.clear();
    setPlayPose(null);
    this.element.style.transform = '';
  }

  set(input: PlayInput, down: boolean): void {
    if (down) {
      this.held.add(input);
      if (input === 'attack') this.attackQueued = true;
      if (input === 'jump' && this.jumpAt < 0 && this.mode !== 'prone') this.jumpAt = 0;
    } else {
      this.held.delete(input);
    }
  }

  private tick = (now: number): void => {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const motion = weaponMotion(this.weaponSub());
    const airborne = this.jumpAt >= 0;
    const dir = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);

    if (this.attackQueued) {
      this.attackQueued = false;
      if (this.mode !== 'attack' && this.mode !== 'prone') {
        this.mode = 'attack';
        this.attackAnim = motion.attack;
        this.clock = 0;
      }
    }

    let next: PlayPose;
    const attackFrames = ATTACK_FRAMES[this.attackAnim] ?? 3;
    if (this.mode === 'attack') {
      this.clock += dt;
      const frame = Math.floor(this.clock / ATTACK_MS);
      if (frame >= attackFrames) {
        this.mode = 'idle';
        this.clock = 0;
      }
    } else if (!airborne && this.held.has('down')) {
      if (this.mode !== 'prone') { this.mode = 'prone'; this.clock = 0; }
    } else if (dir !== 0) {
      if (this.mode !== 'walk') { this.mode = 'walk'; this.clock = 0; }
    } else if (this.mode !== 'idle') {
      this.mode = 'idle';
      this.clock = 0;
    }

    const canMove = this.mode === 'walk' || (airborne && this.mode !== 'attack');
    if (dir !== 0 && this.mode !== 'attack' && this.mode !== 'prone') this.facing = dir > 0 ? 1 : -1;
    const canvasWidth = this.element.clientWidth || 128;
    if (canMove && dir !== 0) {
      const limit = Math.max(0, (this.element.parentElement?.parentElement?.clientWidth ?? canvasWidth) / 2 - canvasWidth * 0.28);
      this.x = Math.max(-limit, Math.min(limit, this.x + dir * SPEED * canvasWidth * dt / 1000));
    }

    let lift = 0;
    if (airborne) {
      this.jumpAt += dt;
      const t = this.jumpAt / JUMP_MS;
      if (t >= 1) this.jumpAt = -1;
      else lift = 4 * t * (1 - t) * JUMP_HEIGHT * canvasWidth;
    }

    if (this.mode === 'attack') {
      next = { anim: this.attackAnim, frame: Math.min(attackFrames - 1, Math.floor(this.clock / ATTACK_MS)) };
    } else if (this.jumpAt >= 0) {
      next = { anim: 'jump', frame: 0 };
    } else if (this.mode === 'prone') {
      next = { anim: 'prone', frame: 0 };
    } else if (this.mode === 'walk') {
      this.clock += dt;
      next = { anim: motion.walk, frame: Math.floor(this.clock / WALK_MS) % 4 };
    } else {
      this.clock += dt;
      next = { anim: motion.stand, frame: IDLE_CYCLE[Math.floor(this.clock / IDLE_MS) % IDLE_CYCLE.length]! };
    }
    setPlayPose(next);

    this.element.style.transform = `translate(${this.x}px, ${-lift}px) scaleX(${-this.facing})`;
    this.raf = requestAnimationFrame(this.tick);
  };
}

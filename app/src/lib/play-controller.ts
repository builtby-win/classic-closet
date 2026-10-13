import { weaponMotion } from './fashion';
import { motionActions } from './layered-client-renderer';
import { afterimageSetFor, loadAfterimage, swipeActions, swipeImageUrls, type AfterimageSet } from './afterimage';
import { ATTACK_FRAMES, castPlan, loadSkills, planMs, type BakedSkillFrame, type CastPlan, type PosePhase } from './skills';

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

let origin = { x: 128, y: 160 };

/** Where the character's source origin sits on the sprite canvas (set by the canvas after each draw). */
export function setPlayOrigin(next: { x: number; y: number }): void {
  origin = next;
}

export type PlayInput = 'left' | 'right' | 'down' | 'attack' | 'jump' | 'skill';

/** Sprite canvas edge in source pixels: the 128px character box plus room so wide auras and effects aren't cropped. */
export const SPRITE_CANVAS = 256;
const FX_SIZE = SPRITE_CANVAS * 2;
const FX_PAD = (FX_SIZE - SPRITE_CANVAS) / 2; // the fx canvas extends this far past the sprite canvas on each side
const imageCache = new Map<string, Promise<HTMLImageElement>>();
/** Decoded effect images, so the per-frame draw never has to wait on a promise. */
const readyImages = new Map<string, HTMLImageElement>();
function fxImage(src: string): Promise<HTMLImageElement> {
  let image = imageCache.get(src);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => { readyImages.set(src, el); resolve(el); };
      el.onerror = () => reject(new Error(`Could not load ${src}`));
      el.src = src;
    });
    imageCache.set(src, image);
  }
  return image;
}

function frameAt(frames: BakedSkillFrame[], t: number): { frame: BakedSkillFrame; mix: number } | null {
  let start = 0;
  for (const frame of frames) {
    if (t < start + frame.delay) return { frame, mix: (t - start) / frame.delay };
    start += frame.delay;
  }
  return null;
}

/** An attack in progress: its pose, ms since it began, and ms per body frame (to time afterimage sprites). */
interface Swing {
  anim: string;
  t: number;
  frameMs: number;
}

/** Every melee pose a cash weapon might ship; filtered by what the item has. */
const CASH_ATTACKS = Object.keys(ATTACK_FRAMES).filter((anim) => !anim.startsWith('shoot'));

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
  private skillQueued = false;
  private skillId = '4201003';
  private weaponId: number | undefined;
  private weaponActions: Set<string> | null = null;
  private lastAttack = '';
  private repeats = 0;
  private swipeOverride: number | null = null;
  private swipeSet: string | null = null;
  private swipeData: AfterimageSet | null = null;
  private tail: Swing | null = null; // the last swing, kept running so its afterimage can finish after the body pose ends
  private plan: CastPlan | null = null;
  private castClock = 0;
  private readonly fx: CanvasRenderingContext2D | null;
  private fxDirty = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly weapon: () => { id: number | undefined; sub: string | undefined; level: number },
  ) {
    this.fx = element.querySelector<HTMLCanvasElement>('.preview-fx')?.getContext('2d') ?? null;
    this.fx && (this.fx.imageSmoothingEnabled = false);
    void loadSkills().then((skills) => Object.values(skills).forEach((skill) =>
      [...Object.values(skill.sequences).flat().map((frame) => frame.image), ...(skill.projectile ? [skill.projectile] : [])]
        .forEach((src) => void fxImage(src).catch(() => undefined))));
  }

  /** Weapon swipe level (0 blue ... 10 max); null follows the worn weapon's required level. */
  setSwipeLevel(level: number | null): void {
    this.swipeOverride = level;
  }

  selectSkill(id: string): void {
    this.skillId = id;
  }

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.held.clear();
    setPlayPose(null);
    this.element.style.transform = '';
    this.fx?.clearRect(0, 0, FX_SIZE, FX_SIZE);
  }

  set(input: PlayInput, down: boolean): void {
    if (down) {
      this.held.add(input);
      if (input === 'attack') this.attackQueued = true;
      if (input === 'skill') this.skillQueued = true;
      if (input === 'jump' && this.jumpAt < 0 && this.mode !== 'prone') this.jumpAt = 0;
    } else {
      this.held.delete(input);
    }
  }

  private async startCast(weaponAttack: string): Promise<void> {
    const skill = (await loadSkills())[this.skillId];
    if (!skill || this.plan) return;
    this.mode = 'idle'; // the plan owns the body while its poses play
    this.clock = 0;
    this.castClock = 0;
    this.plan = castPlan(skill, weaponAttack);
  }

  private syncWeaponActions(id: number | undefined): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.weaponActions = null;
    if (id === undefined) return;
    void motionActions(id).then((actions) => {
      if (this.weaponId === id) this.weaponActions = actions;
    });
  }

  /** A random attack the worn weapon really has frames for, avoiding an immediate repeat. */
  private pickAttack(sub: string | undefined, motion: { attack: string; attacks: string[] }): string {
    // A cash weapon's real moves are whatever its art ships, so offer every melee pose and let the frames decide.
    const candidates = sub === 'Cash' ? CASH_ATTACKS : motion.attacks;
    const have = this.weaponActions;
    let pool = have ? candidates.filter((anim) => have.has(anim)) : candidates;
    if (!pool.length) pool = [motion.attack];
    // Random, but never the same move three times running.
    const choices = this.repeats >= 2 ? pool.filter((anim) => anim !== this.lastAttack) : pool;
    const pick = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))]!;
    this.repeats = pick === this.lastAttack ? this.repeats + 1 : 1;
    this.lastAttack = pick;
    return pick;
  }

  private syncSwipeSet(set: string | null): void {
    if (set === this.swipeSet) return;
    this.swipeSet = set;
    this.swipeData = null;
    if (!set) return;
    void loadAfterimage(set).then((data) => {
      if (!data || this.swipeSet !== set) return;
      this.swipeData = data;
      swipeImageUrls(data).forEach((url) => void fxImage(url).catch(() => undefined));
    });
  }

  /** The client's weapon afterimage: each sprite starts on its body frame and fades over its own delay. */
  private drawSwipe(
    fx: CanvasRenderingContext2D,
    set: string,
    frames: Record<string, import('./afterimage').AfterimageSprite[]>,
    swing: Swing,
    ox: number,
    oy: number,
  ): void {
    for (const [key, sprites] of Object.entries(frames)) {
      let at = Number(key) * swing.frameMs;
      for (const sprite of sprites) {
        const local = swing.t - at;
        at += sprite.delay;
        if (local < 0 || local >= sprite.delay) continue;
        const url = `/sprites/afterimage/${set}/${sprite.image}`;
        const image = readyImages.get(url);
        if (!image) { void fxImage(url); continue; }
        fx.globalAlpha = (sprite.a0 + (sprite.a1 - sprite.a0) * (local / sprite.delay)) / 255;
        fx.drawImage(image, Math.round(ox - sprite.ox), Math.round(oy - sprite.oy));
      }
    }
    fx.globalAlpha = 1;
  }

  /** The pose phase playing at `t`, plus how far through its run of same-pose phases it is (for the lunge). */
  private poseAt(plan: CastPlan, t: number): { phase: PosePhase; run: number; sinceMs: number; frameMs: number } | null {
    let start = 0;
    for (let i = 0; i < plan.poses.length; i++) {
      const phase = plan.poses[i]!;
      if (t < start + phase.ms) {
        let first = i;
        while (first > 0 && plan.poses[first - 1]!.anim === phase.anim) first--;
        let last = i;
        while (last < plan.poses.length - 1 && plan.poses[last + 1]!.anim === phase.anim) last++;
        const runStart = plan.poses.slice(0, first).reduce((total, p) => total + p.ms, 0);
        const runMs = plan.poses.slice(first, last + 1).reduce((total, p) => total + p.ms, 0);
        return { phase, run: (t - runStart) / runMs, sinceMs: t - runStart, frameMs: plan.poses[first]!.ms };
      }
      start += phase.ms;
    }
    return null;
  }

  /** Every pose run of the cast, so an earlier swing's afterimage keeps fading while the next pose plays. */
  private castSwings(plan: CastPlan, t: number): Swing[] {
    const swings: Swing[] = [];
    let start = 0;
    for (let i = 0; i < plan.poses.length; i++) {
      const phase = plan.poses[i]!;
      if (plan.poses[i - 1]?.anim !== phase.anim) {
        if (t >= start && t - start < 600) swings.push({ anim: phase.anim, t: t - start, frameMs: phase.ms });
      }
      start += phase.ms;
    }
    return swings;
  }

  private drawEffects(swings: Swing[], level: number): void {
    const { fx, plan } = this;
    if (!fx) return;
    const swipes = this.swipeData && (plan?.weaponSwipe ?? true) ? swings.flatMap((swing) => {
      const action = swipeActions(this.swipeData!, level, swing.anim);
      return action ? [{ swing, frames: action.frames }] : [];
    }) : [];
    if (!plan && !swipes.length) {
      if (this.fxDirty) { fx.clearRect(0, 0, FX_SIZE, FX_SIZE); this.fxDirty = false; }
      return;
    }
    fx.clearRect(0, 0, FX_SIZE, FX_SIZE);
    this.fxDirty = true;
    const ox = FX_PAD + origin.x;
    const oy = FX_PAD + origin.y;
    for (const { swing, frames } of swipes) this.drawSwipe(fx, this.swipeData!.set, frames, swing, ox, oy);
    if (!plan) return;
    for (const cue of plan.effects) {
      const hit = frameAt(cue.frames, this.castClock - cue.at);
      if (!hit || this.castClock < cue.at) continue;
      const image = readyImages.get(hit.frame.image);
      if (!image) { void fxImage(hit.frame.image); continue; }
      fx.globalAlpha = (hit.frame.a0 + (hit.frame.a1 - hit.frame.a0) * hit.mix) / 255;
      fx.drawImage(image, Math.round(ox + cue.x - hit.frame.origin.x), Math.round(oy + cue.y - hit.frame.origin.y));
    }
    fx.globalAlpha = 1;
    for (const cue of plan.projectiles) {
      const t = (this.castClock - cue.at) / cue.ms;
      const image = readyImages.get(cue.image);
      if (t < 0 || t > 1 || !image) continue;
      // Ghost copies behind the star read as motion at this frame rate.
      for (let ghost = 3; ghost >= 0; ghost--) {
        const g = Math.max(0, t - ghost * 0.06);
        const e = 1 - (1 - g) * (1 - g) * 0.6 - 0.4 * (1 - g); // fast out of the hand, steady after
        const x = ox + cue.from.x + (cue.to.x - cue.from.x) * e;
        const y = oy + cue.from.y + (cue.to.y - cue.from.y) * e - Math.sin(g * Math.PI) * 4;
        fx.save();
        fx.globalAlpha = ghost === 0 ? 1 : 0.28 / ghost;
        fx.translate(Math.round(x), Math.round(y));
        fx.rotate(-g * cue.ms / 1000 * 28);
        fx.drawImage(image, -image.width / 2, -image.height / 2);
        fx.restore();
      }
    }
  }

  private tick = (now: number): void => {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const worn = this.weapon();
    const motion = weaponMotion(worn.sub);
    this.syncSwipeSet(afterimageSetFor(worn.sub));
    this.syncWeaponActions(worn.id);
    const airborne = this.jumpAt >= 0;
    const dir = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);

    if (this.attackQueued) {
      this.attackQueued = false;
      if (this.mode !== 'attack' && this.mode !== 'prone') {
        this.mode = 'attack';
        this.attackAnim = this.pickAttack(worn.sub, motion);
        this.clock = 0;
      }
    }

    if (this.skillQueued) {
      this.skillQueued = false;
      if (!this.plan && this.mode !== 'prone') void this.startCast(motion.attack);
    }

    let next: PlayPose;
    const attackFrames = ATTACK_FRAMES[this.attackAnim] ?? 3;
    let casting: PosePhase | null = null;
    let strike: number | null = null; // 0..1 through the current swing, for the lunge
    let swing: Swing | null = null;
    if (this.plan) {
      this.castClock += dt;
      if (this.castClock >= planMs(this.plan)) this.plan = null;
      const pose = this.plan ? this.poseAt(this.plan, this.castClock) : null;
      casting = pose?.phase ?? null;
      if (pose) {
        strike = pose.run;
        swing = { anim: pose.phase.anim, t: pose.sinceMs, frameMs: pose.frameMs };
      }
    }

    if (casting) {
      // A cast owns the body: the pose comes from its timeline below.
    } else if (this.mode === 'attack') {
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

    const canMove = !casting && (this.mode === 'walk' || (airborne && this.mode !== 'attack'));
    if (dir !== 0 && !casting && this.mode !== 'attack' && this.mode !== 'prone') this.facing = dir > 0 ? 1 : -1;
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

    if (casting) {
      next = { anim: casting.anim, frame: casting.frame };
    } else if (this.mode === 'attack') {
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

    // A short lunge into each swing keeps the body from feeling pinned.
    if (strike === null && this.mode === 'attack') {
      strike = Math.min(1, this.clock / (attackFrames * ATTACK_MS));
      swing = { anim: this.attackAnim, t: this.clock, frameMs: ATTACK_MS };
    }
    if (swing) this.tail = this.plan && !this.plan.weaponSwipe ? null : { ...swing };
    else if (this.tail) {
      this.tail.t += dt;
      if (this.tail.t > 1500) this.tail = null;
    }
    const swings = this.plan ? this.castSwings(this.plan, this.castClock) : swing ?? this.tail ? [swing ?? this.tail!] : [];
    this.drawEffects(swings, this.swipeOverride ?? worn.level);
    const lunge = strike === null ? 0 : Math.sin(Math.min(1, strike) * Math.PI) * canvasWidth * 0.05 * this.facing;
    this.element.style.transform = `translate(${this.x + lunge}px, ${-lift}px) scaleX(${-this.facing})`;
    this.raf = requestAnimationFrame(this.tick);
  };
}

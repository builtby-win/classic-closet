import type { BakedSkill, BakedSkillFrame } from '../../scripts/bake-skills';

export type { BakedSkill, BakedSkillFrame };

/** One body pose held for `ms`; frame indexes come from the baked base poses. */
export interface PosePhase {
  anim: string;
  frame: number;
  ms: number;
}

/** A baked sprite sequence played from `at` ms into the cast, offset from the character origin. */
export interface EffectCue {
  frames: BakedSkillFrame[];
  at: number;
  x: number;
  y: number;
}

/** A sprite thrown from `from` to `to` (offsets from the character origin) over `ms`. */
export interface ProjectileCue {
  image: string;
  at: number;
  ms: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface CastPlan {
  poses: PosePhase[];
  effects: EffectCue[];
  projectiles: ProjectileCue[];
  /** Whether the worn weapon's swipe trails the poses; skills with their own slash art turn it off. */
  weaponSwipe: boolean;
  /** Multiplier the poses' real delays were played at, so the weapon swipe keeps in step. */
  timeScale: number;
}

/** Total length: the cast ends once the body and every effect have finished. */
export function planMs(plan: CastPlan): number {
  return Math.max(
    plan.poses.reduce((total, phase) => total + phase.ms, 0),
    ...plan.effects.map((cue) => cue.at + sequenceMs(cue.frames)),
    ...plan.projectiles.map((cue) => cue.at + cue.ms),
  );
}

/** Pad order: warrior, mage, archer, thief. */
export const SKILL_IDS = [
  '1001001', '1001002', '2001002', '2001003', '3101005', '3201004', '3111003', '4001002', '4201003', '4001003',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

let manifest: Promise<Record<string, BakedSkill>> | null = null;

export function loadSkills(): Promise<Record<string, BakedSkill>> {
  manifest ??= fetch('/sprites/skills/skills.json')
    .then((response) => response.ok ? response.json() as Promise<Record<string, BakedSkill>> : {})
    .catch(() => ({}));
  return manifest;
}

export function sequenceMs(frames: BakedSkillFrame[]): number {
  return frames.reduce((total, frame) => total + frame.delay, 0);
}

/**
 * The client's per-frame body delays (ms) of the baked attack poses, as recorded in Character.wz
 * (the reference's base.json `specs`). Everything attack-shaped is timed from these, so swings, stabs and shots
 * run at the real game's pace.
 */
export const ATTACK_DELAYS: Record<string, number[]> = {
  swingO1: [300, 150, 350], swingO2: [300, 150, 350], swingO3: [300, 150, 350], stabO1: [350, 450], stabO2: [350, 450],
  swingT1: [300, 150, 350], swingT2: [300, 150, 350], swingT3: [300, 150, 350], stabT1: [300, 100, 350], stabT2: [300, 100, 350],
  swingP1: [300, 150, 350], swingP2: [300, 150, 350],
  shoot1: [300, 150, 350], shoot2: [160, 160, 250, 100, 150],
};

/** Frame counts of the baked attack poses (base.json). */
export const ATTACK_FRAMES: Record<string, number> = Object.fromEntries(
  Object.entries(ATTACK_DELAYS).map(([anim, delays]) => [anim, delays.length]),
);

/** The body frame each attack's weapon afterimage starts on, which is where the blow (or shot) lands. */
const STRIKE_FRAME: Record<string, number> = {
  swingO1: 2, swingO2: 2, swingO3: 2, stabO1: 1, stabO2: 1, swingT1: 2, swingT2: 2, swingT3: 2,
  stabT1: 2, stabT2: 2, swingP1: 2, swingP2: 2, shoot1: 2, shoot2: 4,
};

const delaysOf = (anim: string): number[] => ATTACK_DELAYS[anim] ?? [150, 150, 150];

/** Ms into an attack at which body frame `frame` begins. */
export function attackFrameStart(anim: string, frame: number, scale = 1): number {
  return delaysOf(anim).slice(0, frame).reduce((total, ms) => total + ms, 0) * scale;
}

/** Ms into an attack at which its blow lands. */
export function attackStrikeMs(anim: string, scale = 1): number {
  return attackFrameStart(anim, STRIKE_FRAME[anim] ?? delaysOf(anim).length - 1, scale);
}

export function attackMs(anim: string, scale = 1): number {
  return attackFrameStart(anim, delaysOf(anim).length, scale);
}

/** The body frame showing `t` ms into an attack; the frame count once the attack is over. */
export function attackFrameAt(anim: string, t: number, scale = 1): number {
  let start = 0;
  const delays = delaysOf(anim);
  for (let frame = 0; frame < delays.length; frame++) {
    start += delays[frame]! * scale;
    if (t < start) return frame;
  }
  return delays.length;
}

function swing(anim: string, scale: number): PosePhase[] {
  return delaysOf(anim).map((ms, frame) => ({ anim, frame, ms: ms * scale }));
}

/** Where the (unseen) target stands, in pixels left of the origin; sprites face left. */
const TARGET_X = -70;
const TARGET_Y = -32;

/** A run of strikes: each one lands on the target `flight` ms after it leaves (shots, spells) or at once (flight 0). */
interface Volley {
  count: number;
  /** When the first strike leaves, ms after its pose's blow lands, and the gap between strikes (ms). */
  start: number;
  gap: number;
  flight: number;
  /** Target-side hit sequences, cycled per strike. */
  hits: string[];
  /** A baked sequence (spell bolt, arrow streak; drawn facing left) travelling to the target, stepped frame by frame. */
  ball?: string;
  /** Target x (px from the origin) when the strike should land farther out than the default target, as shots and bolts do. */
  range?: number;
}

/**
 * How a skill is cast. The reference data only records which weapon a skill needs,
 * not a usable body timeline (Savage Blow's "savage" pose is not in the base rig),
 * so poses are built from the baked attack poses.
 */
interface SkillSpec {
  /** combo: dagger stab then swing; ranged: the bow/crossbow shot; worn: the worn weapon's own attack. */
  stance: 'combo' | 'ranged' | 'worn';
  /** Times the body sequence repeats, and a multiplier on the real frame delays (for made-up combos that the rig has no single action for). */
  rounds: number;
  timeScale?: number;
  /** Whether the worn weapon's swipe trails the poses; skills with their own slash art turn it off. */
  weaponSwipe: boolean;
  /** Sequence played over the caster at the start of the cast. */
  self?: string;
  volley?: Volley;
}

const SPECS: Record<SkillId, SkillSpec> = {
  // Savage Blow: six hits around two stab+slash rounds. Its own "savage" action isn't in the rig, so the two
  // real poses are compressed to fit the effect's ~1.1s.
  '4201003': {
    stance: 'combo', rounds: 2, timeScale: 0.4, weaponSwipe: false, self: 'effect',
    volley: { count: 6, start: 0, gap: 110, flight: 0, hits: ['hit/0', 'hit/1', 'hit/2'] },
  },
  // Lucky Seven: the skill's own effect is the pair of stars in flight (its first frame is a 1px wind-up
  // placeholder), so it plays from the throw with nothing added where they land.
  '4001003': { stance: 'worn', rounds: 1, weaponSwipe: true, self: 'effect' },
  '4001002': {
    stance: 'combo', rounds: 1, timeScale: 0.5, weaponSwipe: true,
    volley: { count: 2, start: 0, gap: 0, flight: 0, hits: ['hit/0', 'hit/1'] },
  },
  '1001001': {
    stance: 'worn', rounds: 1, weaponSwipe: false, self: 'effect',
    volley: { count: 1, start: 0, gap: 0, flight: 0, hits: ['hit/0'] },
  },
  '1001002': {
    stance: 'worn', rounds: 1, weaponSwipe: false, self: 'effect',
    volley: { count: 2, start: 0, gap: 130, flight: 0, hits: ['hit/0', 'hit/1'] },
  },
  '2001002': {
    stance: 'worn', rounds: 1, weaponSwipe: true,
    volley: { count: 1, start: 0, gap: 0, flight: 320, hits: ['hit/0'], ball: 'ball', range: -150 },
  },
  '2001003': {
    stance: 'worn', rounds: 1, weaponSwipe: true, self: 'effect',
    volley: { count: 2, start: 0, gap: 130, flight: 0, hits: ['hit/0'] },
  },
  '3101005': {
    stance: 'ranged', rounds: 1, weaponSwipe: false,
    volley: { count: 1, start: 0, gap: 0, flight: 400, hits: ['hit/0'], ball: 'ball', range: -160 },
  },
  '3201004': {
    stance: 'ranged', rounds: 1, weaponSwipe: false, self: 'effect',
    volley: { count: 1, start: 0, gap: 0, flight: 380, hits: ['hit/0'], ball: 'ball', range: -160 },
  },
  // Strafe's effect (a 300ms wind-up, then five 100ms frames) is as long as one shoot1.
  '3111003': {
    stance: 'ranged', rounds: 1, weaponSwipe: false, self: 'effect',
    volley: { count: 5, start: 0, gap: 100, flight: 340, hits: ['hit/0'], ball: 'ball', range: -160 },
  },
};

/** Where an arrow or bolt leaves the caster, in pixels from the origin. */
const MUZZLE = { x: -22, y: -34 };
/** Ms between travelling-bolt positions (about one per frame, so the arrow glides), and how long each art frame is held. */
const BALL_STEP = 20;
const BALL_FRAME_MS = 60;

function isSkillId(id: string): id is SkillId {
  return id in SPECS;
}

/** The pose a ranged skill uses: the worn bow/crossbow's own shot, else the one the skill is recorded for. */
function rangedPose(skill: BakedSkill, weaponAttack: string): string {
  if (weaponAttack.startsWith('shoot')) return weaponAttack;
  return skill.weaponTypes.includes('46') ? 'shoot2' : 'shoot1';
}

export function castPlan(skill: BakedSkill, weaponAttack: string): CastPlan {
  if (!isSkillId(skill.id)) throw new Error(`No cast spec for skill ${skill.id}`);
  const spec = SPECS[skill.id];
  const scale = spec.timeScale ?? 1;
  let anims: string[];
  if (spec.stance === 'combo') {
    const dagger = /O\d$/.test(weaponAttack); // any one-handed pose: the dagger's stab-then-slash
    anims = dagger ? ['stabO1', 'swingO1'] : [weaponAttack, weaponAttack];
  } else {
    anims = [spec.stance === 'ranged' ? rangedPose(skill, weaponAttack) : weaponAttack];
  }
  const poses: PosePhase[] = [];
  // When each pose's blow lands, in cast order.
  const blows: number[] = [];
  for (let round = 0; round < spec.rounds; round++) {
    for (const anim of anims) {
      blows.push(poses.reduce((total, phase) => total + phase.ms, 0) + attackStrikeMs(anim, scale));
      poses.push(...swing(anim, scale));
    }
  }
  const effects: EffectCue[] = [];
  if (spec.self) effects.push({ frames: skill.sequences[spec.self] ?? [], at: 0, x: 0, y: 0 });
  const volley = spec.volley;
  for (let strike = 0; volley && strike < volley.count; strike++) {
    // Strikes spread evenly over the blows; those sharing a blow follow one another by `gap`.
    const blow = Math.floor(strike * blows.length / volley.count);
    const sharing = strike - Math.ceil(blow * volley.count / blows.length);
    const leaves = blows[blow]! + volley.start + sharing * volley.gap;
    const lands = leaves + volley.flight;
    const targetX = volley.range ?? TARGET_X;
    const ball = volley.ball ? skill.sequences[volley.ball] : undefined;
    if (ball?.length) {
      const steps = Math.max(1, Math.round(volley.flight / BALL_STEP));
      for (let step = 0; step < steps; step++) {
        const f = step / steps;
        effects.push({
          frames: [{ ...ball[Math.floor(step * BALL_STEP / BALL_FRAME_MS) % ball.length]!, delay: BALL_STEP }],
          at: leaves + step * BALL_STEP,
          x: MUZZLE.x + (targetX - MUZZLE.x) * f,
          y: MUZZLE.y + (TARGET_Y - MUZZLE.y) * f,
        });
      }
    }
    effects.push({ frames: skill.sequences[volley.hits[strike % volley.hits.length]!] ?? [], at: lands, x: targetX, y: TARGET_Y });
  }
  return {
    poses,
    effects,
    projectiles: [],
    weaponSwipe: spec.weaponSwipe,
    timeScale: scale,
  };
}

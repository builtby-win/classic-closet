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
}

/** Total length: the cast ends once the body and every effect have finished. */
export function planMs(plan: CastPlan): number {
  return Math.max(
    plan.poses.reduce((total, phase) => total + phase.ms, 0),
    ...plan.effects.map((cue) => cue.at + sequenceMs(cue.frames)),
    ...plan.projectiles.map((cue) => cue.at + cue.ms),
  );
}

export const SKILL_IDS = ['4201003', '4001003'] as const;
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

/** Frame counts of the baked attack poses (base.json). */
export const ATTACK_FRAMES: Record<string, number> = {
  swingO1: 3, swingO2: 3, swingO3: 3, stabO1: 2, stabO2: 2,
  swingT1: 3, swingT2: 3, swingT3: 3, stabT1: 3, stabT2: 3, swingP1: 3, swingP2: 3,
  shoot1: 3, shoot2: 5,
};

function swing(anim: string, ms: number): PosePhase[] {
  return Array.from({ length: ATTACK_FRAMES[anim] ?? 3 }, (_, frame) => ({ anim, frame, ms }));
}

/** Where the (unseen) target stands, in pixels left of the origin; sprites face left. */
const TARGET_X = -70;
const TARGET_Y = -32;

/**
 * Cast timelines. The reference data only records which weapon a skill needs,
 * not a usable body timeline (Savage Blow's "savage" pose is not in the base
 * rig), so poses are built from the baked attack poses: dagger skills alternate
 * stab and swing, others repeat the worn weapon's own attack.
 */
export function castPlan(skill: BakedSkill, weaponAttack: string): CastPlan {
  const effect = skill.sequences.effect ?? [];
  if (skill.id === '4201003') {
    const stab = weaponAttack === 'stabO1' || weaponAttack === 'swingO1' ? 'stabO1' : weaponAttack;
    const slash = weaponAttack === 'stabO1' || weaponAttack === 'swingO1' ? 'swingO1' : weaponAttack;
    const round = [...swing(stab, 90), ...swing(slash, 90)];
    const hits = [0, 1, 2, 0, 1, 2];
    return {
      poses: [...round, ...round],
      projectiles: [],
      effects: [
        { frames: effect, at: 0, x: 0, y: 0 },
        ...hits.map((hit, index): EffectCue => ({
          frames: skill.sequences[`hit/${hit}`] ?? [],
          at: 260 + index * 110,
          x: TARGET_X,
          y: TARGET_Y,
        })),
      ],
    };
  }
  // Lucky Seven: a quick throw, two stars fly out one after the other and each lands a hit.
  // The skill's own "effect" art is a fixed glow that reads as a glitch without the star item, so it is not played.
  const hit = skill.sequences['hit/0'] ?? [];
  const star = skill.projectile;
  const flight = 260;
  const throws = [{ at: 130, y: -36 }, { at: 250, y: -30 }];
  return {
    poses: swing(weaponAttack, 90),
    effects: throws.map((t): EffectCue => ({ frames: hit, at: t.at + flight, x: TARGET_X - 20, y: t.y })),
    projectiles: star ? throws.map((t): ProjectileCue => ({
      image: star, at: t.at, ms: flight, from: { x: -16, y: t.y }, to: { x: TARGET_X - 20, y: t.y },
    })) : [],
  };
}

/**
 * Weapon swipes: the client's Character.wz Afterimage sprites (baked by
 * scripts/wz-afterimage). One manifest per swipe set, fetched only when play
 * mode needs it. The swipe color is the "level": 0 is blue, climbing through
 * purple to red at 9, with a larger fiery sprite from 10.
 */

export interface AfterimageSprite {
  image: string;
  ox: number;
  oy: number;
  delay: number;
  a0: number;
  a1: number;
}

export interface AfterimageAction {
  /** Body frame the sprites start on -> sprites played in order from there. */
  frames: Record<string, AfterimageSprite[]>;
}

export interface AfterimageSet {
  set: string;
  levels: Record<string, Record<string, AfterimageAction>>;
}

/** Swipe set per weapon type, from the reference's weapon profiles (`afterImage` in each weapon's info). */
const SET_FOR_WEAPON: Record<string, string> = {
  'One-Handed Sword': 'swordOL',
  'One-Handed Axe': 'swordOL',
  'One-Handed Blunt Weapon': 'mace',
  Dagger: 'swordOS',
  Claw: 'swordOL',
  Wand: 'mace',
  Staff: 'mace',
  'Two-Handed Sword': 'swordTS',
  'Two-Handed Axe': 'axe',
  'Two-Handed Blunt': 'axe',
  Spear: 'spear',
  'Pole Arm': 'poleArm',
  Bow: 'swordTS',
  Crossbow: 'crossBow',
  Cash: 'swordOL',
};

export function afterimageSetFor(sub: string | undefined): string | null {
  return (sub && SET_FOR_WEAPON[sub]) || null;
}

/** Levels the player can pick; null follows the worn weapon's required level. */
export const SWIPE_LEVELS = [
  { name: 'Auto', level: null },
  { name: 'Blue', level: 0 },
  { name: 'Purple', level: 6 },
  { name: 'Red', level: 9 },
  { name: 'Max', level: 10 },
] as const;

/** The client picks the swipe tier from the weapon's required level, one tier per ten levels. */
export function autoSwipeLevel(requiredLevel: number | undefined): number {
  return Math.floor((requiredLevel ?? 0) / 10);
}

/** Dot color matching a level's sprite (blue -> purple -> red -> fire). */
export function swipeDot(level: number): string {
  if (level >= 10) return '#e6894f';
  const t = level / 9;
  const stops: Array<[number, number, number]> = [[111, 150, 255], [200, 110, 255], [255, 95, 110]];
  const [a, b, f] = t < 0.5 ? [stops[0]!, stops[1]!, t * 2] : [stops[1]!, stops[2]!, (t - 0.5) * 2];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * f)).join(',')})`;
}

const sets = new Map<string, Promise<AfterimageSet | null>>();

export function loadAfterimage(set: string): Promise<AfterimageSet | null> {
  let request = sets.get(set);
  if (!request) {
    request = fetch(`/sprites/afterimage/${set}/manifest.json`)
      .then((response) => response.ok ? response.json() as Promise<AfterimageSet> : null)
      .catch(() => null);
    sets.set(set, request);
  }
  return request;
}

/** The sprite sequences for one attack at a level, clamped to the highest level the set has. */
export function swipeActions(set: AfterimageSet, level: number, action: string): AfterimageAction | null {
  const top = Math.max(...Object.keys(set.levels).map(Number).filter(Number.isInteger));
  return set.levels[String(Math.min(level, top))]?.[action] ?? null;
}

export function swipeImageUrls(set: AfterimageSet): string[] {
  const urls = new Set<string>();
  for (const actions of Object.values(set.levels)) {
    for (const action of Object.values(actions)) {
      for (const sprites of Object.values(action.frames)) sprites.forEach((sprite) => urls.add(`/sprites/afterimage/${set.set}/${sprite.image}`));
    }
  }
  return [...urls];
}

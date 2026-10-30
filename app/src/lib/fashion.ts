import catalogData from '../data/catalog.json';
import { attainableNow, dropInfo } from './drops';
// Shared domain model for the fashion customizer.
// Rendering is 100% remote (maplestory.io); this lib builds URLs + filters the baked catalog.

export const API = 'https://maplestory.io/api/MCW/CBT2';
export const REGION = 'MCW';
export const VERSION = 'CBT2';

export interface BannerMeta {
  id: string;
  label: string;
  start: string | null;
  end: string | null;
  startAt?: string;
  endAt?: string;
  note?: string;
  post?: string;
  rates?: string;
}


export interface HairStyleMeta {
  name: string;
  sex: 'm' | 'f';
  bannerId: string;
  attainable: boolean;
  rate?: string;
  src?: 'OSMS' | 'GMS' | 'MCW' | 'MCW1';
  history?: string[];
  coupon?: 'mystery' | 'signature';
}

export interface ItemMeta {
  name: string;
  sub: string;
  requiredJobs?: string[];
  requiredLevel?: number;
  sex: 'm' | 'f' | 'u';
  bannerId: string;
  attainable: boolean;
  group?: string;
  rate?: string;
  src?: 'OSMS' | 'GMS' | 'MCW' | 'MCW1';
  history?: string[];
  coupon?: 'mystery' | 'signature';
  /** Cash weapon skins that ship frames for a single weapon family only
   *  (Plastic Slingshot → Bow, Toy Rifle → Crossbow); baked by bake-sprites. */
  wsub?: string;
  /** Cash weapon skins that ship different art per wieldable weapon type: sub → variant file code
   *  (`/sprites/items/<id>.w<code>.json`; 0 = the skin's base art). Only set when there are 2+ types. */
  wtypes?: Record<string, number>;
}

export interface SearchEntry {
  id: number;
  name: string;
  sub: string;
  sex: 'm' | 'f' | 'u';
  isStyle?: boolean;
}

export interface FastCatalog {
  banners: Record<string, BannerMeta>;
  styles: Record<number, HairStyleMeta>;
  items: Record<number, ItemMeta>;
  indexes: {
    hairs: {
      m: { active: number[]; past: number[]; unreleased: number[] };
      f: { active: number[]; past: number[]; unreleased: number[] };
    };
    faces: {
      m: { active: number[]; past: number[]; unreleased: number[] };
      f: { active: number[]; past: number[]; unreleased: number[] };
    };
    groups: Record<string, {
      m: number[];
      f: number[];
      u: number[];
    }>;
    search: SearchEntry[];
  };
}

export type Sex = 'm' | 'f';

export type SectionId =
  | 'Hair'
  | 'HairClassic'
  | 'HairPast'
  | 'HairSignature'
  | 'Face'
  | 'FaceClassic'
  | 'FacePast'
  | 'FaceSignature'
  | 'founder-crate'
  | 'mystery-crate'
  | 'halloween-crate'
  | 'aurora-crate'
  | 'cover-10day'
  | 'Shield' | 'Hat' | 'Top' | 'Bottom' | 'Overall' | 'Shoes' | 'Glove' | 'Weapon' | 'Cape' | 'Accessories';

// Static lookup: weapon subcategory names
const WEAPON_SUBS: Record<string, true> = {
  Cash: true,
  'One-Handed Blunt Weapon': true,
  Claw: true,
  Dagger: true,
  'One-Handed Sword': true,
  'One-Handed Axe': true,
  Wand: true,
  'Two-Handed Sword': true,
  Bow: true,
  'Two-Handed Axe': true,
  'Two-Handed Blunt': true,
  'Pole Arm': true,
  Crossbow: true,
  Spear: true,
  Staff: true,
  Katara: true,
  Knuckle: true,
  Gun: true,
  'Dual Bowguns': true,
  'Hand Cannon': true,
  'Shining Rod': true,
  'Psy-limiter': true,
  Chain: true,
  Gauntlet: true,
  Cane: true,
  'Ritual Fan': true,
};

/** Idle/walk stance whose renderer frames draw each weapon family correctly.
 *  Verified against maplestory.io item frameBooks: 1H weapons have stand1/walk1
 *  only; 2H melee, spears, polearms and crossbows have stand2 (no stand1);
 *  bows use the regular stand1 idle stance.
 */
const WEAPON_STANCE: Record<string, { stand: string; walk: string; attack: string; attacks: string[] }> = {
  'One-Handed Sword': { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  'One-Handed Axe': { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  'One-Handed Blunt Weapon': { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  Dagger: { stand: 'stand1', walk: 'walk1', attack: 'stabO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  Claw: { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3'] },
  Wand: { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  Staff: { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
  'Two-Handed Sword': { stand: 'stand2', walk: 'walk1', attack: 'swingT1', attacks: ['swingT1', 'swingT2', 'swingT3', 'stabO1', 'stabO2'] },
  'Two-Handed Axe': { stand: 'stand2', walk: 'walk2', attack: 'swingT1', attacks: ['swingT1', 'swingT2', 'swingT3', 'stabO1', 'stabO2'] },
  'Two-Handed Blunt': { stand: 'stand2', walk: 'walk2', attack: 'swingT1', attacks: ['swingT1', 'swingT2', 'swingT3', 'stabO1', 'stabO2'] },
  Spear: { stand: 'stand2', walk: 'walk2', attack: 'stabT1', attacks: ['swingT2', 'swingP1', 'swingP2', 'stabT1', 'stabT2'] },
  'Pole Arm': { stand: 'stand2', walk: 'walk2', attack: 'swingP1', attacks: ['swingT2', 'swingP1', 'swingP2', 'stabT1', 'stabT2'] },
  Crossbow: { stand: 'stand2', walk: 'walk2', attack: 'shoot2', attacks: ['shoot2'] },
  Bow: { stand: 'stand1', walk: 'walk1', attack: 'shoot1', attacks: ['shoot1'] },
  // NX cash weapons only ship stand1 frames (all four baked items include
  // them), so equipping one from a 2H stance steers back to stand1.
  Cash: { stand: 'stand1', walk: 'walk1', attack: 'swingO1', attacks: ['swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2'] },
};

const ALL_ATTACKS = new Set(Object.values(WEAPON_STANCE).flatMap((m) => m.attacks));

/** Short weapon-family name shown in attack pose labels; Cash (unknown family) and bare hands get none. */
const WEAPON_NOUN: Record<string, string> = {
  'One-Handed Sword': 'sword', 'One-Handed Axe': 'axe', 'One-Handed Blunt Weapon': 'blunt', Dagger: 'dagger', Claw: 'claw', Wand: 'wand', Staff: 'staff',
  'Two-Handed Sword': '2H sword', 'Two-Handed Axe': '2H axe', 'Two-Handed Blunt': '2H blunt', Spear: 'spear', 'Pole Arm': 'polearm', Crossbow: 'crossbow', Bow: 'bow',
};

/** Pose picker entries for the worn weapon: one "Standing" that resolves to its stance, plus only the attacks it has. */
export function weaponPoses(sub: string | undefined): { anim: string; label: string }[] {
  const { stand, attacks } = weaponMotion(sub);
  const seen: Record<string, number> = {};
  const attackPoses = attacks.map((anim) => {
    const verb = anim.startsWith('stab') ? 'Stab' : anim.startsWith('shoot') ? 'Shoot' : 'Swing';
    const n = (seen[verb] = (seen[verb] ?? 0) + 1);
    const noun = sub && WEAPON_NOUN[sub];
    const base = noun ? `${verb} ${noun}` : verb;
    return { anim, label: verb === 'Shoot' ? base : `${base} ${n}` };
  });
  return [{ anim: stand, label: 'Standing' }, { anim: 'alert', label: 'Alert' }, { anim: 'jump', label: 'Jumping' }, ...attackPoses];
}

/** Weapon family that decides stance, motions and hand usage: the weapon type a cash
 *  skin is wielded as (`wield`, when the skin ships art for it), else a skin that only
 *  fits one type behaves as that type, else its own sub. */
export function weaponSubOf(item: { sub: string; wsub?: string; wtypes?: Record<string, number> } | undefined, wield?: string): string | undefined {
  if (!item) return undefined;
  return wield && item.wtypes && Object.hasOwn(item.wtypes, wield) ? wield : item.wsub ?? item.sub;
}

/** Variant art file for the worn weapon (`<id>.w<code>.json`), or 0 for the item's base art. */
export function weaponVariant(item: { sub: string; wsub?: string; wtypes?: Record<string, number> } | undefined, wield?: string): number {
  const sub = weaponSubOf(item, wield);
  return sub && item?.wtypes && Object.hasOwn(item.wtypes, sub) ? item.wtypes[sub]! : 0;
}

/** Weapon types a cash skin can be wielded as; empty when it has no choice. */
export function wieldOptions(item: { wtypes?: Record<string, number> } | undefined): string[] {
  return item?.wtypes ? Object.keys(item.wtypes) : [];
}

/** Compact chip label for a wield type. */
const WIELD_LABELS: Record<string, string> = {
  'One-Handed Sword': '1H Sword', 'One-Handed Axe': '1H Axe', 'One-Handed Blunt Weapon': '1H Blunt',
  'Two-Handed Sword': '2H Sword', 'Two-Handed Axe': '2H Axe', 'Two-Handed Blunt': '2H Blunt', 'Pole Arm': 'Polearm',
};
export const wieldLabel = (sub: string): string => WIELD_LABELS[sub] ?? sub;

/** The option a wield picker shows: the active type, or for a skin still on its generic base art, the first type sharing that art. */
export function wieldChoice(item: { sub: string; wsub?: string; wtypes?: Record<string, number> } | undefined, wield?: string): string {
  const options = wieldOptions(item);
  const sub = weaponSubOf(item, wield);
  return (sub && options.includes(sub) ? sub : options.find((option) => item?.wtypes?.[option] === 0) ?? options[0]) ?? '';
}

/** All one-handed types share a stance and hand use, so swapping between them is never worth a prompt. */
const isOneHanded = (sub: string): boolean => sub.startsWith('One-Handed') || sub === 'Dagger' || sub === 'Wand' || sub === 'Staff';

/** The one-handed type a worn multi-type skin can drop to when `wield` is two-handed, so a shield can join it
 *  without replacing the skin; undefined when it isn't wielded two-handed or has no one-handed art. */
export function oneHandedWield(item: { sub: string; wsub?: string; wtypes?: Record<string, number> } | undefined, wield?: string): string | undefined {
  const sub = weaponSubOf(item, wield);
  if (!sub || !TWO_HAND_SUBS[sub]) return undefined;
  const options = wieldOptions(item).filter((option) => isOneHanded(option));
  const own = weaponSubOf(item);
  return own && options.includes(own) ? own : options[0];
}

/** What wearing `picked` does to the wield type. A cash skin keeps the type the player was
 *  already wielding when it ships art for it; otherwise it takes its default type and `notice`
 *  says which types it does fit, so the player can pick another. */
export function resolveWield(
  held: { sub: string; wsub?: string; wtypes?: Record<string, number> } | undefined,
  heldWield: string | undefined,
  picked: { sub: string; wsub?: string; wtypes?: Record<string, number> },
): { wield?: string; notice?: { types: string[]; applied: string; held: string } } {
  const heldType = weaponSubOf(held, heldWield);
  if (picked.wtypes && heldType && Object.hasOwn(picked.wtypes, heldType)) return { wield: heldType };
  const applied = weaponSubOf(picked);
  if (picked.sub !== 'Cash' || !heldType || heldType === 'Cash' || !applied || applied === 'Cash' || applied === heldType) return {};
  if (isOneHanded(heldType) && isOneHanded(applied)) return {};
  return { notice: { types: picked.wtypes ? Object.keys(picked.wtypes) : [applied], applied, held: heldType } };
}

/** Poses play mode uses for the worn weapon (`attack` is the signature one, `attacks` the baked variants a plain attack picks from); bare hands swing like a 1H weapon. */
export function weaponMotion(sub: string | undefined): { stand: string; walk: string; attack: string; attacks: string[] } {
  return (sub && WEAPON_STANCE[sub]) || WEAPON_STANCE['One-Handed Sword']!;
}

/** Subs that occupy both hands: wearing one drops the shield, and tapping a
 *  shield while one is worn swaps to a one-handed weapon instead of refusing.
 *  Claw claims WpSi in the renderer data (garnier vslot) so it counts too. */
export const TWO_HAND_SUBS: Record<string, true> = {
  'Two-Handed Sword': true,
  'Two-Handed Axe': true,
  'Two-Handed Blunt': true,
  Spear: true,
  'Pole Arm': true,
  Crossbow: true,
  Bow: true,
  Claw: true,
};

/**
 * Idle stance that draws this weapon correctly, or null to keep current anim.
 * Only stand/walk poses are steered (they are per-weapon stances); action poses
 * carry their own weapon frames. Unknown subs keep stance.
 */
export function stanceForWeapon(sub: string | undefined, currentAnim: string): { anim: string; frame: number } | null {
  if (!sub) return null;
  const want = WEAPON_STANCE[sub];
  if (!want) return null;
  // An attack pose the new weapon doesn't have (e.g. a bow's shoot1 kept after swapping to a sword).
  if (ALL_ATTACKS.has(currentAnim) && !want.attacks.includes(currentAnim)) return { anim: want.stand, frame: 0 };
  if ((currentAnim === 'stand1' || currentAnim === 'stand2') && currentAnim !== want.stand) {
    return { anim: want.stand, frame: 0 };
  }
  if ((currentAnim === 'walk1' || currentAnim === 'walk2') && currentAnim !== want.walk) {
    return { anim: want.walk, frame: 0 };
  }
  return null;
}

/** Banner/group sort for equip drawers: limited NX first (by urgency), classic last.
 *  Founder's crate ends Oct 28 → Halloween/Mystery crates end Nov 4 → covers end Nov 18 → Aurora stamp ends Jan 13. */
export const GROUP_RANK: Record<string, number> = {
  'founder-crate': 0,
  'halloween-crate': 1,
  'mystery-crate': 2,
  'cover-10day': 3,
  'aurora-crate': 4,
  'style-coupon': 5,
  'classic-equips': 6,
};

export function bannerRank(item: ItemMeta | HairStyleMeta | undefined): number {
  if (!item) return 99;
  const group = (item as ItemMeta).group;
  if (group && group in GROUP_RANK) return GROUP_RANK[group]!;
  return 6;
}

/** Short group tag for badges */
export const GROUP_SHORT: Record<string, string> = {
  'founder-crate': 'Founder',
  'mystery-crate': 'Mystery',
  'halloween-crate': 'Halloween',
  'aurora-crate': 'Aurora',
  'style-coupon': 'Style',
  'cover-10day': '10-Day',
  'classic-equips': 'Job Equips',
  'past-rotation': 'Past',
};

/** Which equip slot an item occupies (for wearing). Group sections bypass this. */
export function equipSlot(sub: string): string {
  if (WEAPON_SUBS[sub]) return 'Weapon';
  if (sub === 'Face Accessory') return 'FaceAcc';
  if (sub === 'Eye Decoration') return 'EyeDec';
  if (sub === 'Earrings' || sub === 'Ring') return 'Earring';
  return sub;
}

/** Hair style id = floor(id/10); color variant = id%10. Style base name strips the color prefix. */
export const HAIR_COLORS = ['Black', 'Red', 'Orange', 'Blonde', 'Green', 'Blue', 'Purple', 'Brown'] as const;
export const EYE_COLORS = ['Black', 'Blue', 'Red', 'Green', 'Brown', 'Cyan', 'Purple', 'Dark red', 'White'] as const;

export function faceStyleId(faceId: number): number {
  return faceId % 100;
}

export function faceColorIndex(faceId: number): number {
  return Math.floor(faceId / 100) % 10;
}

export function faceVariantId(sex: Sex, styleId: number, color: number): number {
  return (sex === 'f' ? 21000 : 20000) + color * 100 + styleId;
}

export function hairBaseName(name: string): string {
  for (const c of HAIR_COLORS) {
    if (name.startsWith(c + ' ')) return name.slice(c.length + 1);
  }
  return name;
}

export interface Look {
  name: string;
  sex: Sex;
  skin: number;
  hair: number;
  hairCol: number;
  face: number;
  anim: string;
  frame: number;
  items: Partial<Record<string, number>>;
  /** Weapon type a multi-type cash weapon skin is wielded as; only meaningful when the worn weapon lists it in `wtypes`. */
  wield?: string;
  /** Face expression (an `EMOTES` id) shown instead of the default face. */
  emote?: string;
  /** Render-only: which frame of a multi-frame emote to draw. Never saved or encoded. */
  emoteFrame?: number;
}

export interface Emote {
  id: string;
  label: string;
  /** Hotkey in the Classic client; absent for emotes the client does not ship yet. */
  key?: string;
}

/** Face expressions baked per face. The first seven are the F1–F7 hotkeys; the rest are not in Classic yet. */
export const EMOTES: Emote[] = [
  { id: 'hit', label: 'Hit', key: 'F1' },
  { id: 'smile', label: 'Smile', key: 'F2' },
  { id: 'troubled', label: 'Troubled', key: 'F3' },
  { id: 'cry', label: 'Cry', key: 'F4' },
  { id: 'angry', label: 'Angry', key: 'F5' },
  { id: 'bewildered', label: 'Bewildered', key: 'F6' },
  { id: 'stunned', label: 'Stunned', key: 'F7' },
  { id: 'blaze', label: 'Blaze' },
  { id: 'bowing', label: 'Bowing' },
  { id: 'cheers', label: 'Cheers' },
  { id: 'chu', label: 'Chu' },
  { id: 'dam', label: 'Dam' },
  { id: 'despair', label: 'Despair' },
  { id: 'glitter', label: 'Glitter' },
  { id: 'hot', label: 'Hot' },
  { id: 'hum', label: 'Hum' },
  { id: 'love', label: 'Love' },
  { id: 'oops', label: 'Oops' },
  { id: 'pain', label: 'Pain' },
  { id: 'qBlue', label: 'Blue Question' },
  { id: 'shine', label: 'Shine' },
  { id: 'vomit', label: 'Vomit' },
  { id: 'wink', label: 'Wink' },
];

export function isEmote(id: string | undefined): id is string {
  return id != null && EMOTES.some((emote) => emote.id === id);
}

export const DEFAULT_LOOK: Look = {
  name: '',
  sex: 'm',
  skin: 2000,
  hair: 30130, // Antagonist (Black)
  hairCol: 0,
  face: 20033, // Innocent Gaze
  anim: 'stand1',
  frame: 0,
  items: { Hat: 1002000, Top: 1040002, Bottom: 1060002, Shoes: 1072000, Glove: 1082000, Weapon: 1302000 },
};

/** Character render URL */
export const GMS_API = 'https://maplestory.io/api/GMS/270';

export const CATALOG = catalogData as FastCatalog;

export const RANDOM_EQUIP_SLOTS = ['Hat', 'Top', 'Bottom', 'Shoes', 'Glove', 'Cape', 'Weapon'] as const;
export type RandomEquipSlot = typeof RANDOM_EQUIP_SLOTS[number];

export function randomClassicWeapon(sex: Sex, job: string, random: () => number = Math.random): number | undefined {
  const group = CATALOG.indexes.groups['classic-equips'];
  const weapons = [...group.u, ...group[sex]].filter(id => {
    const item = CATALOG.items[id];
    if (!item?.attainable || equipSlot(item.sub) !== 'Weapon') return false;
    const jobs = item.requiredJobs ?? [];
    return jobs.includes('Beginner') || jobs.includes(job);
  });
  return weapons.length ? weapons[Math.floor(random() * weapons.length)] : undefined;
}

/** Randomize a complete outfit using current, sex-compatible catalog items. */
export function randomLook(sex: Sex, random: () => number = Math.random, excludedSlots: readonly RandomEquipSlot[] = [], nxOnly = false, job = 'Beginner'): Look {
  const pick = <T,>(values: T[]): T => values[Math.floor(random() * values.length)];
  const group = CATALOG.indexes.groups['classic-equips'];
  const candidates = (nxOnly
    ? [
        ...Object.entries(CATALOG.indexes.groups).filter(([key]) => key !== 'classic-equips').flatMap(([, g]) => [...g.u, ...g[sex]]),
        ...group.u.concat(group[sex]).filter(id => equipSlot(CATALOG.items[id]?.sub ?? '') === 'Weapon'),
      ]
    : [...group.u, ...group[sex]]).filter(id => CATALOG.items[id]?.attainable);
  const items: Look['items'] = {};
  for (const slot of RANDOM_EQUIP_SLOTS) {
    if (excludedSlots.includes(slot)) continue;
    const ids = candidates.filter(id => {
      const item = CATALOG.items[id];
      if (equipSlot(item.sub) !== slot) return false;
      if (slot !== 'Weapon' || item.group !== 'classic-equips' || job === 'All') return true;
      const jobs = item.requiredJobs ?? [];
      return jobs.includes('Beginner') || jobs.includes(job);
    });
    if (!ids.length) {
      if (nxOnly) continue;
      throw new Error(`No compatible items for ${sex} ${slot}`);
    }
    items[slot] = pick(ids);
  }
  const hairCol = Math.floor(random() * HAIR_COLORS.length);
  const hair = pick(CATALOG.indexes.hairs[sex].active) * 10 + hairCol;
  const faceStyle = faceStyleId(pick(CATALOG.indexes.faces[sex].active));
  const eyeColor = Math.floor(random() * EYE_COLORS.length);
  const stance = stanceForWeapon(
    items.Weapon != null ? weaponSubOf(CATALOG.items[items.Weapon]) : undefined,
    DEFAULT_LOOK.anim,
  );
  return {
    ...DEFAULT_LOOK, sex, items, hairCol,
    hair,
    face: faceVariantId(sex, faceStyle, eyeColor),
    ...(stance ? { anim: stance.anim, frame: stance.frame } : null),
  };
}

type BannerKind = 'hair' | 'face';

function bannerStyleOf(kind: BannerKind, id: number): number {
  return kind === 'hair' ? id : faceStyleId(id);
}

function bannerCouponOf(kind: BannerKind, id: number): 'mystery' | 'signature' | undefined {
  return kind === 'hair' ? CATALOG.styles[id]?.coupon : CATALOG.items[id]?.coupon;
}

function bannerAttainable(kind: BannerKind, id: number): boolean {
  return kind === 'hair' ? !!CATALOG.styles[id]?.attainable : !!CATALOG.items[id]?.attainable;
}

/** Live banner lineup for a sex (unique styles, catalog order), optionally one coupon tier. */
function bannerLineup(sex: Sex, kind: BannerKind, coupon?: 'mystery' | 'signature'): number[] {
  const ids = (kind === 'hair' ? CATALOG.indexes.hairs[sex].active : CATALOG.indexes.faces[sex].active)
    .filter((id) => bannerAttainable(kind, id));
  const pool = coupon ? ids.filter((id) => bannerCouponOf(kind, id) === coupon) : ids;
  const source = pool.length ? pool : ids;
  const seen = new Set<number>();
  const styles: number[] = [];
  for (const id of source) {
    const style = bannerStyleOf(kind, id);
    if (!seen.has(style)) { seen.add(style); styles.push(style); }
  }
  return styles;
}

/**
 * First style of the live banner lineup: mystery tier first (the gacha hype),
 * else the first active style. Fresh defaults follow the rotation this way
 * instead of going stale.
 */
export function firstBannerStyle(sex: Sex, kind: BannerKind): number {
  const mystery = bannerLineup(sex, kind, 'mystery');
  if (mystery.length) return mystery[0]!;
  return bannerLineup(sex, kind)[0] ?? (kind === 'hair' ? (sex === 'f' ? 3101 : 3013) : (sex === 'f' ? 3 : 33));
}

/**
 * Mirror a hair/face style across genders within the live rotation: same
 * coupon tier, same slot in that tier's lineup. Toggling ♂/♀ lands on the
 * equivalent hype style, and every pick is attainable by construction.
 */
export function mirrorStyleForSex(kind: BannerKind, fromSex: Sex, toSex: Sex, fromStyle: number): number {
  const fromIds = kind === 'hair' ? CATALOG.indexes.hairs[fromSex].active : CATALOG.indexes.faces[fromSex].active;
  const coupon = bannerCouponOf(kind, fromIds.find((id) => bannerStyleOf(kind, id) === fromStyle) ?? -1);
  const fromLineup = bannerLineup(fromSex, kind, coupon);
  const index = fromLineup.indexOf(fromStyle);
  const toLineup = bannerLineup(toSex, kind, coupon);
  if (!toLineup.length) return fromStyle;
  return toLineup[(index >= 0 ? index : 0) % toLineup.length]!;
}

// Iconic fresh defaults while they are still in rotation (Antagonist,
// Innocent Gaze, Veronica, Strong Stare); banner lead once they rotate out.
const CURATED_HAIR_STYLE: Record<Sex, number> = { m: 3013, f: 3101 };
const CURATED_FACE_ID: Record<Sex, number> = { m: 20033, f: 21803 };

/** Fresh hair id for a sex: curated pick while attainable, else the banner lead. */
export function defaultHairForSex(sex: Sex, hairCol = 0): number {
  const curated = CURATED_HAIR_STYLE[sex];
  const style = CATALOG.styles[curated]?.attainable ? curated : firstBannerStyle(sex, 'hair');
  return style * 10 + hairCol;
}

/** Fresh face id for a sex: curated pick while attainable, else the banner lead. */
export function defaultFaceForSex(sex: Sex, eyeColor = 0): number {
  const curated = CURATED_FACE_ID[sex];
  if (CATALOG.items[curated]?.attainable) return curated;
  return faceVariantId(sex, firstBannerStyle(sex, 'face'), eyeColor);
}

/** Resolve each asset independently; same-number equips are not interchangeable. */
export function assetSource(itemId: number): { region: string; version: string } {
  const meta = getItem(CATALOG, itemId);
  const isGmsCosmetic = meta?.src === 'GMS'
    || (meta?.src === 'OSMS' && (meta.sub === 'Hair' || meta.sub === 'Face'));
  if (meta?.src === 'MCW1') return { region: 'MCW', version: '1' };
  return isGmsCosmetic
    ? { region: 'GMS', version: '270' }
    : { region: REGION, version: VERSION };
}

export function renderURL(look: Look): string {
  // The Avatar endpoint requires both body and head, unlike the legacy Character endpoint.
  const ids = [look.skin, look.skin + 10000, look.face, look.hair, ...Object.values(look.items)];
  const entries = ids.filter((id): id is number => id != null).map(itemId => ({
    itemId,
    ...assetSource(itemId),
  }));
  const items = encodeURIComponent(entries.map(entry => JSON.stringify(entry)).join(','));
  return `https://maplestory.io/api/character/${items}/${encodeURIComponent(look.anim)}/${look.frame}?showears=false&showLefEars=false&showHighLefEars=false&resize=1&flipX=false&renderMode=0&padX=30&padY=50`;
}

/** Item icons use the same source as the character renderer. */
export function iconURL(itemId: number): string {
  const meta = getItem(CATALOG, itemId);
  if ((meta?.src === 'OSMS' || meta?.src === 'MCW1') && meta.sub === 'Face') {
    const faceBase = itemId >= 21000 ? 21000 : 20000;
    return `/sprites/faces/${faceBase + faceStyleId(itemId)}.png`;
  }
  const { region, version } = assetSource(itemId);
  return `https://maplestory.io/api/${region}/${version}/item/${itemId}/icon`;
}

const ICON_SOURCES = ['MCW/CBT2', 'GMS/270', 'GMS/255'];

/** Next icon URL to try when a maplestory.io icon 404s (not every region/version
 *  ships every icon, e.g. GMS 270 lacks the Aurora cash scepters), or null. */
export function iconFallbackURL(url: string): string | null {
  const match = /\/api\/(\w+\/\w+)\/item\//.exec(url);
  // MCW/1 icons are MCW1-only cosmetics: other sources hold different items at the same id.
  if (match?.[1] === 'MCW/1') return null;
  const next = match ? ICON_SOURCES[ICON_SOURCES.indexOf(match[1]!) + 1] : undefined;
  return match && next ? url.replace(match[1]!, next) : null;
}

/** Apply an equip pick with Overall ↔ Top/Bottom and 2H-weapon ↔ Shield exclusion.
 *  Needs the picked item's sub (not just the slot): a two-handed weapon drops the
 *  shield, and tapping a shield while a two-handed weapon is worn swaps to a
 *  one-handed weapon (classic behavior: shields need a free hand).
 */
export function applyPick(items: Look['items'], slot: string, id: number | null, sub?: string, wield?: string): Look['items'] {
  const next = { ...items };
  if (slot === 'Overall' && id) {
    delete next.Top;
    delete next.Bottom;
  }
  if ((slot === 'Top' || slot === 'Bottom') && id) {
    delete next.Overall;
  }
  const pickSub = slot === 'Weapon' && id ? weaponSubOf(CATALOG.items[id], wield) ?? sub : sub;
  if (slot === 'Weapon' && id && pickSub && TWO_HAND_SUBS[pickSub]) {
    delete next.Shield;
  }
  if (slot === 'Shield' && id) {
    const weaponSub = weaponSubOf(CATALOG.items[next.Weapon ?? -1], wield);
    if (weaponSub && TWO_HAND_SUBS[weaponSub]) {
      // Swap to a one-handed weapon so the shield has a free hand: prefer the
      // starter Sword, else the first 1H classic-equip in the catalog.
      const fallback = CATALOG.items[1302000]?.sub && !TWO_HAND_SUBS[CATALOG.items[1302000].sub]
        ? 1302000
        : Number(Object.keys(CATALOG.items).find((key) => {
          const item = CATALOG.items[Number(key)];
          return item?.group === 'classic-equips' && WEAPON_SUBS[item.sub] && !TWO_HAND_SUBS[item.sub];
        }));
      if (fallback) next.Weapon = fallback;
      else delete next.Weapon;
    }
  }
  if (id) next[slot] = id;
  else delete next[slot];
  return next;
}

function fromBase64(b64: string): string {
  let normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  if (typeof atob !== 'undefined') return atob(normalized);
  if (typeof Buffer !== 'undefined') return Buffer.from(normalized, 'base64').toString('utf8');
  return '';
}

export const NAME_MAX = 12;
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

/** Encode the look into readable query params. */
export function encodeLook(look: Look): string {
  const params = new URLSearchParams();
  if (look.name) params.set('name', look.name);
  params.set('sex', look.sex);
  params.set('skin', String(look.skin));
  params.set('hair', String(look.hair));
  params.set('hairCol', String(look.hairCol));
  params.set('face', String(look.face));
  params.set('anim', look.anim);
  params.set('frame', String(look.frame));
  if (isEmote(look.emote)) params.set('emote', look.emote);
  if (look.wield && look.items.Weapon != null && Object.hasOwn(CATALOG.items[look.items.Weapon]?.wtypes ?? {}, look.wield)) params.set('wield', look.wield);
  for (const [slot, id] of Object.entries(look.items)) {
    params.set(slot, String(id));
  }
  return params.toString();
}

/**
 * Decode a look from query parameter, search string, URL hash, or raw base64.
 */
export function decodeLook(input?: string): Partial<Look> | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If input contains query string
  if (trimmed.includes('?') || trimmed.includes('&') || trimmed.includes('=')) {
    const search = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
    const params = new URLSearchParams(search);
    const lookParam = params.get('look');
    if (lookParam) {
      const decoded = decodeLook(lookParam);
      if (decoded) return decoded;
    }
    // Check individual params fallback
    if (params.has('hair') || params.has('face') || params.has('sex')) {
      const partial: Partial<Look> = {};
      if (params.has('name')) partial.name = cleanName(params.get('name') ?? '');
      if (params.has('sex')) partial.sex = params.get('sex') === 'f' ? 'f' : 'm';
      if (params.has('skin')) partial.skin = Number(params.get('skin')) || 2000;
      if (params.has('hair')) partial.hair = Number(params.get('hair')) || 30130;
      if (params.has('hairCol')) partial.hairCol = Number(params.get('hairCol')) || 0;
      if (params.has('face')) partial.face = Number(params.get('face')) || 20805;
      if (params.has('anim')) partial.anim = params.get('anim') || 'stand1';
      if (params.has('frame')) partial.frame = Number(params.get('frame')) || 0;
      if (params.has('wield')) partial.wield = params.get('wield') ?? undefined;
      const emote = params.get('emote') ?? undefined;
      if (isEmote(emote)) partial.emote = emote;
      // Equip slots (Hat, Top, Bottom, Overall, Shoes, Weapon, …) round-trip as
      // their own params — anything else here is an equip id.
      const KNOWN: Record<string, true> = { name: true, sex: true, skin: true, hair: true, hairCol: true, face: true, anim: true, frame: true, wield: true, emote: true, look: true };
      const items: Partial<Record<string, number>> = {};
      for (const [k, v] of params) {
        if (KNOWN[k]) continue;
        const id = Number(v);
        if (Number.isInteger(id) && id > 0) items[k] = id;
      }
      if (Object.keys(items).length) partial.items = items;
      return partial;
    }
  }

  // If input is URL hash (#...)
  const cleaned = trimmed.replace(/^[#?]/, '').replace(/^look=/, '');
  try {
    const json = fromBase64(cleaned);
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed as Partial<Look>;
  } catch {
    // ignore parse error
  }
  return null;
}

export const STORAGE_LOOK_KEY = 'mf-look';
export const STORAGE_SEX_KEY = 'mf-sex';

/** Per-sex storage key: each gender keeps its own saved character. */
export function storageKeyForSex(sex: Sex): string {
  return `${STORAGE_LOOK_KEY}-${sex}`;
}

export function saveLookToStorage(look: Look): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKeyForSex(look.sex), JSON.stringify(look));
      localStorage.setItem(STORAGE_SEX_KEY, look.sex);
      // Drop the pre-per-sex single slot so it can't shadow the sex slots.
      localStorage.removeItem(STORAGE_LOOK_KEY);
    }
  } catch {
    // ignore
  }
}

/** Saved character for one gender, with fallback to the pre-per-sex single slot. */
export function loadLookForSex(sex: Sex): Partial<Look> | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storageKeyForSex(sex));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Partial<Look>;
      }
      const legacy = localStorage.getItem(STORAGE_LOOK_KEY);
      if (legacy) {
        const parsed: unknown = JSON.parse(legacy);
        if (parsed && typeof parsed === 'object') {
          const look = parsed as Partial<Look>;
          if ((look.sex as Sex) === sex) return look;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function loadLookFromStorage(): Partial<Look> | null {
  try {
    if (typeof localStorage !== 'undefined') {
      for (const sex of ['m', 'f'] as Sex[]) {
        const raw = localStorage.getItem(storageKeyForSex(sex));
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed as Partial<Look>;
        }
      }
      const raw = localStorage.getItem(STORAGE_LOOK_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Partial<Look>;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** True once any character (either gender, current or legacy slot) is saved. */
export function hasStoredLook(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(STORAGE_SEX_KEY)) return true;
      if (loadLookFromStorage()) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Item resolved through color virtualization (hair styles expand to per-color ids). */
export interface ResolvedItem extends ItemMeta {
  id: number;
  style?: number;
}

/** Unified O(1) item lookup with color virtualization */
export function getItem(
  catalog: FastCatalog,
  id: number | null | undefined,
): ResolvedItem | undefined {
  if (id == null) return undefined;
  // Hair items in MapleStory (30000..49999) virtualize colors from base style
  if (id >= 30000 && id < 50000) {
    const style = Math.floor(id / 10);
    const styleMeta = catalog.styles[style];
    if (styleMeta) {
      return {
        id,
        style,
        name: styleMeta.name,
        sub: 'Hair',
        sex: styleMeta.sex,
        bannerId: styleMeta.bannerId,
        attainable: styleMeta.attainable,
        group: styleMeta.bannerId ? 'style-coupon' : undefined,
        rate: styleMeta.rate,
        src: styleMeta.src,
        history: styleMeta.history,
        coupon: styleMeta.coupon,
      };
    }
  }
  // Face color is the hundreds digit; preserve the style suffix across colors.
  if (id >= 20000 && id < 22000) {
    const faceStyle = faceStyleId(id);
    const faceBase = id >= 21000 ? 21000 : 20000;
    for (let color = 0; color <= 8; color++) {
      const variant = catalog.items[faceBase + color * 100 + faceStyle];
      if (variant?.sub === 'Face') return { id, ...variant };
    }
  }
  const item = catalog.items[id];
  if (item) {
    return { id, ...item };
  }
  return undefined;
}

/** O(1) style lookup */
export function getStyle(catalog: FastCatalog, styleId: number | null | undefined): HairStyleMeta | undefined {
  if (styleId == null) return undefined;
  return catalog.styles[styleId];
}

/** O(1) banner lookup */
export function getBanner(catalog: FastCatalog, bannerId?: string): BannerMeta | undefined {
  if (!bannerId) return undefined;
  return catalog.banners[bannerId];
}

/** Formats attainability note in O(1) time */
export function formatAttainableInfo(
  catalog: FastCatalog,
  itemId: number | null | undefined,
  now: number = Date.now(),
): {
  isAttainable: boolean;
  statusText: string;
  dateRangeText?: string;
  bannerLabel?: string;
} {
  const item = getItem(catalog, itemId);
  if (!item) {
    return { isAttainable: true, statusText: 'Active' };
  }
  if (item.group === 'classic-equips') {
    return { isAttainable: true, statusText: 'Non-NX equip' };
  }
  if (item.bannerId === 'unreleased') {
    return { isAttainable: false, statusText: 'Not released yet', bannerLabel: 'Not released yet' };
  }
  const banner = getBanner(catalog, item.bannerId);
  if (attainableNow(item.attainable, banner, now)) {
    const end = banner?.end;
    const upcoming = !!banner && dropInfo(banner, now).state === 'upcoming';
    return {
      isAttainable: true,
      statusText: upcoming && banner?.start ? `Starts ${banner.start.slice(5)}` : end ? `Ends ${end.slice(5)}` : 'Active',
      dateRangeText: banner?.start && banner?.end ? `${banner.start} – ${banner.end}` : undefined,
      bannerLabel: banner?.label,
    };
  }
  const range =
    banner?.start && banner?.end
      ? `${banner.start} – ${banner.end}`
      : banner?.end
        ? `Ended ${banner.end}`
        : 'Past Rotation';
  return {
    isAttainable: false,
    statusText: 'Not Attainable',
    dateRangeText: `Last available: ${range}`,
    bannerLabel: banner?.label,
  };
}

/** Common equips are wearable by every class; class filters only affect job equips. */
export function matchesJob(item: ItemMeta | undefined, job: string): boolean {
  return job === 'All' || item?.group !== 'classic-equips' ||
    !item.requiredJobs?.length || item.requiredJobs.includes('Beginner') || item.requiredJobs.includes(job);
}
/** Subsequence fuzzy score for search-as-you-type. Higher = better. Null = no match. */
export function fuzzyScore(rawNeedle: string, rawHaystack: string): number | null {
  const needle = rawNeedle.trim().toLowerCase();
  const hay = rawHaystack.toLowerCase();
  if (!needle) return 0;
  if (hay === needle) return 300 + hay.length;
  const idx = hay.indexOf(needle);
  if (idx >= 0) return 200 - idx;
  // Subsequence: every needle char appears in order. Score rewards compact spans.
  let hi = 0;
  let gaps = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    const found = hay.indexOf(needle[ni], hi);
    if (found < 0) return null;
    if (ni > 0) gaps += found - hi;
    hi = found + 1;
  }
  return 100 - gaps - hay.length * 0.01;
}

/** Name-or-id fuzzy match used by drawer + global search. */
export function matchesFuzzy(name: string | undefined, id: number, rawQuery: string): boolean {
  const needle = rawQuery.trim().toLowerCase();
  if (!needle) return true;
  if (String(id).includes(needle)) return true;
  if (!name) return false;
  return fuzzyScore(needle, name) != null;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  API,
  DEFAULT_LOOK,
  NAME_MAX,
  cleanName,
  EYE_COLORS,
  HAIR_COLORS,
  STORAGE_SEX_KEY,
  applyPick,
  bannerRank,
  decodeLook,
  EMOTES,
  defaultFaceForSex,
  defaultHairForSex,
  encodeLook,
  equipSlot,
  faceColorIndex,
  faceStyleId,
  faceVariantId,
  formatAttainableInfo,
  getBanner,
  getItem,
  getStyle,
  iconFallbackURL,
  iconURL,
  loadLookForSex,
  loadLookFromStorage,
  matchesFuzzy,
  matchesJob,
  mirrorStyleForSex,
  randomClassicWeapon,
  randomLook,
  stanceForWeapon,
  TWO_HAND_SUBS,
  weaponPoses,
  weaponSubOf,
  weaponInGroup,
  wieldForGroup,
  weaponVariant,
  wieldChoice,
  resolveWield,
  wieldOptions,
  oneHandedWield,
  RANDOM_EQUIP_SLOTS,
  type BannerMeta,
  type ItemMeta,
  type RandomEquipSlot,
  type ResolvedItem,
  type FastCatalog,
  type Look,
  type SectionId,
  type Sex,
} from '../lib/fashion';
import catalogData from '../data/catalog.json';
import { GenderIcon } from './gender-icon';
import LayeredCharacterCanvas from './layered-character-canvas';
import GamePad from './game-pad';
import DropModal, { type DropEntry } from './drop-modal';
import WieldPicker, { WeaponGroupFilter } from './wield-picker';
import { announcements, attainableNow, dropInfo, formatHM, loadSeen, saveSeen, unseen } from '../lib/drops';
import { autoSwipeLevel } from '../lib/afterimage';
import { PlayController, PLAY_POSES, SPRITE_CANVAS } from '../lib/play-controller';
import { ATTACK_FRAMES } from '../lib/skills';
import { warmPoses } from '../lib/layered-client-renderer';
import './fashion.css';
import './playground.css';
import CompareView from './compare-view';
import EmoteCarousel, { PREVIEW_EMOTE, useEmoteSprites } from './emote-carousel';
import OutfitsPanel from './outfits-panel';
import { outfitKey, snapshot, useSavedOutfits, type Outfit } from '../lib/outfits';

const CATALOG = catalogData as FastCatalog;
const MYSTERY_RATE_GROUPS = [
  { title: 'Male hair', rows: CATALOG.indexes.hairs.m.active.filter((id) => CATALOG.styles[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.styles[id].name, rate: CATALOG.styles[id].rate ?? '16.67%' })) },
  { title: 'Female hair', rows: CATALOG.indexes.hairs.f.active.filter((id) => CATALOG.styles[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.styles[id].name, rate: CATALOG.styles[id].rate ?? '16.67%' })) },
  { title: 'Male faces', rows: CATALOG.indexes.faces.m.active.filter((id) => CATALOG.items[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.items[id].name, rate: CATALOG.items[id].rate ?? '16.67%' })) },
  { title: 'Female faces', rows: CATALOG.indexes.faces.f.active.filter((id) => CATALOG.items[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.items[id].name, rate: CATALOG.items[id].rate ?? '16.67%' })) },
];
const STARTER_HAIRS: Record<Sex, number[]> = { m: [3000, 3002, 3003], f: [3100, 3104] };
const STARTER_FACES: Record<Sex, number[]> = { m: [20000, 20001, 20002], f: [21000, 21001, 21002] };
const HAIR_DOTS = ['#23232a', '#a83a32', '#d97b2e', '#e3c46a', '#4a8f4d', '#4a6fa5', '#7a4a8f', '#6e4a2f'];
const EYE_DOTS = ['#24242b', '#4a82c5', '#c94747', '#4a9459', '#826044', '#48aeb6', '#8050aa', '#8c3440', '#e8e8e8'];

type ViewTab = 'slots' | 'outfits' | 'limited' | 'crates' | 'styles';
const VIEW_OPTIONS: Record<ViewTab, { label: string; shortLabel: string; icon: string; desc: string }> = {
  slots: { label: 'Closet', shortLabel: 'Closet', icon: '👗', desc: 'Equipped slots & catalog' },
  outfits: { label: 'My Outfits', shortLabel: 'Outfits', icon: '⭐', desc: 'Saved looks & compare' },
  limited: { label: 'Limited Shop', shortLabel: 'Limited Shop', icon: '🛍️', desc: 'All limited crates, styles & sales' },
  crates: { label: 'Mystery Crates', shortLabel: 'Crates', icon: '📦', desc: 'Mystery & Founder’s crates' },
  styles: { label: 'Style Rotations', shortLabel: 'Styles', icon: '✨', desc: 'Hair & face style coupons' },
};
const SKIN_TONES: Record<number, string> = { 2000: '#ffddaa', 2001: '#bb9966', 2002: '#7a4a22', 2003: '#ffeecc', 2004: '#ccccdd', 2005: '#eeeeee', 2006: '#ffdddd' };
const AVATAR_PX = 44;
// Head-and-shoulders crop, in the centered 128px box of the sprite canvas.
const AVATAR_INSET = (SPRITE_CANVAS - 128) / 2;
const AVATAR_CROP = { x: AVATAR_INSET + 34, y: AVATAR_INSET + 20, size: 60 };
/** One-tap crate filters: banner id -> catalog group. Ended crates drop off the bar on their own. */
const CRATE_CHIPS = [
  { bannerId: 'halloween-crate-oct26', group: 'halloween-crate', icon: '🎃', label: 'Halloween' },
  { bannerId: 'mystery-crate-nov26', group: 'mystery-crate', icon: '📦', label: 'Mystery' },
  { bannerId: 'founder-crate-oct26', group: 'founder-crate', icon: '🎖️', label: "Founder's" },
] as const;
/** Tiles a closet rail scrolls through before it hands off to "See all". */
const RAIL_PREVIEW = 12;
const EQUIP_SECTIONS = [
  { id: 'Hat', label: 'Hats' },
  { id: 'Top', label: 'Shirts' },
  { id: 'Bottom', label: 'Pants' },
  { id: 'Overall', label: 'Overalls' },
  { id: 'Shoes', label: 'Shoes' },
  { id: 'Glove', label: 'Gloves' },
  { id: 'Weapon', label: 'Weapons' },
  { id: 'Shield', label: 'Shields' },
  { id: 'Cape', label: 'Capes' },
  { id: 'Accessories', label: 'Accessories' },
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
function shortDate(iso: string): string {
  const [m, d] = iso.split('-').slice(1).map(Number);
  return `${MONTHS[m - 1] ?? ''} ${d}`;
}
function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUTC = Date.UTC(y, m - 1, d);
  return Math.round((targetUTC - todayUTC) / (1000 * 60 * 60 * 24));
}
/** Sale phase from the exact start/end instants: a future start is Upcoming, not Active. */
function bannerPhase(banner: BannerMeta): { statusText: string; isActive: boolean; isUpcoming: boolean } {
  const info = dropInfo(banner, Date.now());
  if (info.state === 'upcoming') {
    return { statusText: `Upcoming · drops in ${formatHM(info.startsInMs!)}`, isActive: false, isUpcoming: true };
  }
  const days = info.endsInMs != null ? Math.ceil(info.endsInMs / 86_400_000) : null;
  return {
    statusText: info.state === 'ended' ? 'Ended' : days != null && days > 1 ? `Active · ${days}d left` : days != null ? 'Ends today' : 'Active',
    isActive: info.state === 'live',
    isUpcoming: false,
  };
}
function formatCountdown(banner: BannerMeta | undefined, attainable?: boolean): string | null {
  if (attainable === false || !banner) return null;
  const ms = dropInfo(banner, Date.now()).endsInMs;
  if (ms == null || ms <= 0) return null;
  return ms < 86_400_000 ? '<1d' : `${Math.ceil(ms / 86_400_000)}d`;
}
function equipInfo(item: ResolvedItem | undefined): string | undefined {
  if (item?.group === 'cover-10day') {
    const end = getBanner(CATALOG, item.bannerId)?.end;
    return `10-day duration${end ? ` · sale ends ${shortDate(end)}` : ''}`;
  }
  if (item?.group !== 'classic-equips') return undefined;
  const jobs = item.requiredJobs;
  const levelJobs = `Lv. ${item.requiredLevel ?? 0} · ${jobs?.includes('Beginner') ? 'All classes' : jobs?.join(', ') || 'All classes'}`;
  if (TWO_HAND_SUBS[item.sub]) return `Two-handed · no shield · ${levelJobs}`;
  if (equipSlot(item.sub) === 'Weapon') return `One-handed · ${levelJobs}`;
  return levelJobs;
}

function normalizeStance(look: Look): Look {
  // Shared links / saved looks can pair a weapon with the wrong pose (the
  // pose round-trips as its own param). Steer stand/walk poses to the worn
  // weapon's frames; action poses carry their own frames and are left alone.
  if (look.anim !== 'stand1' && look.anim !== 'stand2' && look.anim !== 'walk1' && look.anim !== 'walk2') return look;
  const sub = weaponSubOf(getItem(CATALOG, look.items.Weapon), look.wield);
  const stance = stanceForWeapon(sub ?? 'One-Handed Sword', look.anim);
  return stance ? { ...look, anim: stance.anim, frame: stance.frame } : look;
}

function loadInitialLook(): Look {
  if (typeof window === 'undefined') return DEFAULT_LOOK;
  const fromQuery = decodeLook(window.location.search);
  if (fromQuery) return normalizeStance({ ...DEFAULT_LOOK, ...fromQuery, sex: (fromQuery.sex as Sex) || DEFAULT_LOOK.sex });

  const fromHash = decodeLook(window.location.hash);
  if (fromHash) return normalizeStance({ ...DEFAULT_LOOK, ...fromHash, sex: (fromHash.sex as Sex) || DEFAULT_LOOK.sex });

  const savedSex = (localStorage.getItem(STORAGE_SEX_KEY) as Sex) || null;
  // Prefer the active gender's saved character; fall back to any saved look.
  const fromStorage = (savedSex && loadLookForSex(savedSex)) || loadLookFromStorage();
  if (fromStorage) {
    return normalizeStance({ ...DEFAULT_LOOK, ...fromStorage, sex: (fromStorage.sex as Sex) || savedSex || DEFAULT_LOOK.sex });
  }

  const sex = savedSex || DEFAULT_LOOK.sex;
  return { ...DEFAULT_LOOK, sex, hair: defaultHairForSex(sex), face: defaultFaceForSex(sex) };
}


/** Single owner for the selected look: boots from shared link / storage,
 *  mirrors every change back to the URL (shareable) + localStorage. */
function useLook() {
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
    const initial = loadInitialLook();
    setLook(initial);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const encoded = encodeLook(look);
    const currentUrl = new URL(window.location.href);
    const viewParam = currentUrl.searchParams.get('view');
    currentUrl.search = encoded ? '?' + encoded : '';
    if (viewParam) currentUrl.searchParams.set('view', viewParam);
    currentUrl.hash = '';
    history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
  }, [look]);

  return [look, setLook] as const;
}

export default function PlaygroundIsland() {
  const [look, setLook] = useLook();
  const [skins, setSkins] = useState<number[]>([2000]);
  const [q, setQ] = useState('');
  const [searchScope, setSearchScope] = useState<SectionId | 'all' | null>(null);
  const [excludedSlots, setExcludedSlots] = useState<RandomEquipSlot[]>([]);
  const [nxOnly, setNxOnly] = useState(true);
  // Global class filter: one job for rail rows, all drawers, randomizer.
  // 'All' shows default catalog order. Selecting a job sorts that class's
  // equips to the top while keeping other gear accessible below.
  const [job, setJob] = useState('All');
  const JOBS = ['All', 'Warrior', 'Magician', 'Bowman', 'Thief'];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const emoteSprites = useEmoteSprites(look.face);
  const [controller, setController] = useState<PlayController | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const [ratesOpen, setRatesOpen] = useState(false);
  const avatarRef = useRef<HTMLCanvasElement>(null);
  const lastRender = useRef<HTMLCanvasElement | undefined>(undefined);
  const drawAvatar = useCallback((source?: HTMLCanvasElement) => {
    if (source) lastRender.current = source;
    const src = lastRender.current;
    const ctx = avatarRef.current?.getContext('2d');
    if (!src || !ctx) return;
    ctx.clearRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, AVATAR_CROP.x, AVATAR_CROP.y, AVATAR_CROP.size, AVATAR_CROP.size, 0, 0, AVATAR_PX, AVATAR_PX);
  }, []);
  useEffect(() => { drawAvatar(); }, [settingsOpen, drawAvatar]);
  const [catSec, setCatSec] = useState<SectionId | null>(null);
  const [weaponGroup, setWeaponGroup] = useState<string | null>(null);
  const [catQ, setCatQ] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [equipToast, setEquipToast] = useState<{ id: number | null; name: string; action: 'Equipped' | 'Removed' | 'Saved' | 'Unsaved'; replaced: string; sequence: number } | null>(null);
  const toastSequence = useRef(0);

  useEffect(() => {
    if (!equipToast) return;
    const timer = window.setTimeout(() => setEquipToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [equipToast]);

  useEffect(() => {
    fetch(`${API}/Character`)
      .then((r) => r.json())
      .then((s: unknown) => {
        if (Array.isArray(s) && s.length) setSkins([...(s as number[])].sort((a, b) => a - b));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // New look kicked off a fresh async canvas render — show the spinner
    // until LayeredCharacterCanvas reports back via onRendered.
    setRendering(true);
  }, [look]);

  const patch = useCallback((p: Partial<Look>) => {
    setLook((l) => ({ ...l, ...p }));
  }, []);

  // A wield choice only means something to a skin that ships art for it; drop it once that skin is gone.
  useEffect(() => {
    if (look.wield && !Object.hasOwn(getItem(CATALOG, look.items.Weapon)?.wtypes ?? {}, look.wield)) patch({ wield: undefined });
  }, [look.wield, look.items.Weapon, patch]);

  // Shown when a cash weapon skin can't be wielded as the type the player was using.
  const [wieldNotice, setWieldNotice] = useState<{ id: number; name: string; types: string[]; applied: string; held: string } | null>(null);

  const chooseWield = useCallback((wield: string) => {
    setWieldNotice(null);
    setLook((l) => {
      const sub = weaponSubOf(getItem(CATALOG, l.items.Weapon), wield);
      const items = applyPick(l.items, 'Weapon', l.items.Weapon ?? null, sub, wield);
      const stance = stanceForWeapon(sub, l.anim);
      if (stance) return { ...l, wield, items, anim: stance.anim, frame: stance.frame };
      // An attack the new weapon type lacks falls back to its idle stance.
      const poses = weaponPoses(sub);
      return poses.some((p) => p.anim === l.anim) ? { ...l, wield, items } : { ...l, wield, items, anim: poses[0]!.anim, frame: 0 };
    });
  }, []);

  // Filtering by weapon type also wields the worn multi-type skin as that type.
  const chooseWeaponGroup = useCallback((group: string | null) => {
    setWeaponGroup(group);
    const wield = group ? wieldForGroup(getItem(CATALOG, look.items.Weapon), group, weaponSubOf(getItem(CATALOG, look.items.Weapon), look.wield)) : undefined;
    if (wield && wield !== weaponSubOf(getItem(CATALOG, look.items.Weapon), look.wield)) chooseWield(wield);
  }, [look.items.Weapon, look.wield, chooseWield]);

  const chooseClass = useCallback((next: string) => {
    setJob(next);
    const weapon = randomClassicWeapon(look.sex, next === 'All' ? 'Beginner' : next);
    if (weapon == null) return;
    setLook(current => {
      const sub = weaponSubOf(getItem(CATALOG, weapon));
      const items = applyPick(current.items, 'Weapon', weapon, sub);
      const stance = stanceForWeapon(sub, current.anim);
      return stance ? { ...current, items, anim: stance.anim, frame: stance.frame } : { ...current, items };
    });
  }, [look.sex]);

  const setSex = useCallback((sex: Sex) => {
    setSettingsOpen(false);
    setLook((l) => {
      if (l.sex === sex) return l;
      // Restore that gender's saved character; otherwise mirror the worn
      // styles across to the live banner lineup (same tier, same slot),
      // keeping dye and eye colors.
      const saved = loadLookForSex(sex);
      if (saved) return normalizeStance({ ...DEFAULT_LOOK, ...saved, sex });
      const hairStyle = Math.floor(l.hair / 10);
      const hairSex = CATALOG.styles[hairStyle]?.sex;
      const hair = hairSex === sex
        ? l.hair
        : mirrorStyleForSex('hair', l.sex, sex, hairStyle) * 10 + l.hairCol;
      const fromFaceSex: Sex = l.face >= 21000 ? 'f' : 'm';
      const face = fromFaceSex === sex
        ? l.face
        : faceVariantId(sex, mirrorStyleForSex('face', l.sex, sex, faceStyleId(l.face)), faceColorIndex(l.face));
      return { ...l, sex, hair, face };
    });
  }, []);

  const wearItemById = useCallback((id: number | null, sub: string) => {
    if (id == null) return;
    const slot = equipSlot(sub);
    const faceItem = sub === 'Face' ? getItem(CATALOG, id) : undefined;
    const faceSex: Sex = faceItem?.sex === 'f' || (id != null && id >= 21000) ? 'f' : 'm';
    const selectedId = sub === 'Face' ? faceVariantId(faceSex, faceStyleId(id), faceColorIndex(look.face)) : id;
    const currentId = sub === 'Hair' ? look.hair : sub === 'Face' ? look.face : look.items[slot];
    const cosmetic = sub === 'Hair' || sub === 'Face';
    if (cosmetic && currentId === selectedId) return;
    const unequipping = !cosmetic && currentId === id;
    const pickedWeapon = slot === 'Weapon' && !unequipping ? getItem(CATALOG, id) : undefined;
    const resolved = pickedWeapon ? resolveWield(getItem(CATALOG, look.items.Weapon), look.wield, pickedWeapon) : undefined;
    // With a weapon type filter on, a multi-type skin is picked as that type.
    const groupWield = pickedWeapon && weaponGroup ? wieldForGroup(pickedWeapon, weaponGroup, resolved?.wield ?? look.wield) : undefined;
    const nextWield = slot === 'Weapon' ? groupWield ?? resolved?.wield : slot === 'Shield' && !unequipping ? oneHandedWield(getItem(CATALOG, look.items.Weapon), look.wield) ?? look.wield : look.wield;
    setWieldNotice(pickedWeapon && !groupWield && resolved?.notice ? { id, name: pickedWeapon.name, ...resolved.notice } : null);
    const nextItems = cosmetic ? look.items : applyPick(look.items, slot, unequipping ? null : id, sub, nextWield);
    const removed = Object.keys(look.items).filter((key) => nextItems[key] === undefined || (key === 'Weapon' && nextItems[key] !== look.items[key]));
    const slotNames: Record<string, string> = { Top: 'shirt', Bottom: 'pants', Overall: 'overall', Shield: 'shield', Weapon: 'two-handed weapon' };
    // A shield that forces a two-handed weapon off puts a one-handed one in its place; say which, not just "removed".
    const swapped = slot === 'Shield' && look.items.Weapon != null && nextItems.Weapon != null && nextItems.Weapon !== look.items.Weapon
      ? `Swapped ${getItem(CATALOG, look.items.Weapon)?.name ?? 'weapon'} for ${getItem(CATALOG, nextItems.Weapon)?.name ?? 'a one-handed weapon'} (a shield needs a free hand)`
      : '';
    const dropped = swapped ? removed.filter((key) => key !== 'Weapon') : removed;
    // A multi-type skin kept by the shield drops from its two-handed type to a one-handed one, which changes its stance.
    const rewielded = slot === 'Shield' && !unequipping && nextWield && nextWield !== look.wield && nextItems.Weapon != null && nextItems.Weapon === look.items.Weapon
      ? `Switched ${getItem(CATALOG, nextItems.Weapon)?.name ?? 'weapon'} to ${nextWield}`
      : '';
    // Grey-out tap: wearing an off-job classic switches the global filter to
    // that item's job so the outfit stays coherent for the new job.
    const picked = !cosmetic && !unequipping ? getItem(CATALOG, id) : undefined;
    const pickedJob = picked?.group === 'classic-equips' ? picked.requiredJobs?.find((j) => j !== 'Beginner') ?? null : null;
    const switching = picked && pickedJob && job !== 'All' && !matchesJob(picked, job) ? pickedJob : null;
    if (switching) setJob(switching);
    setEquipToast({
      id: selectedId,
      name: getItem(CATALOG, selectedId)?.name ?? sub,
      action: unequipping ? 'Removed' : 'Equipped',
      replaced: !unequipping && (removed.length || rewielded || switching) ? [swapped, rewielded, dropped.length ? `Removed ${dropped.map((key) => slotNames[key] ?? key.toLowerCase()).join(' and ')}` : '', switching ? `Switched class to ${switching}` : ''].filter(Boolean).join(' · ') : '',
      sequence: ++toastSequence.current,
    });
    if (sub === 'Hair') patch({ hair: id, hairCol: id % 10 });
    else if (sub === 'Face') patch({ face: selectedId });
    else {
      const weaponSub = unequipping && slot === 'Weapon'
        ? undefined
        : sub === 'Shield'
          ? weaponSubOf(getItem(CATALOG, nextItems.Weapon), nextWield)
          : slot === 'Weapon' ? weaponSubOf(getItem(CATALOG, id), nextWield) ?? sub : sub;
      // Tapping the worn weapon off falls back to bare hands; stand2/walk2
      // have no unarmed frames, so steer back to stand1/walk1.
      const bareHands = unequipping && slot === 'Weapon' && (look.anim === 'stand2' || look.anim === 'walk2')
        ? { anim: look.anim === 'stand2' ? 'stand1' : 'walk1', frame: 0 }
        : null;
      const stance = stanceForWeapon(weaponSub, look.anim) ?? bareHands;
      patch({ items: nextItems, ...(slot === 'Weapon' || slot === 'Shield' ? { wield: nextWield } : {}), ...(stance ? { anim: stance.anim, frame: stance.frame } : {}) });
    }
  }, [look, patch, job, weaponGroup]);

  const tryOnCrate = useCallback((items: Array<{ id: number; isHair?: boolean; sub: string; sex?: 'm' | 'f' | 'u' }>) => {
    const available = items.filter((i) => !i.sex || i.sex === 'u' || i.sex === look.sex);
    const bySlot: Record<string, number[]> = {};
    for (const item of available) {
      if (item.isHair || item.sub === 'Face') continue;
      const slot = equipSlot(item.sub);
      if (!bySlot[slot]) bySlot[slot] = [];
      bySlot[slot].push(item.id);
    }
    setLook((prev) => {
      let nextItems = { ...prev.items };
      for (const [slot, ids] of Object.entries(bySlot)) {
        const pickedId = ids[Math.floor(Math.random() * ids.length)]!;
        const sub = getItem(CATALOG, pickedId)?.sub;
        nextItems = applyPick(nextItems, slot, pickedId, sub);
      }
      return { ...prev, items: nextItems };
    });
  }, [look.sex]);

  const otherSex: Sex = look.sex === 'm' ? 'f' : 'm';

  // O(1) Pre-indexed style and item ID arrays: matching sex first, other sex second
  const activeHairStyles = useMemo(() => [
    ...CATALOG.indexes.hairs[look.sex].active,
    ...CATALOG.indexes.hairs[otherSex].active,
  ], [look.sex, otherSex]);

  const pastHairStyles = useMemo(() => [
    ...CATALOG.indexes.hairs[look.sex].past,
    ...CATALOG.indexes.hairs[otherSex].past,
  ], [look.sex, otherSex]);

  const unreleasedHairStyles = useMemo(() => [
    ...CATALOG.indexes.hairs[look.sex].unreleased,
    ...CATALOG.indexes.hairs[otherSex].unreleased,
  ], [look.sex, otherSex]);

  const activeFaces = useMemo(() => [
    ...CATALOG.indexes.faces[look.sex].active,
    ...CATALOG.indexes.faces[otherSex].active,
  ], [look.sex, otherSex]);

  const pastFaces = useMemo(() => [
    ...CATALOG.indexes.faces[look.sex].past,
    ...CATALOG.indexes.faces[otherSex].past,
  ], [look.sex, otherSex]);

  const unreleasedFaces = useMemo(() => [
    ...CATALOG.indexes.faces[look.sex].unreleased,
    ...CATALOG.indexes.faces[otherSex].unreleased,
  ], [look.sex, otherSex]);

  const starterHairStyles = useMemo(() => [
    ...STARTER_HAIRS[look.sex].filter(id => !!CATALOG.styles[id]),
    ...STARTER_HAIRS[otherSex].filter(id => !!CATALOG.styles[id]),
  ], [look.sex, otherSex]);

  const starterFaces = useMemo(() => [
    ...STARTER_FACES[look.sex].filter(id => !!CATALOG.items[id]),
    ...STARTER_FACES[otherSex].filter(id => !!CATALOG.items[id]),
  ], [look.sex, otherSex]);

  // Mystery (random) vs Signature (pick) splits by coupon tier
  const mysteryHairs = useMemo(() => activeHairStyles.filter((st) => (getStyle(CATALOG, st)?.coupon ?? 'mystery') === 'mystery'), [activeHairStyles]);
  const signatureHairs = useMemo(() => activeHairStyles.filter((st) => getStyle(CATALOG, st)?.coupon === 'signature'), [activeHairStyles]);
  const mysteryFaces = useMemo(() => activeFaces.filter((fid) => (getItem(CATALOG, fid)?.coupon ?? 'mystery') === 'mystery'), [activeFaces]);
  const signatureFaces = useMemo(() => activeFaces.filter((fid) => getItem(CATALOG, fid)?.coupon === 'signature'), [activeFaces]);

  // Matching sex + unisex first, other sex after
  const getGroupEquips = useCallback(
    (groupKey: string): number[] => {
      const g = CATALOG.indexes.groups[groupKey];
      if (!g) return [];
      const altSex: Sex = look.sex === 'm' ? 'f' : 'm';
      return [...g.u, ...g[look.sex], ...g[altSex]];
    },
    [look.sex],
  );

  // Client-only clock: sale windows decide what has expired, so the first paint matches the static HTML.
  const [dropNow, setDropNow] = useState<number | null>(null);
  useEffect(() => setDropNow(Date.now()), []);

  const equipSections = useMemo(() => {
    const ids = [...new Set(['founder-crate', 'halloween-crate', 'mystery-crate', 'aurora-crate', 'cover-10day', 'classic-equips', 'unreleased'].flatMap(getGroupEquips))]
      .filter((id) => !!CATALOG.items[id]);
    return EQUIP_SECTIONS.map((section) => ({
      ...section,
      ids: ids.filter((id) => {
        const item = CATALOG.items[id];
        if (!item) return false;
        const slot = equipSlot(item.sub);
        return section.id === 'Accessories'
          ? !EQUIP_SECTIONS.some((section) => section.id === slot)
          : slot === section.id;
      }),
    }));
  }, [getGroupEquips]);


  type CatRow = { type: 'hair' | 'item'; id: number; mismatch?: boolean; sexMismatch?: number };
  // (needle filter inlined in catGroups below)
  // Grouped rows for the merged Hair/Face drawers, fixed catalog order with matching sex first.
  const catGroups = useMemo(() => {
    if (catSec !== 'Hair' && catSec !== 'Face') return null;
    const needle = catQ.trim().toLowerCase();
    const matches = (name: string | undefined, id: number) => matchesFuzzy(name, id, needle);
    const stillLive = (bannerId: string | undefined) => attainableNow(false, getBanner(CATALOG, bannerId), Date.now());
    const buildHair = (key: string, label: string, ids: number[]) => {
      const rows: CatRow[] = ids
        .filter((st) => matches(CATALOG.styles[st]?.name, st))
        .map((st) => ({
          type: 'hair' as const,
          id: st,
          sexMismatch: CATALOG.styles[st]?.sex !== look.sex ? 1 : 0,
        }))
        .sort((a, b) => (a.sexMismatch ?? 0) - (b.sexMismatch ?? 0));
      return { key, label, rows };
    };
    const buildFace = (key: string, label: string, ids: number[]) => {
      const rows: CatRow[] = ids
        .filter((fid) => matches(CATALOG.items[fid]?.name, fid))
        .map((fid) => ({
          type: 'item' as const,
          id: fid,
          sexMismatch: CATALOG.items[fid]?.sex && CATALOG.items[fid].sex !== 'u' && CATALOG.items[fid].sex !== look.sex ? 1 : 0,
        }))
        .sort((a, b) => (a.sexMismatch ?? 0) - (b.sexMismatch ?? 0));
      return { key, label, rows };
    };
    const isMystery = (coupon: string | undefined) => (coupon ?? 'mystery') === 'mystery';
    const leavingHairs = pastHairStyles.filter((st) => stillLive(CATALOG.styles[st]?.bannerId));
    const leavingFaces = pastFaces.filter((fid) => stillLive(CATALOG.items[fid]?.bannerId));
    const groups = catSec === 'Hair'
      ? [
          buildHair('hair:mystery-leaving', 'Ending soon', leavingHairs.filter((st) => isMystery(CATALOG.styles[st]?.coupon))),
          buildHair('hair:mystery', 'Mystery', mysteryHairs),
          buildHair('hair:signature-leaving', 'Ending soon', leavingHairs.filter((st) => !isMystery(CATALOG.styles[st]?.coupon))),
          buildHair('hair:signature', 'Signature', signatureHairs),
          buildHair('hair:starter', 'Starter', starterHairStyles),
          buildHair('hair:past', 'Past rotation', pastHairStyles.filter((st) => !stillLive(CATALOG.styles[st]?.bannerId))),
          buildHair('hair:unreleased', 'Not released yet', unreleasedHairStyles),
        ]
      : [
          buildFace('face:mystery-leaving', 'Ending soon', leavingFaces.filter((fid) => isMystery(CATALOG.items[fid]?.coupon))),
          buildFace('face:mystery', 'Mystery', mysteryFaces),
          buildFace('face:signature-leaving', 'Ending soon', leavingFaces.filter((fid) => !isMystery(CATALOG.items[fid]?.coupon))),
          buildFace('face:signature', 'Signature', signatureFaces),
          buildFace('face:starter', 'Starter', starterFaces),
          buildFace('face:past', 'Past rotation', pastFaces.filter((fid) => !stillLive(CATALOG.items[fid]?.bannerId))),
          buildFace('face:unreleased', 'Not released yet', unreleasedFaces),
        ];
    return groups.sort((a, b) => Number(a.rows.length === 0) - Number(b.rows.length === 0));
  }, [catSec, catQ, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, unreleasedHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces, unreleasedFaces, look.sex]);
  // (category expand/collapse inlined at the drawer render below)

  function jobTier(item: ItemMeta | undefined, selectedJob: string): number {
    if (!item || selectedJob === 'All') return 0;
    // Tier 0: Specifically requires the selected job (e.g. Warrior gear)
    if (item.requiredJobs?.includes(selectedJob) && !item.requiredJobs.includes('Beginner')) {
      return 0;
    }
    // Tier 1: Common classic equips wearable by Beginner/All or NX cosmetics
    if (matchesJob(item, selectedJob)) {
      return 1;
    }
    // Tier 2: Gear for another job (off-job, kept visible but sorted below)
    return 2;
  }

  const catRows = useMemo(() => {
    if (!catSec) return [];
    const needle = catQ.trim().toLowerCase();
    const r = equipSections.find((section) => section.id === catSec)?.ids ?? getGroupEquips(catSec);
    // When a job is selected, that job's gear is sorted up to the top
    // while common and off-job gear remain accessible below.
    const matched = needle ? r.filter((id) => matchesFuzzy(CATALOG.items[id]?.name, id, needle)) : r;
    const filtered = catSec === 'Weapon' && weaponGroup ? matched.filter((id) => weaponInGroup(CATALOG.items[id], weaponGroup)) : matched;
    const levelOf = (id: number) => CATALOG.items[id]?.requiredLevel ?? -1;
    const nameOf = (id: number) => CATALOG.items[id]?.name ?? '';
    const mismatchOf = (id: number) => !matchesJob(CATALOG.items[id], job);
    const tierOf = (id: number) => jobTier(CATALOG.items[id], job);
    const sexMismatchOf = (id: number) => {
      const s = CATALOG.items[id]?.sex;
      return s && s !== 'u' && s !== look.sex ? 1 : 0;
    };
    const rankOf = (id: number) => bannerRank(CATALOG.items[id]);
    return filtered
      .map((id) => ({ type: 'item' as const, id, mismatch: mismatchOf(id), sexMismatch: sexMismatchOf(id), tier: tierOf(id) }))
      .sort((a, b) =>
        a.sexMismatch - b.sexMismatch ||
        a.tier - b.tier ||
        (job !== 'All' && a.tier === 0 ? levelOf(a.id) - levelOf(b.id) : rankOf(a.id) - rankOf(b.id)) ||
        levelOf(a.id) - levelOf(b.id) ||
        nameOf(a.id).localeCompare(nameOf(b.id))
      );
  }, [catSec, catQ, getGroupEquips, equipSections, job, look.sex, weaponGroup]);


  // Equip drawers: partition the flat row list into banner sections so NX
  // sources never intermix — Founder's crate → 10-day covers → Aurora stamp
  // → classic job equips. When a specific job is selected, Job Equips prioritizes
  // to the top and off-job gear trails at the bottom, below NX cosmetics.
  const equipGroups = useMemo(() => {
    if (catGroups || !catSec || catRows.length === 0) return null;
    const buckets = new Map<string, typeof catRows>();
    for (const row of catRows) {
      const item = CATALOG.items[row.id];
      let group = item?.group ?? 'classic-equips';
      // Lapsed sales leave their crate and collect in one Past rotation group ahead of the unreleased ones.
      if (dropNow != null && group !== 'classic-equips' && group !== 'unreleased' && item
        && !attainableNow(item.attainable !== false, getBanner(CATALOG, item.bannerId), dropNow)) group = 'expired';
      // When a job is selected, off-job gear drops into its own trailing
      // bucket so NX cosmetics always sort above filtered-out items.
      const key = group === 'classic-equips' && job !== 'All' && row.tier === 2 ? 'off-job' : group;
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }
    const order = job !== 'All'
      ? ['classic-equips', 'founder-crate', 'halloween-crate', 'mystery-crate', 'cover-10day', 'aurora-crate', 'expired', 'unreleased', 'off-job']
      : ['founder-crate', 'halloween-crate', 'mystery-crate', 'cover-10day', 'aurora-crate', 'classic-equips', 'expired', 'unreleased'];
    const groups = order
      .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
      .map((key) => {
        const rows = buckets.get(key)!;
        const bannerId = key === 'expired' ? undefined : CATALOG.items[rows[0]!.id]?.bannerId;
        const banner = getBanner(CATALOG, bannerId);
        const dates = banner?.start && banner?.end ? ` · ${shortDate(banner.start)}–${shortDate(banner.end)}` : '';
        const label = key === 'founder-crate' ? "Founder's Mystery Crate"
          : key === 'halloween-crate' ? 'Halloween Mystery Crate'
          : key === 'mystery-crate' ? 'Mystery Fashion Crate'
          : key === 'cover-10day' ? '10-Day Covers'
          : key === 'aurora-crate' ? 'Aurora Stamp Shop'
          : key === 'off-job' ? `Off-job · ${job}` : key === 'expired' ? 'Past rotation' : key === 'unreleased' ? 'Not released yet' : 'Job Equips';
        return { key, label: `${label} · ${rows.length}${dates}`, rows, bannerId };
      });
    return groups;
  }, [catGroups, catSec, catRows, job, dropNow]);

  const openCat = useCallback((sec: SectionId) => {
    setSettingsOpen(false);
    setCatSec(sec);
    setCatQ('');
  }, []);

  const [viewTab, setViewTab] = useState<ViewTab>('slots');
  // A banner the visitor just tried on from the announcement floats to the top of its list.
  const [pinnedBanner, setPinnedBanner] = useState<string | null>(null);
  // Crate chip filter: limits the closet rails and the sale cards to one crate.
  const [crateFilter, setCrateFilter] = useState<string | null>(null);
  const viewTabHydrated = useRef(false);

  useEffect(() => {
    viewTabHydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    let target: ViewTab = 'slots';
    if (v === 'limited' || v === 'all') target = 'limited';
    else if (v === 'styles' || v === 'banners') target = 'styles';
    else if (v === 'crates' || v === 'slots' || v === 'outfits') target = v;
    else {
      const saved = localStorage.getItem('classic-closet:view');
      if (saved === 'limited' || saved === 'all') target = 'limited';
      else if (saved === 'styles' || saved === 'banners') target = 'styles';
      else if (saved === 'crates' || saved === 'slots' || saved === 'outfits') target = saved as ViewTab;
    }
    if (target !== 'slots') setViewTab(target);
  }, []);

  useEffect(() => {
    if (!viewTabHydrated.current) return;
    try {
      localStorage.setItem('classic-closet:view', viewTab);
      const url = new URL(window.location.href);
      if (viewTab !== 'slots') {
        url.searchParams.set('view', viewTab);
      } else {
        url.searchParams.delete('view');
      }
      history.replaceState(null, '', url.pathname + url.search);
    } catch {
      // storage unavailable
    }
  }, [viewTab]);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [bannerSort, setBannerSort] = useState<'date-asc' | 'crates-first' | 'date-desc'>('date-asc');
  const [crateSlotFilter, setCrateSlotFilter] = useState<Record<string, string[]>>({});
  const [activeFilterCardId, setActiveFilterCardId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const card = params.get('filterCard');
    if (card) setActiveFilterCardId(card);
  }, []);
  const filterPopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [viewMenuOpen]);

  useEffect(() => {
    if (!activeFilterCardId) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (filterPopRef.current && !filterPopRef.current.contains(e.target as Node)) {
        setActiveFilterCardId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveFilterCardId(null);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeFilterCardId]);

  const toggleCrateSlot = (cardId: string, slot: string, allSlots: string[]) => {
    setCrateSlotFilter((prev) => {
      const current = prev[cardId];
      const active = current ?? allSlots;
      let next: string[];
      if (active.includes(slot)) {
        next = active.filter((s) => s !== slot);
      } else {
        next = [...active, slot];
      }
      if (next.length === allSlots.length) {
        const copy = { ...prev };
        delete copy[cardId];
        return copy;
      }
      return { ...prev, [cardId]: next };
    });
  };

  const selectAllCrateSlots = (cardId: string) => {
    setCrateSlotFilter((prev) => {
      const copy = { ...prev };
      delete copy[cardId];
      return copy;
    });
  };

  const clearAllCrateSlots = (cardId: string) => {
    setCrateSlotFilter((prev) => ({ ...prev, [cardId]: [] }));
  };

  const bannerCards = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      type: 'crate' | 'style-coupon' | 'shop' | 'covers';
      typeLabel: string;
      start: string | null;
      end: string | null;
      note?: string;
      post?: string;
      rates?: string;
      daysLeft: number | null;
      statusText: string;
      isActive: boolean;
      isUpcoming?: boolean;
      items: Array<{ id: number; name: string; sub: string; rate?: string; isHair?: boolean; sex?: 'm' | 'f' | 'u'; sexMismatch?: number }>;
    }> = [];

    const getDays = (end: string | null) => {
      if (!end) return null;
      return daysUntil(end);
    };

    const crateItems = (groupKey: string) => {
      const g = CATALOG.indexes.groups[groupKey];
      if (!g) return [];
      const matching = [...g.u, ...g[look.sex]];
      const opposite = g[otherSex] ?? [];
      const rows = [...matching, ...opposite].map(id => {
        const m = CATALOG.items[id];
        return {
          id,
          name: m?.name ?? '',
          sub: m?.sub ?? '',
          rate: m?.rate,
          sex: m?.sex,
          sexMismatch: m?.sex && m.sex !== 'u' && m.sex !== look.sex ? 1 : 0,
        };
      }).sort((a, b) => a.sexMismatch - b.sexMismatch);
      // Pair opposite-sex counterparts (e.g. Sailor Outfit ♂/♀) adjacently:
      // same-name items for the other sex slot in right after their match
      // instead of sinking to the bottom of a long crate list.
      const paired = rows.filter((r) => r.sexMismatch === 0);
      for (const r of rows) {
        if (r.sexMismatch === 0) continue;
        let idx = -1;
        for (let i = paired.length - 1; i >= 0; i--) {
          if (paired[i]!.sexMismatch === 0 && paired[i]!.name === r.name) { idx = i; break; }
        }
        if (idx === -1) paired.push(r); else paired.splice(idx + 1, 0, r);
      }
      return paired;
    };
    // 0. Halloween Mystery Fashion Crate
    const hc = CATALOG.banners['halloween-crate-oct26'];
    if (hc) {
      const days = getDays(hc.end);
      list.push({
        id: hc.id,
        label: hc.label,
        type: 'crate',
        typeLabel: 'Halloween Crate',
        start: hc.start,
        end: hc.end,
        note: hc.note,
        post: hc.post,
        rates: hc.rates,
        daysLeft: days,
        ...bannerPhase(hc),
        items: crateItems('halloween-crate'),
      });
    }

    // 1. Mystery Fashion Crate
    const mc = CATALOG.banners['mystery-crate-nov26'];
    if (mc) {
      const days = getDays(mc.end);
      list.push({
        id: mc.id,
        label: mc.label,
        type: 'crate',
        typeLabel: 'Mystery Crate',
        start: mc.start,
        end: mc.end,
        note: mc.note,
        post: mc.post,
        rates: mc.rates,
        daysLeft: days,
        ...bannerPhase(mc),
        items: crateItems('mystery-crate'),
      });
    }

    // 2. Founder's Mystery Fashion Crate
    const fc = CATALOG.banners['founder-crate-oct26'];
    if (fc) {
      const days = getDays(fc.end);
      list.push({
        id: fc.id,
        label: fc.label,
        type: 'crate',
        typeLabel: "Founder's Crate",
        start: fc.start,
        end: fc.end,
        note: fc.note,
        post: fc.post,
        rates: fc.rates,
        daysLeft: days,
        ...bannerPhase(fc),
        items: crateItems('founder-crate'),
      });
    }

    // 3. Style Coupons
    const sc = CATALOG.banners['style-oct28'];
    if (sc) {
      const days = getDays(sc.end);
      const items: Array<{ id: number; name: string; sub: string; rate?: string; isHair?: boolean; sex?: 'm' | 'f' | 'u'; sexMismatch?: number }> = [];
      for (const hId of [...mysteryHairs, ...signatureHairs]) {
        const meta = getStyle(CATALOG, hId);
        if (meta) items.push({
          id: hId,
          name: meta.name,
          sub: 'Hair',
          rate: meta.rate,
          isHair: true,
          sex: meta.sex,
          sexMismatch: meta.sex !== look.sex ? 1 : 0,
        });
      }
      for (const fId of [...mysteryFaces, ...signatureFaces]) {
        const meta = getItem(CATALOG, fId);
        if (meta) items.push({
          id: fId,
          name: meta.name,
          sub: 'Face',
          rate: meta.rate,
          sex: meta.sex,
          sexMismatch: meta.sex && meta.sex !== 'u' && meta.sex !== look.sex ? 1 : 0,
        });
      }
      items.sort((a, b) => (a.sexMismatch ?? 0) - (b.sexMismatch ?? 0));
      list.push({
        id: sc.id,
        label: sc.label,
        type: 'style-coupon',
        typeLabel: 'Style Coupon',
        start: sc.start,
        end: sc.end,
        note: sc.note,
        post: sc.post,
        rates: sc.rates,
        daysLeft: days,
        ...bannerPhase(sc),
        items,
      });
    }

    // 4. Aurora Stamp Shop
    const au = CATALOG.banners['aurora-s1'];
    if (au) {
      const days = getDays(au.end);
      list.push({
        id: au.id,
        label: au.label,
        type: 'shop',
        typeLabel: 'Stamp Shop',
        start: au.start,
        end: au.end,
        note: au.note,
        post: au.post,
        rates: au.rates,
        daysLeft: days,
        ...bannerPhase(au),
        items: crateItems('aurora-crate'),
      });
    }

    // 5. 10-Day Covers
    const cv = CATALOG.banners['covers-10day-nov26'];
    if (cv) {
      const days = getDays(cv.end);
      list.push({
        id: cv.id,
        label: cv.label,
        type: 'covers',
        typeLabel: '10-Day Covers',
        start: cv.start,
        end: cv.end,
        note: cv.note,
        post: cv.post,
        daysLeft: days,
        ...bannerPhase(cv),
        items: crateItems('cover-10day'),
      });
    }

    // 6. Past Style Rotations (newest first)
    for (const pastId of ['style-oct26', 'beta-style-sep26']) {
      const beta = CATALOG.banners[pastId];
      if (!beta) continue;
      const phase = bannerPhase(beta);
      const items: Array<{ id: number; name: string; sub: string; rate?: string; isHair?: boolean; sex?: 'm' | 'f' | 'u'; sexMismatch?: number }> = [];
      for (const hId of pastHairStyles) {
        const meta = getStyle(CATALOG, hId);
        if (meta?.bannerId === beta.id) items.push({
          id: hId,
          name: meta.name,
          sub: 'Hair',
          rate: meta.rate,
          isHair: true,
          sex: meta.sex,
          sexMismatch: meta.sex !== look.sex ? 1 : 0,
        });
      }
      for (const fId of pastFaces) {
        const meta = getItem(CATALOG, fId);
        if (meta?.bannerId === beta.id) items.push({
          id: fId,
          name: meta.name,
          sub: 'Face',
          rate: meta.rate,
          sex: meta.sex,
          sexMismatch: meta.sex && meta.sex !== 'u' && meta.sex !== look.sex ? 1 : 0,
        });
      }
      items.sort((a, b) => (a.sexMismatch ?? 0) - (b.sexMismatch ?? 0));
      list.push({
        id: beta.id,
        label: beta.label,
        type: 'style-coupon',
        typeLabel: phase.isActive ? 'Style Coupon' : 'Past Rotation',
        start: beta.start,
        end: beta.end,
        note: beta.note,
        daysLeft: phase.isActive ? daysUntil(beta.end!) : -1,
        ...phase,
        items,
      });
    }

    const phaseRank = (c: { isActive: boolean; isUpcoming?: boolean }) => (c.isActive ? 0 : c.isUpcoming ? 1 : 2);
    return list.sort((a, b) => {
      if (a.id === pinnedBanner || b.id === pinnedBanner) return a.id === pinnedBanner ? -1 : 1;
      if (bannerSort === 'crates-first') {
        const isCrateA = a.type === 'crate' ? 0 : 1;
        const isCrateB = b.type === 'crate' ? 0 : 1;
        if (isCrateA !== isCrateB) return isCrateA - isCrateB;
        if (phaseRank(a) !== phaseRank(b)) return phaseRank(a) - phaseRank(b);
        return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
      }
      if (bannerSort === 'date-asc') {
        if (phaseRank(a) !== phaseRank(b)) return phaseRank(a) - phaseRank(b);
        return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
      }
      if (bannerSort === 'date-desc') {
        const aStart = a.start ?? '1970-01-01';
        const bStart = b.start ?? '1970-01-01';
        return bStart.localeCompare(aStart);
      }
      return 0;
    });
  }, [look.sex, bannerSort, pinnedBanner, mysteryHairs, signatureHairs, pastHairStyles, mysteryFaces, signatureFaces, pastFaces]);

  const displayedCards = useMemo(() => {
    if (viewTab === 'crates') return bannerCards.filter((c) => c.type === 'crate' && (!crateFilter || c.id === crateFilter));
    if (viewTab === 'styles') return bannerCards.filter((c) => c.type === 'style-coupon');
    if (viewTab === 'limited') return crateFilter ? bannerCards.filter((c) => c.id === crateFilter) : bannerCards;
    return [];
  }, [viewTab, bannerCards, crateFilter]);

  // Light-dismiss the character panel: taps outside it (backdropped by the
  // scrim below) and the Escape key close it, not just the × button.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const [undoLook, setUndoLook] = useState<Look | null>(null);
  const lookSnapshotRef = useRef<Look>(look);
  const saveUndo = useCallback(() => setUndoLook(lookSnapshotRef.current), []);

  // ── Playground: saved outfits + compare ──
  // Nothing is recorded while trying things on. Compare pins what you're wearing
  // as A, then B follows the live look as you keep trying things on.
  const outfits = useSavedOutfits(look);
  const [editingName, setEditingName] = useState(false);
  const [pin, setPin] = useState<{ look: Look; name?: string } | null>(null);
  const comparing = pin !== null && !controller;
  /** Put an outfit on the character, keeping the current pose, emote and name. */
  const wearOutfit = useCallback((outfit: { look: Look; name?: string }) => {
    saveUndo();
    setPin(null);
    setLook((l) => normalizeStance({ ...outfit.look, name: l.name, anim: l.anim, frame: l.frame, emote: l.emote }));
  }, [saveUndo, setLook]);
  /** Same toast the closet uses for equips; id null draws the bookmark instead of an item icon. */
  const announceOutfit = useCallback((action: 'Saved' | 'Unsaved', name: string) => {
    setEquipToast({ id: null, name, action, replaced: '', sequence: ++toastSequence.current });
  }, []);
  /** On: pin what's worn now as A and compare against whatever gets tried on next. */
  const toggleCompare = useCallback(() => {
    setPin((p) => p ? null : { look: snapshot(look), name: outfits.current?.name });
  }, [look, outfits.current?.name]);
  // Recently changed items, newest first. Each change records the new item and the one it
  // replaced, so the top of the list is always "the last swap, and how to undo it".
  // Bulk changes (shuffle, wearing a whole outfit) are skipped: they'd bury individual swaps.
  const [recents, setRecents] = useState<number[]>([]);
  const prevItems = useRef<Look['items'] | null>(null);
  useEffect(() => {
    if (look === DEFAULT_LOOK) return;
    const prev = prevItems.current;
    prevItems.current = look.items;
    if (!prev) return;
    const changed = [...new Set([...Object.keys(prev), ...Object.keys(look.items)])].filter((slot) => prev[slot] !== look.items[slot]);
    if (changed.length === 0 || changed.length > 3) return;
    const touched = changed.flatMap((slot) => [look.items[slot], prev[slot]]).filter((id): id is number => id != null);
    setRecents((list) => [...new Set([...touched, ...list])].slice(0, 12));
  }, [look]);
  const toggleStar = useCallback(() => {
    if (outfits.current) {
      outfits.remove(outfits.current);
      announceOutfit('Unsaved', outfits.current.name);
    } else {
      setUndoLook(null);
      announceOutfit('Saved', outfits.save(look).name);
    }
  }, [outfits, look, announceOutfit]);

  // Announcements: a modal on first visit (and whenever a banner changes state,
  // e.g. goes live), reopenable from the header chip. Client-only: it depends on the clock.
  const [dropsOpen, setDropsOpen] = useState(false);
  const [dropsUnseen, setDropsUnseen] = useState(false);
  // Countdown labels (to the minute) read the clock at render, so re-render each minute.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const drops = useMemo(() => {
    if (dropNow == null) return [];
    const byId = new Map(bannerCards.filter((c) => c.type === 'crate' || c.type === 'style-coupon').map((c) => [c.id, c]));
    return announcements([...byId.keys()].flatMap((id) => CATALOG.banners[id] ?? []), dropNow);
  }, [dropNow, bannerCards]);
  const dropEntries = useMemo<DropEntry[]>(() => {
    const byId = new Map(bannerCards.map((c) => [c.id, c]));
    return drops.flatMap(({ banner }) => {
      const card = byId.get(banner.id);
      if (!card || (card.type !== 'crate' && card.type !== 'style-coupon')) return [];
      return [{ banner, typeLabel: card.typeLabel, kind: card.type, items: card.items }];
    });
  }, [drops, bannerCards]);
  const dropsAutoOpened = useRef(false);
  useEffect(() => {
    if (dropNow == null || dropsAutoOpened.current || !drops.length) return;
    dropsAutoOpened.current = true;
    const fresh = unseen(drops, loadSeen());
    setDropsUnseen(fresh.length > 0);
    if (fresh.length) setDropsOpen(true);
  }, [dropNow, drops]);
  const closeDrops = useCallback(() => {
    saveSeen(drops);
    setDropsOpen(false);
    setDropsUnseen(false);
  }, [drops]);
  // Show the banner at the top of its tab so the look they tried has its source in view.
  const revealDrop = useCallback((entry: DropEntry) => {
    setPinnedBanner(entry.banner.id);
    setCatSec(null);
    setViewTab(entry.kind === 'crate' ? 'crates' : 'styles');
    window.setTimeout(() => document.getElementById(`banner-title-${entry.banner.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);
  // The brand always returns to the main closet sheet with every filter cleared.
  const goHome = useCallback(() => {
    setViewTab('slots');
    setCatSec(null);
    setCrateFilter(null);
    setPinnedBanner(null);
    setViewMenuOpen(false);
    setSearchScope(null);
    setQ('');
    setCatQ('');
    document.getElementById('slot-list')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const tryDrop = useCallback((entry: DropEntry) => {
    saveUndo();
    if (entry.kind === 'crate') {
      tryOnCrate(entry.items);
    } else {
      const fits = (i: DropEntry['items'][number]) => !i.sex || i.sex === 'u' || i.sex === look.sex;
      const pick = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];
      const hair = pick(entry.items.filter((i) => i.isHair && fits(i)));
      const face = pick(entry.items.filter((i) => i.sub === 'Face' && fits(i)));
      patch({
        ...(hair ? { hair: hair.id * 10 + look.hairCol } : {}),
        ...(face ? { face: faceVariantId(look.sex, faceStyleId(face.id), faceColorIndex(look.face)) } : {}),
      });
    }
    closeDrops();
    revealDrop(entry);
  }, [closeDrops, look.sex, look.hairCol, look.face, patch, revealDrop, saveUndo, tryOnCrate]);
  const openDrop = useCallback((entry: DropEntry) => {
    closeDrops();
    revealDrop(entry);
  }, [closeDrops, revealDrop]);
  useEffect(() => { lookSnapshotRef.current = look; }, [look]);
  useEffect(() => {
    if (!undoLook) return;
    const t = window.setTimeout(() => setUndoLook(null), 8000);
    return () => window.clearTimeout(t);
  }, [undoLook]);

  const shareLook = useCallback(async () => {
    const targetUrl = new URL(window.location.href);
    targetUrl.search = '';
    for (const [k, v] of new URLSearchParams(encodeLook(look))) targetUrl.searchParams.set(k, v);
    targetUrl.hash = '';
    const url = targetUrl.toString();
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (coarse && 'share' in navigator) {
      try {
        await navigator.share({ url });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (error) {
        // Dismissed sheet, or share failed — fall back to copying the link.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [look]);


  // O(1) worn inspection
  const hairMeta = getItem(CATALOG, look.hair);
  const faceMeta = getItem(CATALOG, look.face);

  const wornEquipList = Object.entries(look.items)
    .map(([k, v]) => ({ slot: k, id: v, meta: getItem(CATALOG, v) }));

  // Collect any non-attainable worn items
  const poses = weaponPoses(weaponSubOf(getItem(CATALOG, look.items.Weapon), look.wield));
  const wieldChoices = wieldOptions(getItem(CATALOG, look.items.Weapon));
  const wornWield = wieldChoice(getItem(CATALOG, look.items.Weapon), look.wield);
  // Keep a pose the worn weapon lacks (stale shared link) selectable instead of a blank picker.
  if (!poses.some((p) => p.anim === look.anim)) poses.push({ anim: look.anim, label: look.anim });
  const frameCount = look.anim === 'jump' ? 1 : look.anim in ATTACK_FRAMES ? ATTACK_FRAMES[look.anim]! : look.anim.startsWith('stand') ? 3 : Infinity;
  const maxFrame = frameCount - 1;
  const wornAttainable = (m: { attainable: boolean; bannerId: string }) => attainableNow(m.attainable, getBanner(CATALOG, m.bannerId), Date.now());
  const unattainableWorn = [
    hairMeta && !wornAttainable(hairMeta) ? { type: 'Hair', id: look.hair, meta: hairMeta } : null,
    faceMeta && !wornAttainable(faceMeta) ? { type: 'Face', id: look.face, meta: faceMeta } : null,
    ...wornEquipList.filter((e) => e.meta && !wornAttainable(e.meta)).map((e) => ({ type: e.slot, id: e.id!, meta: e.meta! })),
  ].filter(Boolean) as Array<{ type: string; id: number; meta: ResolvedItem }>;

  // Side rail order: head to feet. Hair and Face are single merged sections —
  // the drawer breaks each into Mystery / Signature / Starter / Past groups.
  const railSlots = useMemo(() => {
    const slots: Array<{ id: SectionId; label: string }> = [
      { id: 'Hair', label: 'Hair' },
      { id: 'Face', label: 'Face' },
    ];
    const order: SectionId[] = ['Hat', 'Top', 'Bottom', 'Overall', 'Shoes', 'Glove', 'Weapon', 'Shield', 'Cape', 'Accessories'];
    for (const id of order) {
      const section = equipSections.find((sec) => sec.id === id);
      if (section && section.ids.length > 0) slots.push({ id, label: section.label });
    }
    return slots;
  }, [equipSections]);
  // Items shown as mini-tiles in each rail slot row.
  // Hair/Face: all styles (mystery + signature + starter + past).
  // Equip slots: items for the slot; matching job gear sorted to the front.
  const railItems = useMemo(() => {
    const levelOf = (row: CatRow) => row.type === 'hair' ? -1 : (CATALOG.items[row.id]?.requiredLevel ?? -1);
    const nameOf = (row: CatRow) => row.type === 'hair' ? (CATALOG.styles[row.id]?.name ?? '') : (CATALOG.items[row.id]?.name ?? '');
    const mismatchOf = (row: CatRow) => row.type === 'item' && !matchesJob(CATALOG.items[row.id], job) ? true : false;
    const tierOf = (row: CatRow) => row.type === 'item' ? jobTier(CATALOG.items[row.id], job) : 0;
    const sexMismatchOf = (row: CatRow) => {
      const sex = row.type === 'hair' ? CATALOG.styles[row.id]?.sex : CATALOG.items[row.id]?.sex;
      return sex && sex !== 'u' && sex !== look.sex ? 1 : 0;
    };
    // Hair/Face rails lead with Mystery, then Signature, then starter/past.
    const couponRank = (coupon: string | undefined, attainable: boolean | undefined) => coupon === 'mystery' && attainable ? 0 : coupon === 'signature' && attainable ? 1 : 2;
    const rankOf = (row: CatRow) => row.type === 'hair'
      ? couponRank(CATALOG.styles[row.id]?.coupon, CATALOG.styles[row.id]?.attainable)
      : CATALOG.items[row.id]?.sub === 'Face'
        ? couponRank(CATALOG.items[row.id]?.coupon, CATALOG.items[row.id]?.attainable)
        : bannerRank(CATALOG.items[row.id]);
    const restSort = (a: CatRow & { mismatch?: boolean; sexMismatch?: number; tier?: number }, b: CatRow & { mismatch?: boolean; sexMismatch?: number; tier?: number }) =>
      (a.sexMismatch ?? 0) - (b.sexMismatch ?? 0) ||
      (a.tier ?? 0) - (b.tier ?? 0) ||
      (job !== 'All' && (a.tier ?? 0) === 0 ? levelOf(a) - levelOf(b) : rankOf(a) - rankOf(b)) ||
      levelOf(a) - levelOf(b) ||
      nameOf(a).localeCompare(nameOf(b));
    const sortRows = (rows: CatRow[]) => {
      const flagged = rows.map((row) => ({ ...row, mismatch: mismatchOf(row), sexMismatch: sexMismatchOf(row), tier: tierOf(row) }));
      return flagged.sort(restSort);
    };
    const result: Record<string, CatRow[]> = {};
    const crateGroup = CRATE_CHIPS.find((c) => c.bannerId === crateFilter)?.group;
    for (const slot of railSlots) {
      if (crateGroup && (slot.id === 'Hair' || slot.id === 'Face')) {
        result[slot.id] = [];
      } else if (slot.id === 'Hair') {
        result[slot.id] = sortRows([...mysteryHairs, ...signatureHairs, ...starterHairStyles, ...pastHairStyles].map((id) => ({ type: 'hair' as const, id })));
      } else if (slot.id === 'Face') {
        result[slot.id] = sortRows([...mysteryFaces, ...signatureFaces, ...starterFaces, ...pastFaces].map((id) => ({ type: 'item' as const, id })));
      } else {
        const ids = equipSections.find((s) => s.id === slot.id)?.ids ?? [];
        result[slot.id] = sortRows(ids.filter((id) => crateGroup ? CATALOG.items[id]?.group === crateGroup : CATALOG.items[id]?.bannerId !== 'unreleased').map((id) => ({ type: 'item' as const, id })));
      }
    }
    return result;
  }, [railSlots, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces, equipSections, job, look.sex, crateFilter]);


  // Play mode: a pad drives the preview with a pose override (see play-controller).
  const stopPlay = useCallback(() => setController(null), []);
  const startPlay = useCallback((): PlayController | null => {
    const element = document.getElementById('preview');
    if (!element) return null;
    setSettingsOpen(false);
    const next = new PlayController(element, () => {
      const weapon = getItem(CATALOG, lookRef.current.items.Weapon);
      return { id: lookRef.current.items.Weapon ?? undefined, variant: weaponVariant(weapon, lookRef.current.wield), sub: weaponSubOf(weapon, lookRef.current.wield), level: autoSwipeLevel(weapon?.requiredLevel) };
    });
    setController(next);
    return next;
  }, []);
  // Desktop: WASD / arrows start play mode straight away (like the cash shop preview);
  // the pressed key is carried into the new controller so the first step isn't lost.
  const idleKeys = useRef({ blocked: false, start: startPlay });
  idleKeys.current = { blocked: !!controller || settingsOpen || ratesOpen || emoteOpen, start: startPlay };
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 900px)');
    const onKeyDown = (event: KeyboardEvent) => {
      if (idleKeys.current.blocked || !desktop.matches || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const input = key === 'ArrowLeft' || key === 'a' ? 'left' : key === 'ArrowRight' || key === 'd' ? 'right' : key === 'ArrowDown' || key === 's' ? 'down' : key === 'ArrowUp' || key === 'w' ? 'jump' : null;
      if (!input) return;
      const started = idleKeys.current.start();
      if (!started) return;
      idleKeys.current.blocked = true;
      event.preventDefault();
      started.set(input, true);
      // GamePad's own keyup listener isn't mounted yet; release this first key ourselves.
      window.addEventListener('keyup', (up) => {
        if ((up.key.length === 1 ? up.key.toLowerCase() : up.key) === key) started.set(input, false);
      }, { once: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    if (!controller) return;
    controller.start();
    return () => controller.stop();
  }, [controller]);
  // Decode the worn look's walk/duck/attack frames up front so the first steps don't stutter.
  useEffect(() => {
    if (controller) void warmPoses(look, PLAY_POSES, SPRITE_CANVAS);
  }, [controller, look]);

  // Drag the sheet down: it follows the finger while the stage grows to show the whole
  // character; letting go past the threshold starts play mode, otherwise it snaps back.
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dragGate = useRef({ locked: false, start: startPlay });
  dragGate.current = { locked: !!controller, start: startPlay };
  useEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    if (!root || !rail) return;
    const phone = window.matchMedia('(max-width: 899px)');
    let drag: { x: number; y: number; t: number; atTop: boolean; active: boolean; max: number; pull: number } | null = null;
    const setPull = (px: number | null) => {
      if (px === null) root.style.removeProperty('--pull');
      else root.style.setProperty('--pull', `${px}px`);
    };
    const onStart = (event: TouchEvent) => {
      if (!phone.matches || dragGate.current.locked || event.touches.length !== 1) return;
      const scroller = (event.target as HTMLElement).closest('#slot-list, #drawer');
      const stage = root.querySelector<HTMLElement>('#stage');
      const touch = event.touches[0]!;
      drag = {
        x: touch.clientX, y: touch.clientY, t: event.timeStamp, atTop: !scroller || scroller.scrollTop <= 0, active: false, pull: 0,
        // Same height play mode gives the stage (see .mf.playing #stage).
        max: Math.max(0, window.innerHeight - 190 - (stage?.offsetHeight ?? 0)),
      };
    };
    const onMove = (event: TouchEvent) => {
      if (!drag) return;
      const touch = event.touches[0]!;
      const dy = touch.clientY - drag.y;
      if (!drag.active) {
        if (!drag.atTop || dy < -8 || Math.abs(touch.clientX - drag.x) > Math.abs(dy)) { if (dy < -8) drag = null; return; }
        if (dy < 8) return;
        drag.active = true;
        root.classList.add('dragging');
      }
      if (event.cancelable) event.preventDefault();
      drag.pull = Math.max(0, Math.min(drag.max, dy));
      setPull(drag.pull);
    };
    const onEnd = (event: TouchEvent) => {
      const finished = drag;
      drag = null;
      if (!finished?.active) return;
      root.classList.remove('dragging');
      setPull(null);
      // Play needs a long, steady pull. A quick flick (scrolling back up the list
      // and overshooting) is too fast to be intentional and just snaps back.
      const speed = finished.pull / Math.max(1, event.timeStamp - finished.t);
      if (event.type === 'touchend' && finished.pull > Math.min(220, finished.max * 0.7) && speed < 1.2) dragGate.current.start();
    };
    rail.addEventListener('touchstart', onStart, { passive: true });
    rail.addEventListener('touchmove', onMove, { passive: false });
    rail.addEventListener('touchend', onEnd);
    rail.addEventListener('touchcancel', onEnd);
    return () => {
      rail.removeEventListener('touchstart', onStart);
      rail.removeEventListener('touchmove', onMove);
      rail.removeEventListener('touchend', onEnd);
      rail.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const crateBar = (
    <div id="crate-bar" role="group" aria-label="Filter by crate">
      <button type="button" className={'crate-chip' + (!crateFilter ? ' on' : '')} aria-pressed={!crateFilter} onClick={() => setCrateFilter(null)}>All</button>
      {CRATE_CHIPS.flatMap((chip) => {
        const banner = CATALOG.banners[chip.bannerId];
        const info = banner ? dropInfo(banner, dropNow ?? Date.now()) : null;
        if (!banner || !info || info.state === 'ended') return [];
        const time = info.state === 'upcoming' ? 'Soon' : info.isNew ? 'NEW' : formatCountdown(banner, true);
        return [(
          <button
            key={chip.bannerId}
            type="button"
            className={'crate-chip' + (crateFilter === chip.bannerId ? ' on' : '') + (info.state === 'upcoming' ? ' upcoming' : '')}
            aria-pressed={crateFilter === chip.bannerId}
            onClick={() => setCrateFilter(crateFilter === chip.bannerId ? null : chip.bannerId)}
          >
            <span aria-hidden="true">{chip.icon}</span> {chip.label}
            {time && <em className={'crate-chip-time' + (info.endingSoon ? ' soon' : info.isNew ? ' new' : '')}>{time}</em>}
          </button>
        )];
      })}
      {crateFilter && (
        <button
          type="button"
          className="crate-chip crate-shuffle"
          title="Wear a random coordinated outfit from this crate"
          onClick={() => {
            const group = CRATE_CHIPS.find((c) => c.bannerId === crateFilter)?.group;
            if (!group) return;
            saveUndo();
            tryOnCrate(getGroupEquips(group).flatMap((id) => CATALOG.items[id] ? [{ id, sub: CATALOG.items[id].sub, sex: CATALOG.items[id].sex }] : []));
          }}
        >
          🎲 Shuffle
        </button>
      )}
    </div>
  );

  const drawerTitle = useMemo(() => {
    if (!catSec) return '';
    return EQUIP_SECTIONS.find((section) => section.id === catSec)?.label ?? (catSec === 'Hair'
      ? 'Hair'
      : catSec === 'Face'
        ? 'Face'
        : catSec === 'founder-crate'
          ? "Founder's Crate"
          : catSec === 'halloween-crate'
            ? 'Halloween Crate'
          : catSec === 'mystery-crate'
            ? 'Mystery Crate'
          : catSec === 'aurora-crate'
            ? 'Aurora Crate'
            : '10-Day Covers · 700–1,200 NX');
  }, [catSec]);

  return (
    <div ref={rootRef} className={'mf' + (controller ? ' playing' : '')}>
      <div id="stage" className={comparing ? 'comparing' : undefined}>
        <div id="controls">
          <button id="avatar" onClick={() => setSettingsOpen(v => !v)} aria-label="Edit character" aria-expanded={settingsOpen} aria-controls="settings"><canvas ref={avatarRef} width={AVATAR_PX} height={AVATAR_PX} aria-hidden="true" /></button>
          <div className="controls-right">
            <div id="gender-toggle" className="gender-toggle" role="group" aria-label="Character gender">
              <button
                type="button"
                className={`gender-toggle-btn m ${look.sex === 'm' ? 'active' : ''}`}
                onClick={() => setSex('m')}
                aria-pressed={look.sex === 'm'}
                title="Switch to Male character and items"
              >
                <GenderIcon sex="m" />
                <span className="gender-label">Male</span>
              </button>
              <button
                type="button"
                className={`gender-toggle-btn f ${look.sex === 'f' ? 'active' : ''}`}
                onClick={() => setSex('f')}
                aria-pressed={look.sex === 'f'}
                title="Switch to Female character and items"
              >
                <GenderIcon sex="f" />
                <span className="gender-label">Female</span>
              </button>
            </div>
            <button id="share" className="labeled-btn" onClick={shareLook} aria-label="Share this look" title={shared ? 'Shared!' : copied ? 'Link copied!' : 'Share this look'}><Icon name={copied || shared ? 'check' : 'share'} /><span>{copied || shared ? 'Copied' : 'Share'}</span></button>
            <button id="play" className="labeled-btn" onClick={() => controller ? stopPlay() : startPlay()} aria-label={controller ? 'Back to closet' : 'Move your character'} aria-pressed={!!controller} title="Move your character"><Icon name="play" /><span>{controller ? 'Closet' : 'Play'}</span></button>
            <button id="shuffle" className="labeled-btn" onClick={() => { saveUndo(); setLook(randomLook(look.sex, Math.random, excludedSlots, nxOnly, job === 'All' ? 'Beginner' : job)); }} aria-label="Randomize outfit"><Icon name="shuffle" /><span>Random</span></button>
          </div>
        </div>
        <div id="canvas">
          <LayeredCharacterCanvas look={look} onRendered={(canvas) => { setRendering(false); drawAvatar(canvas); }} />
          {rendering && <div id="spin" />}
          {pin && comparing && (
            <CompareView
              a={pin.look}
              b={look}
              normalize={normalizeStance}
            />
          )}
          {!comparing && (
            <div className="name-row">
              {editingName
                ? <input className="name-tag editing" autoFocus value={look.name ?? ''} maxLength={NAME_MAX} placeholder="Your name" aria-label="Your name" autoComplete="off" autoCorrect="off" spellCheck={false}
                    onChange={(e) => patch({ name: cleanName(e.target.value) })}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
                : <button type="button" className={'name-tag' + (look.name ? '' : ' empty')} onClick={() => setEditingName(true)} title="Edit name">{look.name ? String(look.name) : 'Your name'}</button>}
              <button type="button" className={'pg-save' + (outfits.current ? ' on' : '')} onClick={toggleStar} aria-pressed={!!outfits.current}
                aria-label={outfits.current ? 'Saved. Tap to remove' : 'Save this outfit'} title={outfits.current ? 'Saved. Tap to remove' : 'Save this outfit'}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill={outfits.current ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
                {outfits.current ? 'Saved' : 'Save'}
              </button>
            </div>
          )}
          {!controller && (
            <div className="pg-bar">
              {!comparing && (
                <button type="button" className={'pg-toggle pg-emote-btn' + (look.emote ? ' has-emote' : '')} onClick={() => setEmoteOpen(true)}
                  aria-haspopup="true" aria-label="Face emotes" title="Face emotes">
                  {emoteSprites[look.emote ?? PREVIEW_EMOTE] && <img src={emoteSprites[look.emote ?? PREVIEW_EMOTE]} alt="" draggable={false} />}
                </button>
              )}
              {recents.length > 0 && (
                <div className="pg-recent" role="toolbar" aria-label="Recently changed items">
                  {recents.map((id) => {
                    const meta = getItem(CATALOG, id);
                    const worn = Object.values(look.items).includes(id);
                    return (
                      <button key={id} type="button" className={worn ? 'worn' : undefined} aria-pressed={worn} title={meta?.name ?? `#${id}`}
                        aria-label={`${worn ? 'Wearing' : 'Wear'} ${meta?.name ?? id}`}
                        onClick={() => { if (!worn && meta) wearItemById(id, meta.sub); }}>
                        <img src={iconURL(id)} alt="" draggable={false} onError={(e) => { const next = iconFallbackURL(e.currentTarget.src); if (next) e.currentTarget.src = next; else e.currentTarget.style.visibility = 'hidden'; }} />
                      </button>
                    );
                  })}
                </div>
              )}
              {pin && comparing && outfitKey(pin.look) !== outfitKey(look) && (
                <button type="button" className="pg-apply" onClick={() => setPin(null)} title="Keep the outfit on the right">Apply</button>
              )}
              <button type="button" className={'pg-toggle' + (comparing ? ' on' : '')} onClick={toggleCompare} aria-pressed={comparing}
                aria-label="Compare outfits" title={comparing ? 'Leave compare' : 'Pin this outfit and try others beside it'}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M12 4v16" /><path d="m9 9.5-2.5 2.5L9 14.5" /><path d="m15 9.5 2.5 2.5-2.5 2.5" /></svg>
              </button>
            </div>
          )}
          {emoteOpen && !comparing && !controller && (
            <EmoteCarousel faceId={look.face} value={look.emote} onPick={(emote) => patch({ emote })} onClose={() => setEmoteOpen(false)} />
          )}
          {undoLook && <div className="undo-bar" role="status"><span>Outfit changed</span><button type="button" onClick={(e) => { e.stopPropagation(); setLook(undoLook); setUndoLook(null); }}>Undo</button><button type="button" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); setUndoLook(null); }}>×</button></div>}
          {wieldNotice && wieldNotice.id === look.items.Weapon && (
            <div className="wield-notice" role="status">
              <span>{wieldNotice.name} only fits {wieldNotice.types.join(', ')}, not {wieldNotice.held}. Wielding as <b>{wieldNotice.applied}</b>.</span>
              {wieldNotice.types.filter((type) => type !== wieldNotice.applied).map((type) => <button key={type} type="button" onClick={(e) => { e.stopPropagation(); chooseWield(type); }}>{type}</button>)}
              <button type="button" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); setWieldNotice(null); }}>×</button>
            </div>
          )}
          <div className="equip-toast-slot" role="status" aria-live="polite" aria-atomic="true">
            {equipToast && <div className="equip-toast" key={equipToast.sequence}>
              {equipToast.id == null
                ? <svg viewBox="0 0 24 24" width="24" height="24" fill={equipToast.action === 'Saved' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
                : <img src={iconURL(equipToast.id)} alt="" onError={(e) => { const next = iconFallbackURL(e.currentTarget.src); if (next) e.currentTarget.src = next; }} />}
              <div><span>{equipToast.action} {equipToast.name}</span>{equipToast.replaced && <small>{equipToast.replaced}</small>}</div>
            </div>}
          </div>
        </div>
        </div>
      {controller && <GamePad controller={controller} onExit={stopPlay} wield={{ choices: wieldChoices, value: wornWield, onChange: chooseWield }} />}
      {dropsOpen && dropEntries.length > 0 && (
        <DropModal entries={dropEntries} onTry={tryDrop} onOpen={openDrop} onClose={closeDrops} />
      )}
      {settingsOpen && (
        <div className="settings-scrim" aria-hidden="true" onClick={() => setSettingsOpen(false)} />
      )}
      {settingsOpen && (
        <div id="settings" role="dialog" aria-label="My character">
          <header className="settings-head">
            <h2>My character</h2>
          </header>
          {unattainableWorn.length > 0 && <div className="worn-alert">
            {unattainableWorn.map(w => `${w.meta.name}: ${formatAttainableInfo(CATALOG, w.id).statusText}`).join(' · ')}
          </div>}
          <section className="set-card">
            <CharacterEditor look={look} skins={skins} onName={(name) => patch({ name })} onSex={setSex} onSkin={(skin) => patch({ skin })} />
          </section>
          <section className="set-card">
            <div className="setrow">
              <span>class</span>
              <select aria-label="Choose class and weapon" value={job === 'All' ? 'Beginner' : job} onChange={(e) => chooseClass(e.target.value)}>
                {['Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'].map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <span className="class-weapon" title={getItem(CATALOG, look.items.Weapon)?.name ?? 'Choose a weapon'}>
                {getItem(CATALOG, look.items.Weapon)?.name ?? 'No weapon'}
              </span>
            </div>
            <div className="setrow">
              <span>pose</span>
              <select value={look.anim} onChange={(e) => patch({ anim: e.target.value, frame: 0 })} aria-label="Pose">
                {poses.map((p) => <option key={p.anim} value={p.anim}>{p.label}</option>)}
              </select>
              <button onClick={() => patch({ frame: Math.max(0, look.frame - 1) })} aria-label="Previous frame">‹</button>
              <span className="frame-num">{Number.isFinite(frameCount) ? `Frame ${look.frame + 1}/${frameCount}` : `Frame ${look.frame + 1}`}</span>
              <button onClick={() => patch({ frame: Math.min(maxFrame, look.frame + 1) })} aria-label="Next frame">›</button>
            </div>
            <div className="setrow">
              <span>emote</span>
              <select value={look.emote ?? ''} onChange={(e) => patch({ emote: e.target.value || undefined })} aria-label="Face emote">
                <option value="">Default</option>
                <optgroup label="Classic hotkeys">
                  {EMOTES.filter((emote) => emote.key).map((emote) => <option key={emote.id} value={emote.id}>{emote.key} · {emote.label}</option>)}
                </optgroup>
                <optgroup label="Unreleased">
                  {EMOTES.filter((emote) => !emote.key).map((emote) => <option key={emote.id} value={emote.id}>{emote.label}</option>)}
                </optgroup>
              </select>
            </div>
          </section>
          <details className="set-card randomizer-options">
            <summary>Randomizer options</summary>
            <div className="randomizer-slots">
              <label><input type="checkbox" checked={nxOnly} onChange={e => setNxOnly(e.target.checked)} /> NX outfit + classic weapon</label>
            </div>
            <div className="randomizer-slots">
              {RANDOM_EQUIP_SLOTS.map(slot => <label key={slot}>
                <input type="checkbox" checked={excludedSlots.includes(slot)} onChange={e => setExcludedSlots(current => e.target.checked ? [...current, slot] : current.filter(value => value !== slot))} />
                No {({ Hat: 'hat', Top: 'shirt', Bottom: 'pants', Shoes: 'shoes', Glove: 'gloves', Cape: 'cape', Weapon: 'weapon' })[slot]}
              </label>)}
            </div>
          </details>
          <footer className="settings-actions">
            <button className="primary" onClick={shareLook}><Icon name={copied || shared ? 'check' : 'share'} />{copied || shared ? 'Copied!' : 'Share look'}</button>
            <button onClick={() => { saveUndo(); setLook((l) => ({ ...l, items: {} })); }}>Clear worn</button>
          </footer>
        </div>
    )}

    <div id="rail" ref={railRef}>
      <div id="rail-grip" aria-hidden="true"><span /><small>Drag down to play</small></div>
        <div id="rail-head">
          {searchScope === 'all' ? (
            <div className="head-search" role="search">
              <input id="item-search" autoFocus aria-label="Search all items" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearchScope(null); setQ(''); } }} placeholder="Search all items…" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              <button className="search-toggle" aria-label="Close search" onClick={() => { setSearchScope(null); setQ(''); }}><Icon name="close" /></button>
            </div>
          ) : (
            <>
              <div className="rail-head-brand">
                <h1 id="brand">
                  <button type="button" className="brand-home" onClick={goHome} aria-label="Classic Closet: back to the main closet">
                    <img className="brand-leaf" src="/leaf.png" alt="" width="22" height="22" />
                    Classic Closet
                  </button>
                </h1>
                <a className="site-credit" href="https://builtby.win/ston" target="_blank" rel="noopener noreferrer">by ston</a>
              </div>
              <div className="rail-head-actions">
                {drops.length > 0 && (
                  <button type="button" className="rail-head-btn drops-chip" onClick={() => setDropsOpen(true)} aria-label="What's new" title="What's new">
                    <span aria-hidden="true">✨</span>
                    {dropsUnseen && <i className="drops-dot" aria-hidden="true" />}
                  </button>
                )}
                <div className="view-menu-wrap" ref={viewMenuRef}>
                  <button
                    type="button"
                    className="rail-head-btn view-btn"
                    onClick={() => setViewMenuOpen((v) => !v)}
                    aria-expanded={viewMenuOpen}
                    aria-haspopup="menu"
                    aria-label={`View: ${VIEW_OPTIONS[viewTab].label}. Tap to switch.`}
                    title="Switch view: Closet, Limited Shop, Crates, Styles"
                  >
                    <span className="view-btn-icon">{VIEW_OPTIONS[viewTab].icon}</span>
                    <span className="view-btn-label">{VIEW_OPTIONS[viewTab].shortLabel}</span>
                    <svg className="view-btn-caret" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
                    </svg>
                  </button>
                  {viewMenuOpen && (
                    <div className="view-menu-dropdown" role="menu">
                      {(Object.keys(VIEW_OPTIONS) as ViewTab[]).map((tab) => {
                        const opt = VIEW_OPTIONS[tab];
                        const isSelected = viewTab === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            role="menuitem"
                            className={`view-menu-option ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setViewTab(tab);
                              setViewMenuOpen(false);
                            }}
                          >
                            <span className="view-menu-icon">{opt.icon}</span>
                            <div className="view-menu-info">
                              <span className="view-menu-title">{opt.label}</span>
                              <span className="view-menu-desc">{opt.desc}</span>
                            </div>
                            {isSelected && (
                              <svg className="view-menu-check" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m3.5 8.5 3 3 6-7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {viewTab !== 'slots' && viewTab !== 'outfits' && (
                  <button
                    type="button"
                    className={`rail-head-btn sort-btn ${bannerSort}`}
                    onClick={() => setBannerSort((s) => s === 'date-asc' ? 'crates-first' : s === 'crates-first' ? 'date-desc' : 'date-asc')}
                    aria-label={`Sort: ${bannerSort === 'crates-first' ? 'Crates first' : bannerSort === 'date-asc' ? 'Expiring soonest' : 'Newest'}. Tap to cycle.`}
                    title={`Sort: ${bannerSort === 'crates-first' ? 'Crates first' : bannerSort === 'date-asc' ? 'Expiring soonest' : 'Newest'} (click to cycle)`}
                  >
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.5 3v10M4.5 3 2 5.5M4.5 3 7 5.5M11.5 13V3M11.5 13 9 10.5M11.5 13 14 10.5" />
                    </svg>
                    <span className="sort-btn-label">{bannerSort === 'crates-first' ? 'Crates 1st' : bannerSort === 'date-asc' ? 'Expiring' : 'Newest'}</span>
                  </button>
                )}
                <button className="search-toggle" aria-label="Search items" aria-expanded={false} aria-controls="item-search" onClick={() => { setCatSec(null); setCatQ(''); setSearchScope('all'); setQ(''); }}><Icon name="search" /></button>
              </div>
            </>
          )}
        </div>

        {viewTab === 'slots' ? (
          <>
            {crateBar}
            <div id="slot-list" role="list" aria-label="Equipped items, head to feet">
              <div id="job-bar" role="group" aria-label="Filter by class">
                {JOBS.map((j) => (
                  <button key={j} type="button" className={'job-pill' + (job === j ? ' on' : '')} aria-pressed={job === j} onClick={() => setJob(j)} title={j === 'All' ? 'Show all classes' : `Sort ${j} equips to top`}>
                    {j === 'All' ? 'All' : j}
                  </button>
                ))}
              </div>
              {q.trim() && railSlots.every((slot) => !(railItems[slot.id] ?? []).some((row) => matchesFuzzy(row.type === 'hair' ? CATALOG.styles[row.id]?.name : CATALOG.items[row.id]?.name, row.id, q.trim().toLowerCase()))) && (
                <p className="slot-hint">No items match “{q.trim()}”. <button type="button" className="inline-link" onClick={() => setQ('')}>Clear search</button></p>
              )}
              {railSlots.map((slot) => {
                // Unreleased styles live outside railItems (drawer group only),
                // so fold them into the pool when searching.
                const pool = q.trim() && slot.id !== 'Hair' && slot.id !== 'Face'
                  ? [...(railItems[slot.id] ?? []), ...getGroupEquips('unreleased').filter((id) => equipSlot(CATALOG.items[id]?.sub ?? '') === slot.id || (slot.id === 'Accessories' && !EQUIP_SECTIONS.some((sec) => sec.id === equipSlot(CATALOG.items[id]?.sub ?? '')))).map((id): CatRow => ({ type: 'item' as const, id }))]
                  : q.trim() && (slot.id === 'Hair' || slot.id === 'Face')
                  ? [...(railItems[slot.id] ?? []),
                      ...(slot.id === 'Hair' ? unreleasedHairStyles : unreleasedFaces).map((id): CatRow => ({
                        type: slot.id === 'Hair' ? 'hair' : 'item',
                        id,
                        sexMismatch: ((slot.id === 'Hair' ? CATALOG.styles[id]?.sex : CATALOG.items[id]?.sex) ?? look.sex) !== 'u'
                          && (slot.id === 'Hair' ? CATALOG.styles[id]?.sex : CATALOG.items[id]?.sex) !== look.sex ? 1 : 0,
                      }))]
                  : (railItems[slot.id] ?? []);
                const matchedRows = pool.filter(row => matchesFuzzy(row.type === 'hair' ? CATALOG.styles[row.id]?.name : CATALOG.items[row.id]?.name, row.id, q.trim().toLowerCase()));
                const items = slot.id === 'Weapon' && weaponGroup ? matchedRows.filter((row) => weaponInGroup(CATALOG.items[row.id], weaponGroup)) : matchedRows;
                if ((q.trim() || crateFilter) && !items.length) return null;
                // Faces match by style (color variants share one tile) — first
                // match wins so at most one tile ever shows selected.
                const wornFaceRow = slot.id === 'Face'
                  ? items.find((row) => row.type === 'item' && faceStyleId(look.face) === faceStyleId(row.id) && ((look.face >= 21000) === (row.id >= 21000)))?.id
                  : undefined;
                const featuredExpiryBanner = items.slice(0, RAIL_PREVIEW).map((row) => {
                  const bannerId = row.type === 'hair' ? CATALOG.styles[row.id]?.bannerId : CATALOG.items[row.id]?.bannerId;
                  return bannerId ? getBanner(CATALOG, bannerId) : null;
                }).find((b) => b?.end);
                const featuredDrop = featuredExpiryBanner ? dropInfo(featuredExpiryBanner, Date.now()) : null;
                const expiryLabel = featuredDrop?.state === 'upcoming' && featuredDrop.startsInMs != null
                  ? `drops in ${formatHM(featuredDrop.startsInMs)}`
                  : featuredDrop?.endsInMs != null && featuredDrop.endsInMs > 0
                    ? (featuredDrop.endsInMs < 86_400_000 ? 'ends today' : `${Math.ceil(featuredDrop.endsInMs / 86_400_000)}d left`)
                    : null;
                return (
                  <div
                    key={slot.id}
                    role="listitem"
                    className={'slot-row' + (catSec === slot.id ? ' on' : '')}
                  >
                    <div className="slot-head">
                      <div className="slot-title-wrap">
                        <span className="slot-label">{slot.label}</span>
                        {(() => {
                          const wornName = slot.id === 'Hair' ? getStyle(CATALOG, Math.floor(look.hair / 10))?.name
                            : slot.id === 'Face' ? getItem(CATALOG, look.face)?.name
                            : look.items[slot.id] ? getItem(CATALOG, look.items[slot.id])?.name : undefined;
                          const wornId = slot.id !== 'Hair' && slot.id !== 'Face' ? look.items[slot.id] : undefined;
                          return wornName ? <span className="slot-worn">{wornName}{wornId ? <button type="button" className="slot-remove" aria-label={`Remove ${wornName}`} title={`Remove ${wornName}`} onClick={() => { const it = getItem(CATALOG, wornId); if (it) wearItemById(wornId, it.sub); }}>×</button> : null}</span> : null;
                        })()}
                        {expiryLabel && <span suppressHydrationWarning className="slot-expiry">· 🕒 {expiryLabel}</span>}
                      </div>
                      <button className="slot-seeall" aria-label={`See all ${slot.label}`} onClick={() => { openCat(slot.id); setCatQ(q); }}>See all →</button>
                    </div>
                    {slot.id === 'Weapon' && (() => {
                      const wornSub = weaponSubOf(getItem(CATALOG, look.items.Weapon), look.wield);
                      return (
                        <div className="slot-stance">
                          <WeaponGroupFilter value={weaponGroup} onChange={chooseWeaponGroup} />
                          {wornSub && <WieldPicker choices={wieldChoices.length > 1 ? wieldChoices : [wornSub]} value={wieldChoices.length > 1 ? wornWield : wornSub} onChange={chooseWield} />}
                        </div>
                      );
                    })()}
                    {(slot.id === 'Hair' || slot.id === 'Face') && <div className="rail-colors" role="group" aria-label={slot.id === 'Hair' ? 'Hair color' : 'Eye color'}>
                      {(slot.id === 'Hair' ? HAIR_COLORS : EYE_COLORS).map((color, i) => <ColorSwatch key={color} color={color} dot={(slot.id === 'Hair' ? HAIR_DOTS : EYE_DOTS)[i]} selected={(slot.id === 'Hair' ? look.hairCol : faceColorIndex(look.face)) === i} onClick={() => slot.id === 'Hair' ? patch({ hair: Math.floor(look.hair / 10) * 10 + i, hairCol: i }) : patch({ face: faceVariantId(look.face >= 21000 ? 'f' : 'm', faceStyleId(look.face), i) })} />)}
                    </div>}
                    <div className="slot-tiles">
                      {(() => {
                        // Pin the worn tile into the featured six so the saved
                        // style is always visible, not cut off down the list.
                        const featured = items.slice(0, RAIL_PREVIEW);
                        const wornIdx = items.findIndex((row) => row.type === 'hair'
                          ? Math.floor(look.hair / 10) === row.id
                          : row.id === wornFaceRow || Object.values(look.items).includes(row.id));
                        if (wornIdx >= RAIL_PREVIEW) featured[RAIL_PREVIEW - 1] = items[wornIdx]!;
                        return featured.map((row) => {
                          if (row.type === 'hair') {
                            const meta = getStyle(CATALOG, row.id);
                            if (!meta) return null;
                            return (
                              <Tile
                                key={row.id}
                                mini
                                on={Math.floor(look.hair / 10) === row.id}
                                img={iconURL(row.id * 10 + look.hairCol)}
                                label={meta.name}
                                coupon={meta.coupon}
                                bannerId={meta.bannerId}
                                attainable={meta.attainable}
                                gender={meta.sex}
                                onClick={() => wearItemById(row.id * 10 + look.hairCol, 'Hair')}
                              />
                            );
                          }
                          const item = getItem(CATALOG, row.id);
                          if (!item) return null;
                          const faceSex: Sex = item.sex === 'f' || row.id >= 21000 ? 'f' : 'm';
                          const faceId = item.sub === 'Face' ? faceVariantId(faceSex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                          const worn = item.sub === 'Face' ? row.id === wornFaceRow : Object.values(look.items).includes(row.id);
                          return (
                            <Tile
                              key={row.id}
                              mini
                              on={worn}
                              img={iconURL(faceId)}
                              label={item.name}
                              coupon={item.coupon}
                              bannerId={item.bannerId}
                              attainable={item.attainable}
                              gender={item.sex}
                              mismatched={row.mismatch}
                              mismatchJob={row.mismatch ? item.requiredJobs?.find((j) => j !== 'Beginner') : undefined}
                              onClick={() => wearItemById(row.id, item.sub)}
                            />
                          );
                        });
                      })()}
                      {items.length > RAIL_PREVIEW && (
                        <button type="button" className="slot-more" aria-label={`See all ${slot.label}`} onClick={() => { openCat(slot.id); setCatQ(q); }}>
                          +{items.length - RAIL_PREVIEW}<span>See all</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : viewTab === 'outfits' ? (
          <OutfitsPanel
            saved={outfits.saved}
            currentKey={outfits.key}
            normalize={normalizeStance}
            onWear={wearOutfit}
            onCompare={(outfit) => setPin({ look: outfit.look, name: outfit.name })}
            onRename={outfits.rename}
            onRemove={outfits.remove}
          />
        ) : (
          <>
          {viewTab !== 'styles' && crateBar}
          <div id="banner-list" role="list" aria-label="Limited shop and mystery crates">
            {displayedCards.map((card) => {
              const availableSlots = [...new Set(card.items.map((i) => (i.isHair ? 'Hair' : equipSlot(i.sub))))];
              const selectedSlots = crateSlotFilter[card.id];
              const isFiltered = Array.isArray(selectedSlots) && selectedSlots.length < availableSlots.length;
              const filteredItems = Array.isArray(selectedSlots)
                ? card.items.filter((i) => selectedSlots.includes(i.isHair ? 'Hair' : equipSlot(i.sub)))
                : card.items;
              const searchFiltered = q.trim()
                ? filteredItems.filter((i) => matchesFuzzy(i.name, i.id, q.trim().toLowerCase()))
                : filteredItems;
              if (q.trim() && !searchFiltered.length) return null;

              let filterButtonLabel = 'Slots: All';
              if (isFiltered) {
                if (!selectedSlots || selectedSlots.length === 0) {
                  filterButtonLabel = 'Slots: None';
                } else if (selectedSlots.length === 1) {
                  filterButtonLabel = `Slot: ${selectedSlots[0]}`;
                } else if (selectedSlots.length === 2) {
                  filterButtonLabel = `${selectedSlots[0]}, ${selectedSlots[1]}`;
                } else {
                  filterButtonLabel = `Slots: ${selectedSlots.length}/${availableSlots.length}`;
                }
              }

              return (
                <section key={card.id} className="banner-card" aria-labelledby={`banner-title-${card.id}`}>
                  <div className="banner-card-head">
                    <div className="banner-head-main">
                      <div className="banner-badge-row">
                        <span className={`banner-type-badge ${card.type}`}>{card.typeLabel}</span>
                        <span className={`banner-status-badge ${card.isActive ? 'active' : card.isUpcoming ? 'upcoming' : 'ended'}`}>
                          {card.statusText}
                        </span>
                        {card.start && card.end && (
                          <span className="banner-dates">🕒 {shortDate(card.start)} – {shortDate(card.end)}</span>
                        )}
                      </div>
                      <div className="banner-card-actions">
                        {card.type === 'crate' && (
                          <button
                            type="button"
                            className="banner-tryon-btn"
                            onClick={() => { saveUndo(); tryOnCrate(card.items); }}
                            title="Try on a random coordinated outfit from this crate"
                          >
                            🎲 Try Crate Look
                          </button>
                        )}
                        {card.rates && (
                          <button
                            type="button"
                            className="banner-rates-btn"
                            onClick={() => setRatesOpen(true)}
                            title="View official drop rates"
                          >
                            Rates ↗
                          </button>
                        )}
                        {card.post && (
                          <a
                            href={card.post}
                            target="_blank"
                            rel="noreferrer"
                            className="banner-link-btn"
                            title="View Cash Shop update announcement"
                          >
                            Post ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="banner-card-title-row">
                      <h3 id={`banner-title-${card.id}`} className="banner-card-title">{card.label}</h3>
                      {availableSlots.length > 1 && (
                        <div
                          className="crate-filter-wrap"
                          ref={activeFilterCardId === card.id ? filterPopRef : null}
                        >
                          <button
                            type="button"
                            className={`crate-filter-btn ${isFiltered ? 'active' : ''}`}
                            onClick={() => setActiveFilterCardId(activeFilterCardId === card.id ? null : card.id)}
                            aria-expanded={activeFilterCardId === card.id}
                            aria-haspopup="dialog"
                            title={`Filter items by slot: ${filterButtonLabel}`}
                          >
                            <svg className="crate-filter-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polygon points="2 3 14 3 9.5 8.5 9.5 13 6.5 14.5 6.5 8.5 2 3" />
                            </svg>
                            <span className="crate-filter-label">{filterButtonLabel}</span>
                            <span className="crate-filter-caret" aria-hidden="true">▾</span>
                          </button>

                          {activeFilterCardId === card.id && (
                            <div className="crate-filter-popover" role="dialog" aria-label="Filter crate by slot">
                              <div className="crate-filter-popover-head">
                                <span className="crate-filter-popover-title">Filter by slot</span>
                                <div className="crate-filter-popover-actions">
                                  <button
                                    type="button"
                                    className="crate-filter-action-btn"
                                    onClick={() => selectAllCrateSlots(card.id)}
                                  >
                                    All
                                  </button>
                                  <button
                                    type="button"
                                    className="crate-filter-action-btn"
                                    onClick={() => clearAllCrateSlots(card.id)}
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                              <div className="crate-filter-options" role="group">
                                {availableSlots.map((slot) => {
                                  const count = card.items.filter((i) => (i.isHair ? 'Hair' : equipSlot(i.sub)) === slot).length;
                                  const isChecked = selectedSlots ? selectedSlots.includes(slot) : true;
                                  return (
                                    <label key={slot} className={`crate-filter-option ${isChecked ? 'checked' : ''}`}>
                                      <input
                                        type="checkbox"
                                        className="crate-filter-checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleCrateSlot(card.id, slot, availableSlots)}
                                      />
                                      <span className="crate-filter-slot-name">{slot}</span>
                                      <span className="crate-filter-count">{count}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="crate-filter-popover-foot">
                                <span className="crate-filter-count-summary">{filteredItems.length} items</span>
                                <button
                                  type="button"
                                  className="crate-filter-done-btn"
                                  onClick={() => setActiveFilterCardId(null)}
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {card.note && <p className="banner-card-note">{card.note}</p>}
                  </div>

                  <div className="banner-card-grid">
                    {searchFiltered.length === 0 ? (
                      <div className="banner-empty-filter">
                        <p>No items match the selected slots.</p>
                        <button
                          type="button"
                          className="banner-reset-filter-btn"
                          onClick={() => selectAllCrateSlots(card.id)}
                        >
                          Show all in crate ({card.items.length})
                        </button>
                      </div>
                    ) : (
                      searchFiltered.map((item) => {
                      const isHair = item.isHair;
                      const isFace = item.sub === 'Face';
                      const faceItem = isFace ? getItem(CATALOG, item.id) : undefined;
                      const faceSex: Sex = faceItem?.sex === 'f' || item.id >= 21000 ? 'f' : 'm';
                      const worn = isHair
                        ? Math.floor(look.hair / 10) === item.id
                        : isFace
                          ? faceStyleId(look.face) === faceStyleId(item.id) && ((look.face >= 21000) === (faceSex === 'f'))
                          : Object.values(look.items).includes(item.id);
                      const img = isHair
                        ? iconURL(item.id * 10 + look.hairCol)
                        : isFace
                          ? iconURL(faceVariantId(faceSex, faceStyleId(item.id), faceColorIndex(look.face)))
                          : iconURL(item.id);
                      const slotTag = isHair ? 'Hair' : equipSlot(item.sub);
                      const itemSex = isHair ? getStyle(CATALOG, item.id)?.sex : (item.sex ?? getItem(CATALOG, item.id)?.sex);
                      return (
                        <Tile
                          key={item.id}
                          on={worn}
                          img={img}
                          label={item.name}
                          rate={item.rate?.includes('%') ? undefined : item.rate}
                          rateBadge={item.rate?.includes('%') ? item.rate : undefined}
                          bannerId={card.id}
                          slotTag={slotTag}
                          gender={itemSex}
                          onClick={() => {
                            if (isHair) wearItemById(item.id * 10 + look.hairCol, 'Hair');
                            else wearItemById(item.id, item.sub);
                          }}
                        />
                      );
                    })
                  )}
                  </div>
                </section>
              );
            })}
          </div>
          </>
        )}

        {catSec && (
          <div id="drawer" className="open">
            <div id="drawer-head">
              <button id="drawer-back" onClick={() => { setCatSec(null); setSearchScope(null); setCatQ(''); }} aria-label="Back"><Icon name="back" /><span>Back</span></button>
              {searchScope === catSec ? (
                <div className="head-search" role="search">
                  <input autoFocus aria-label={`Search ${drawerTitle}`} value={catQ} onChange={(e) => setCatQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearchScope(null); setCatQ(''); } }} placeholder={`Search ${drawerTitle}…`} enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
                  <button className="search-toggle" aria-label="Close search" onClick={() => { setSearchScope(null); setCatQ(''); }}><Icon name="close" /></button>
                </div>
              ) : (
                <>
                  <div id="drawer-title">{drawerTitle}</div>
                  <button className="search-toggle" aria-label={`Search ${drawerTitle}`} aria-expanded={searchScope === catSec} onClick={() => { setSearchScope(catSec); setCatQ(''); }}><Icon name="search" /></button>
                </>
              )}
            </div>
            {(catSec === 'Face' || catSec === 'Hair') && (
              <p className="cat-sub compact">🎲 Mystery = random · 👆 Signature = you pick · 🕒 Limited-time · <button className="inline-link" onClick={() => setRatesOpen(true)}>rates</button></p>
            )}
            {catSec === 'cover-10day' && (
              <p className="cat-sub">10-day duration · sale ends Nov 18 · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            {EQUIP_SECTIONS.some((section) => section.id === catSec) && (
              <div id="drawer-filter" role="group" aria-label="Filter by class">
                {JOBS.map((j) => (
                  <button key={j} type="button" className={'job-pill' + (job === j ? ' on' : '')} aria-pressed={job === j} onClick={() => setJob(j)} title={j === 'All' ? 'Show all classes' : `Sort ${j} equips to top`}>
                    {j === 'All' ? 'All' : j}
                  </button>
                ))}
              </div>
            )}
            {catSec === 'Weapon' && <WeaponGroupFilter value={weaponGroup} onChange={chooseWeaponGroup} />}
            {catSec === 'Weapon' && wieldChoices.length > 1 && <WieldPicker choices={wieldChoices} value={wornWield} onChange={chooseWield} />}
            {catSec === 'Hair' && (
              <div id="drawer-color">
                <span id="drawer-color-label">Hair color · {HAIR_COLORS[look.hairCol]}</span>
                <div id="drawer-color-band" role="group" aria-label="Hair color">
                  {HAIR_COLORS.map((color, i) => <ColorSwatch key={color} color={color} dot={HAIR_DOTS[i]} selected={look.hairCol === i} onClick={() => patch({ hair: Math.floor(look.hair / 10) * 10 + i, hairCol: i })} />)}
                </div>
              </div>
            )}
            {catSec === 'Face' && (
              <div id="drawer-color">
                <span id="drawer-color-label">Eye color · {EYE_COLORS[faceColorIndex(look.face)]}</span>
                <div id="drawer-color-band" role="group" aria-label="Eye color">
                  {EYE_COLORS.map((color, i) => <ColorSwatch key={color} color={color} dot={EYE_DOTS[i]} selected={faceColorIndex(look.face) === i} onClick={() => patch({ face: faceVariantId(look.face >= 21000 ? 'f' : 'm', faceStyleId(look.face), i) })} />)}
                </div>
              </div>
            )}
            {catGroups && catGroups.some((g) => g.rows.length > 0) && catGroups.filter((g) => g.rows.length > 0).map((group) => {
              // The unreleased group is large and preview-only: start collapsed.
              const open = group.key.endsWith(':unreleased') ? expandedCats[group.key] === true : expandedCats[group.key] !== false;
              const bannerIds = [...new Set(group.rows.map(row => row.type === 'hair' ? CATALOG.styles[row.id]?.bannerId : CATALOG.items[row.id]?.bannerId))];
              const headBanner = getBanner(CATALOG, bannerIds[0]);
              const headDates = headBanner?.start && headBanner?.end ? `${shortDate(headBanner.start)}–${shortDate(headBanner.end)}` : null;
              return (
                <section key={group.key} className="drawer-group">
                  <button
                    type="button"
                    className="drawer-group-head"
                    aria-expanded={open}
                    onClick={() => setExpandedCats((prev) => ({ ...prev, [group.key]: !(prev[group.key] !== false) }))}
                  >
                    <span>{group.label} · {group.rows.length}{headDates ? <em className="group-dates"> · {headDates}</em> : null}</span>
                    <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && <>
                    <details className="group-details">
                      <summary>Rotation info</summary>
                      <div className="rotation-details">
                        {bannerIds.map(id => <BannerDetails key={id} id={id} coupon={group.key.split(/[:-]/)[1]} />)}
                      </div>
                    </details>
                    <div className="drawer-group-grid">
                      {group.rows.map((row) => {
                        if (row.type === 'hair') {
                          const styleMeta = getStyle(CATALOG, row.id);
                          if (!styleMeta) return null;
                          const banner = getBanner(CATALOG, styleMeta.bannerId);
                          const lastText = !styleMeta.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined;
                          return (
                            <Tile
                              key={row.id}
                              on={Math.floor(look.hair / 10) === row.id}
                              img={iconURL(row.id * 10 + look.hairCol)}
                              label={styleMeta.name}
                              attainable={styleMeta.attainable}
                              rateBadge={styleMeta.rate?.includes('%') ? styleMeta.rate : undefined}
                              bannerId={styleMeta.bannerId}
                              coupon={styleMeta.coupon}
                              gender={styleMeta.sex}
                              lastText={lastText}
                              onClick={() => wearItemById(row.id * 10 + look.hairCol, 'Hair')}
                            />
                          );
                        }
                        const item = getItem(CATALOG, row.id);
                        if (!item) return null;
                        const faceSex: Sex = item.sex === 'f' || row.id >= 21000 ? 'f' : 'm';
                        const faceId = item.sub === 'Face' ? faceVariantId(faceSex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                        const worn = item.sub === 'Face'
                          ? faceStyleId(look.face) === faceStyleId(row.id) && ((look.face >= 21000) === (faceSex === 'f'))
                          : Object.values(look.items).includes(row.id);
                        const banner = getBanner(CATALOG, item.bannerId);
                        const lastText = !item.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined;
                        return (
                          <Tile
                            key={row.id}
                            on={worn}
                            img={iconURL(faceId)}
                            label={item.name}
                            attainable={item.attainable}
                            rateBadge={item.rate?.includes('%') ? item.rate : undefined}
                            bannerId={item.bannerId}
                            coupon={item.coupon}
                            gender={item.sex}
                            lastText={lastText}
                            onClick={() => wearItemById(row.id, item.sub)}
                          />
                        );
                      })}
                    </div>
                  </>}
                </section>
              );
            })}
            {equipGroups && equipGroups.map((group) => {
              const open = expandedCats[group.key] !== false;
              return (
                <section key={group.key} className="drawer-group">
                  <button
                    type="button"
                    className="drawer-group-head"
                    aria-expanded={open}
                    onClick={() => setExpandedCats((prev) => ({ ...prev, [group.key]: !(prev[group.key] !== false) }))}
                  >
                    <span>{group.label}</span>
                    <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && <>
                    {group.bannerId && <details className="group-details">
                      <summary>Rotation info</summary>
                      <div className="rotation-details">
                        <BannerDetails id={group.bannerId} />
                      </div>
                    </details>}
                    <div className="drawer-group-grid">
                      {group.rows.map((row) => {
                        const item = getItem(CATALOG, row.id);
                        if (!item) return null;
                        const worn = Object.values(look.items).includes(row.id);
                        const banner = getBanner(CATALOG, item.bannerId);
                        const lastText = !item.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined;
                        return (
                          <Tile
                            key={row.id}
                            on={worn}
                            img={iconURL(row.id)}
                            label={item.name}
                            attainable={item.attainable}
                            gender={item.sex}
                            mismatched={row.mismatch}
                            mismatchJob={row.mismatch ? item.requiredJobs?.find((j) => j !== 'Beginner') : undefined}
                            rateBadge={item.rate?.includes('%') ? item.rate : undefined}
                            bannerId={item.bannerId}
                            coupon={item.coupon}
                            lastText={lastText}
                            onClick={() => wearItemById(row.id, item.sub)}
                          />
                        );
                      })}
                    </div>
                  </>}
                </section>
              );
            })}
            {!catGroups && !equipGroups && catRows.length > 0 && (
              <div id="drawer-grid">
                {catRows.map((row) => {
                  const item = getItem(CATALOG, row.id);
                  if (!item) return null;
                  const faceSex: Sex = item.sex === 'f' || row.id >= 21000 ? 'f' : 'm';
                  const faceId = item.sub === 'Face' ? faceVariantId(faceSex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                  const worn = item.sub === 'Face'
                    ? faceStyleId(look.face) === faceStyleId(row.id) && ((look.face >= 21000) === (faceSex === 'f'))
                    : Object.values(look.items).includes(row.id);
                  const banner = getBanner(CATALOG, item.bannerId);
                  const lastText = !item.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined;
                  return (
                    <Tile
                      key={row.id}
                      on={worn}
                      img={iconURL(faceId)}
                      label={item.name}
                      attainable={item.attainable}
                      gender={item.sex}
                      mismatched={row.mismatch}
                      mismatchJob={row.mismatch ? item.requiredJobs?.find((j) => j !== 'Beginner') : undefined}
                      rate={item.rate}
                      bannerId={item.bannerId}
                      coupon={item.coupon}
                      equipInfo={equipInfo(item)}
                      lastText={lastText}
                      onClick={() => wearItemById(row.id, item.sub)}
                    />
                  );
                })}
              </div>
            )}
            {((catGroups && !catGroups.some((g) => g.rows.length > 0)) || (!catGroups && !equipGroups && catRows.length === 0)) && (
              <p className="slot-hint">{catQ.trim() ? `No matches for “${catQ.trim()}” in ${drawerTitle}. Try fewer letters — fuzzy finds typos too.` : `Nothing here yet.`}</p>
            )}

          </div>
        )}

      </div>
      {ratesOpen && (
        <div className="rates-overlay" onClick={() => setRatesOpen(false)}>
          <section className="rates-dialog" role="dialog" aria-modal="true" aria-labelledby="rates-title" onClick={(event) => event.stopPropagation()}>
            <header className="rates-header">
              <div><h2 id="rates-title">Mystery coupon rates</h2><p>Each coupon gives one style for your character's gender. Rates are rounded.</p></div>
              <button className="rates-close" autoFocus aria-label="Close rates" onClick={() => setRatesOpen(false)}>×</button>
            </header>
            <div className="rates-grid">
              {MYSTERY_RATE_GROUPS.map((group) => (
                <section className="rates-group" key={group.title}>
                  <h3>{group.title}</h3>
                  {group.rows.map((row) => <div className="rates-row" key={row.name}><span>{row.name}</span><strong>{row.rate}</strong></div>)}
                </section>
              ))}
            </div>
            <footer className="rates-footer">
              <a href={STYLE_RATES} target="_blank" rel="noreferrer">Nexon's official rate data (JSON) ↗</a>
              <a href={NEWS_POST} target="_blank" rel="noreferrer">Nexon cash shop announcement ↗</a>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}


function BannerDetails({ id, coupon }: { id?: string; coupon?: string }) {
  const banner = getBanner(CATALOG, id);
  if (!banner) return null;
  return <div className="banner-details">
    <div className="banner-essentials">
      {banner.start && banner.end && <span>{shortDate(banner.start)} – {shortDate(banner.end)}</span>}
      {banner.post && <a href={banner.post} target="_blank" rel="noreferrer">Official announcement ↗</a>}
    </div>
    <details className="banner-more">
      <summary>Details ⓘ</summary>
      <div className="banner-more-content">
        <strong>{banner.label}</strong>
        {banner.start && banner.end && <p>{banner.start} – {banner.end} · limited rotation</p>}
        {coupon === 'mystery' && <p>One random style per coupon. Each tile shows its chance.</p>}
        {coupon === 'signature' && <p>Choose your style from this rotation.</p>}
        {coupon === 'past' && <p>Past rotation: preview only; unavailable from current coupons.</p>}
        {coupon === 'unreleased' && <p>Hasn&apos;t been released yet. Preview only.</p>}
        {banner.note && <p>{banner.note}</p>}
        {banner.rates && <a href={banner.rates} target="_blank" rel="noreferrer">Official rates ↗</a>}
      </div>
    </details>
  </div>;
}

function ColorSwatch(props: { color: string; dot: string; selected: boolean; onClick: () => void }) {
  return <button
    type="button"
    title={props.color}
    aria-label={props.color}
    aria-pressed={props.selected}
    className={'color-swatch' + (props.selected ? ' on' : '')}
    style={{ background: props.dot }}
    onClick={props.onClick}
  />;
}

const NEWS_POST = 'https://www.nexon.com/maplestory/news/sale/45819/founder-s-access-cash-shop';
const STYLE_RATES = 'https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45537';

/** Trim catalog rates to one decimal for the compact tile badge: 2.50% → 2.5%. */
function shortRate(rate: string): string {
  return rate.replace(/(\d+)\.(\d)\d*\s*%/, '$1.$2%');
}

function Tile(props: {
  on: boolean;
  img?: string;
  label: string;
  big?: string;
  rate?: string;
  group?: string;
  attainable?: boolean;
  mismatched?: boolean;
  mismatchJob?: string;
  lastText?: string;
  endText?: string;
  equipInfo?: string;
  bannerId?: string;
  coupon?: 'mystery' | 'signature';
  mini?: boolean;
  /** Compact % overlay for grouped equip tiles — chance lives in the badge,
   *  banner dates live in the group header, so no text rows under the tile. */
  rateBadge?: string;
  slotTag?: string;
  gender?: 'm' | 'f' | 'u';
  onClick: () => void;
}) {
  const jobLabel = props.equipInfo;
  const banner = getBanner(CATALOG, props.bannerId);
  // The sale window decides, so a lineup archived early still reads live until it ends.
  const notAttainable = !attainableNow(props.attainable !== false, banner, Date.now());
  const isUnreleased = props.bannerId === 'unreleased';
  // Only choice-based acquisition gets a method badge. Random/mystery is the
  // default and the % badge already signals chance, so no dice badge.
  const randomOnly = props.coupon === 'mystery' || props.bannerId === 'founder-crate-oct26' || props.bannerId === 'mystery-crate-nov26' || props.bannerId === 'halloween-crate-oct26' || props.bannerId === 'beta-style-sep26';
  const showSelect = !randomOnly && !props.rateBadge && !props.rate && (props.coupon === 'signature' || !!banner);
  const isCover = props.bannerId === 'covers-10day-nov26';
  const drop = banner ? dropInfo(banner, Date.now()) : null;
  const upcoming = drop?.state === 'upcoming';
  const isNew = !!drop?.isNew && !notAttainable;
  const endingSoon = !!drop?.endingSoon && !notAttainable;
  const expiration = upcoming
    ? `Upcoming · starts ${banner!.start}`
    : isCover
    ? `10-day duration · sale ends ${banner?.end ?? 'Nov 18'}`
    : banner?.end
      ? (notAttainable ? 'Past rotation' : `Available until ${banner.end}`)
      : notAttainable ? 'Not currently attainable' : undefined;
  const countdown = upcoming ? null : isNew ? 'NEW' : formatCountdown(banner, !notAttainable);
  const hasBadges = Boolean(expiration || showSelect);

  return (
    <button
      type="button"
      aria-pressed={props.on}
      aria-label={
        props.mismatched && props.mismatchJob
          ? `${props.label} (switches class to ${props.mismatchJob})`
          : props.label || undefined
      }
      title={
        props.mismatched && props.mismatchJob
          ? `Off-job · tap switches class to ${props.mismatchJob}`
          : props.gender === 'm'
            ? `${props.label} · Male`
            : props.gender === 'f'
              ? `${props.label} · Female`
              : undefined
      }
      className={'tile' + (props.mini ? ' mini' : '') + (props.on ? ' on' : '') + (notAttainable ? ' not-attainable' : '') + (props.mismatched ? ' mismatch' : '')}
      onClick={props.onClick}
    >
      <div className="tile-preview">
        {hasBadges && (
          <div className="tile-badges">
            <div className="tile-methods">
              {showSelect && (
                <span className="tile-badge" role="img" aria-label="Select your choice" title="Select your choice">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="m3 2 10 6-5 1-2 5-3-12Z" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
            {isUnreleased ? (
              <span className="tile-badge tile-unreleased" role="img" aria-label="Not released yet" title="Not released yet">
                UNRELEASED
              </span>
            ) : expiration && (
              <span suppressHydrationWarning className={'tile-badge tile-expiration' + (notAttainable ? ' expired' : upcoming ? ' upcoming' : isNew ? ' new' : endingSoon ? ' soon' : '')} role="img" aria-label={expiration} title={[expiration, props.lastText].filter(Boolean).join(' · ')}>
                {notAttainable || !countdown ? (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" strokeLinecap="round" /></svg>
                ) : (
                  countdown
                )}
              </span>
            )}
          </div>
        )}
        {props.img ? (
          <img loading="lazy" decoding="async" draggable={false} src={props.img} alt="" onError={(e) => { const next = iconFallbackURL(e.currentTarget.src); if (next) e.currentTarget.src = next; }} />
        ) : (
          <span style={{ fontSize: 18 }}>{props.big}</span>
        )}
        {props.rateBadge && <span className="tile-rate-badge" role="img" aria-label={`Chance ${props.rateBadge}`} title={`Chance ${props.rateBadge}`}>{shortRate(props.rateBadge)}</span>}
      </div>
      {props.slotTag && !props.mini && !hasBadges && <span className="tile-slot-tag">{props.slotTag}</span>}
      {props.label && !props.mini && <span className="tile-label">{props.label}</span>}
      {jobLabel && !props.mini && <em className="rate">{jobLabel}</em>}
      {props.rate && !props.rateBadge && !props.mini && <em className="rate">{props.rate}</em>}
    </button>
  );
}

function CharacterEditor({ look, skins, onName, onSex, onSkin }: {
  look: Look;
  skins: number[];
  onName: (name: string) => void;
  onSex: (sex: Sex) => void;
  onSkin: (skin: number) => void;
}) {
  return (
    <div className="char-editor">
      <label className="setrow">
        <span>name</span>
        <input className="name-input" value={look.name ?? ''} maxLength={NAME_MAX} placeholder="Your name (optional)" autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(e) => onName(cleanName(e.target.value))} />
      </label>
      <div className="setrow">
        <span>gender</span>
        <div className="seg">
          <button className={look.sex === 'm' ? 'on' : ''} onClick={() => onSex('m')}><GenderIcon sex="m" />Male</button>
          <button className={look.sex === 'f' ? 'on' : ''} onClick={() => onSex('f')}><GenderIcon sex="f" />Female</button>
        </div>
      </div>
      <div className="setrow">
        <span>skin</span>
        <div id="skins">
          {skins.map((s, i) => (
            <button key={s} title={'skin ' + s} aria-label={'Skin ' + (i + 1)} className={look.skin === s ? 'on' : ''} style={{ background: SKIN_TONES[s] ?? '#888' }} onClick={() => onSkin(s)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Icon({ name }: { name: 'settings' | 'shuffle' | 'search' | 'close' | 'share' | 'check' | 'play' | 'back' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'settings' && <><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.9 1.8v2.6l-1.9 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.6-2.6 2.2-1.3 2.5.7 2-3.5-1.9-1.8v-2.6l1.9-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z" /><circle cx="11" cy="12.5" r="3" /></>}
    {name === 'shuffle' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" strokeWidth="3" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'share' && <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>}
    {name === 'check' && <path d="m4.5 12.5 5 5 10-11" />}
    {name === 'back' && <path d="m14.5 6-6 6 6 6" />}
    {name === 'play' && <><rect x="2.5" y="7" width="19" height="10" rx="5" /><path d="M8 10v4M6 12h4M16 11h.01M18 13h.01" strokeWidth="2" /></>}
  </svg>;
}

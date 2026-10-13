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
  encodeLook,
  equipSlot,
  faceColorIndex,
  faceStyleId,
  faceVariantId,
  formatAttainableInfo,
  getBanner,
  getItem,
  getStyle,
  iconURL,
  loadLookFromStorage,
  matchesFuzzy,
  matchesJob,
  randomClassicWeapon,
  randomLook,
  stanceForWeapon,
  TWO_HAND_SUBS,
  RANDOM_EQUIP_SLOTS,
  type RandomEquipSlot,
  type ResolvedItem,
  saveLookToStorage,
  type FastCatalog,
  type Look,
  type SectionId,
  type Sex,
} from '../lib/fashion';
import catalogData from '../data/catalog.json';
import LayeredCharacterCanvas from './layered-character-canvas';
import GamePad from './game-pad';
import { autoSwipeLevel } from '../lib/afterimage';
import { PlayController, PLAY_POSES, SPRITE_CANVAS } from '../lib/play-controller';
import { warmPoses } from '../lib/layered-client-renderer';
import './fashion.css';

const CATALOG = catalogData as FastCatalog;
const MYSTERY_RATE_GROUPS = [
  { title: 'Male hair', rows: CATALOG.indexes.hairs.m.active.filter((id) => CATALOG.styles[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.styles[id].name, rate: CATALOG.styles[id].rate ?? '16.67%' })) },
  { title: 'Female hair', rows: CATALOG.indexes.hairs.f.active.filter((id) => CATALOG.styles[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.styles[id].name, rate: CATALOG.styles[id].rate ?? '16.67%' })) },
  { title: 'Male faces', rows: CATALOG.indexes.faces.m.active.filter((id) => CATALOG.items[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.items[id].name, rate: CATALOG.items[id].rate ?? '16.67%' })) },
  { title: 'Female faces', rows: CATALOG.indexes.faces.f.active.filter((id) => CATALOG.items[id]?.coupon === 'mystery').map((id) => ({ name: CATALOG.items[id].name, rate: CATALOG.items[id].rate ?? '16.67%' })) },
];
const STARTER_HAIRS: Record<Sex, number[]> = { m: [3000, 3002, 3003], f: [3100, 3104] };
// Innocent Gaze (m) / Strong Stare (f); Veronica hair for f
const DEFAULT_FACE: Record<Sex, number> = { m: 20033, f: 21803 };
const DEFAULT_HAIR_STYLE: Partial<Record<Sex, number>> = { f: 3101 };
const STARTER_FACES: Record<Sex, number[]> = { m: [20000, 20001, 20002], f: [21000, 21001, 21002] };
const HAIR_DOTS = ['#23232a', '#a83a32', '#d97b2e', '#e3c46a', '#4a8f4d', '#4a6fa5', '#7a4a8f', '#6e4a2f'];
const EYE_DOTS = ['#24242b', '#4a82c5', '#c94747', '#4a9459', '#826044', '#48aeb6', '#8050aa', '#8c3440', '#e8e8e8'];
const SKIN_TONES: Record<number, string> = { 2000: '#ffddaa', 2001: '#bb9966', 2002: '#7a4a22', 2003: '#ffeecc', 2004: '#ccccdd', 2005: '#eeeeee', 2006: '#ffdddd' };
const AVATAR_PX = 44;
// Head-and-shoulders crop, in the centered 128px box of the sprite canvas.
const AVATAR_INSET = (SPRITE_CANVAS - 128) / 2;
const AVATAR_CROP = { x: AVATAR_INSET + 34, y: AVATAR_INSET + 20, size: 60 };
const ANIMS = ['stand1', 'stand2', 'alert', 'jump'];
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
  const sub = getItem(CATALOG, look.items.Weapon)?.sub;
  const stance = stanceForWeapon(sub ?? 'One-Handed Sword', look.anim);
  return stance ? { ...look, anim: stance.anim, frame: stance.frame } : look;
}

function loadInitialLook(): Look {
  if (typeof window === 'undefined') return DEFAULT_LOOK;
  const fromQuery = decodeLook(window.location.search);
  if (fromQuery) return normalizeStance({ ...DEFAULT_LOOK, ...fromQuery, sex: (fromQuery.sex as Sex) || DEFAULT_LOOK.sex });

  const fromHash = decodeLook(window.location.hash);
  if (fromHash) return normalizeStance({ ...DEFAULT_LOOK, ...fromHash, sex: (fromHash.sex as Sex) || DEFAULT_LOOK.sex });

  const fromStorage = loadLookFromStorage();
  const savedSex = (localStorage.getItem(STORAGE_SEX_KEY) as Sex) || null;
  if (fromStorage) {
    return normalizeStance({ ...DEFAULT_LOOK, ...fromStorage, sex: (fromStorage.sex as Sex) || savedSex || DEFAULT_LOOK.sex });
  }

  const sex = savedSex || DEFAULT_LOOK.sex;
  return { ...DEFAULT_LOOK, sex, hair: (DEFAULT_HAIR_STYLE[sex] ?? 3013) * 10, face: DEFAULT_FACE[sex] };
}

function isFirstVisit(): boolean {
  if (typeof window === 'undefined') return false;
  if (decodeLook(window.location.search) || decodeLook(window.location.hash)) return false;
  return !loadLookFromStorage() && !localStorage.getItem(STORAGE_SEX_KEY);
}

/** Single owner for the selected look: boots from shared link / storage,
 *  mirrors every change back to the URL (shareable) + localStorage. */
function useLook() {
  const [look, setLook] = useState<Look>(() => loadInitialLook());
  useEffect(() => {
    const encoded = encodeLook(look);
    const currentUrl = new URL(window.location.href);
    currentUrl.search = encoded ? '?' + encoded : '';
    currentUrl.hash = '';
    history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
    saveLookToStorage(look);
  }, [look]);
  return [look, setLook] as const;
}

export default function FashionIsland() {
  const [look, setLook] = useLook();
  const [skins, setSkins] = useState<number[]>([2000]);
  const [q, setQ] = useState('');
  const [searchScope, setSearchScope] = useState<SectionId | 'all' | null>(null);
  const [excludedSlots, setExcludedSlots] = useState<RandomEquipSlot[]>([]);
  const [nxOnly, setNxOnly] = useState(true);
  // Global class filter: one job for rail rows, all drawers, randomizer.
  // 'All' disables mismatch greying. A specific job greys out non-matching
  // classic equips instead of hiding them; tapping a greyed tile equips it
  // and switches this filter to that item's job.
  const [job, setJob] = useState('All');
  const JOBS = ['All', 'Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controller, setController] = useState<PlayController | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const [ratesOpen, setRatesOpen] = useState(false);
  // Read before useLook's effect persists the default look.
  const firstVisit = useRef(isFirstVisit());
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);
  // Same sheet: slide it up first, then drop the welcome layer once it has faded.
  const finishWelcome = () => {
    const { anim, frame } = look;
    setWelcomeLeaving(true);
    patch({ anim: 'jump', frame: 0 });
    setTimeout(() => { setWelcomeOpen(false); setWelcomeLeaving(false); patch({ anim, frame }); }, 450);
  };
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
  useEffect(() => { if (firstVisit.current) setWelcomeOpen(true); }, []);
  const [catSec, setCatSec] = useState<SectionId | null>(null);
  const [catQ, setCatQ] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [equipToast, setEquipToast] = useState<{ id: number; name: string; action: 'Equipped' | 'Removed'; replaced: string; sequence: number } | null>(null);
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

  const chooseClass = useCallback((next: string) => {
    setJob(next);
    const weapon = randomClassicWeapon(look.sex, next === 'All' ? 'Beginner' : next);
    if (weapon == null) return;
    setLook(current => {
      const sub = getItem(CATALOG, weapon)?.sub;
      const items = applyPick(current.items, 'Weapon', weapon, sub);
      const stance = stanceForWeapon(sub, current.anim);
      return stance ? { ...current, items, anim: stance.anim, frame: stance.frame } : { ...current, items };
    });
  }, [look.sex]);

  const setSex = useCallback((sex: Sex) => {
    localStorage.setItem(STORAGE_SEX_KEY, sex);
    setSettingsOpen(false);
    setLook((l) => {
      const next = { ...l, sex };
      const defaultHair = DEFAULT_HAIR_STYLE[sex];
      if (defaultHair) next.hair = defaultHair * 10 + next.hairCol;
      else if (!CATALOG.indexes.hairs[sex].active.includes(Math.floor(next.hair / 10))) {
        next.hair = (CATALOG.indexes.hairs[sex].active[0] ?? 3013) * 10 + next.hairCol;
      }
      next.face = DEFAULT_FACE[sex];
      return next;
    });
  }, []);

  const wearItemById = useCallback((id: number | null, sub: string) => {
    if (id == null) return;
    const slot = equipSlot(sub);
    const selectedId = sub === 'Face' ? faceVariantId(look.sex, faceStyleId(id), faceColorIndex(look.face)) : id;
    const currentId = sub === 'Hair' ? look.hair : sub === 'Face' ? look.face : look.items[slot];
    const cosmetic = sub === 'Hair' || sub === 'Face';
    if (cosmetic && currentId === selectedId) return;
    const unequipping = !cosmetic && currentId === id;
    const nextItems = cosmetic ? look.items : applyPick(look.items, slot, unequipping ? null : id, sub);
    const removed = Object.keys(look.items).filter((key) => nextItems[key] === undefined || (key === 'Weapon' && nextItems[key] !== look.items[key]));
    const slotNames: Record<string, string> = { Top: 'shirt', Bottom: 'pants', Overall: 'overall', Shield: 'shield', Weapon: 'two-handed weapon' };
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
      replaced: !unequipping && (removed.length || switching) ? [removed.length ? `Removed ${removed.map((key) => slotNames[key] ?? key.toLowerCase()).join(' and ')}` : '', switching ? `Switched class to ${switching}` : ''].filter(Boolean).join(' · ') : '',
      sequence: ++toastSequence.current,
    });
    if (sub === 'Hair') patch({ hair: id, hairCol: id % 10 });
    else if (sub === 'Face') patch({ face: selectedId });
    else {
      const weaponSub = unequipping && slot === 'Weapon'
        ? undefined
        : sub === 'Shield'
          ? getItem(CATALOG, nextItems.Weapon)?.sub
          : sub;
      // Tapping the worn weapon off falls back to bare hands; stand2/walk2
      // have no unarmed frames, so steer back to stand1/walk1.
      const bareHands = unequipping && slot === 'Weapon' && (look.anim === 'stand2' || look.anim === 'walk2')
        ? { anim: look.anim === 'stand2' ? 'stand1' : 'walk1', frame: 0 }
        : null;
      const stance = stanceForWeapon(weaponSub, look.anim) ?? bareHands;
      patch(stance ? { items: nextItems, anim: stance.anim, frame: stance.frame } : { items: nextItems });
    }
  }, [look, patch, job]);

  // O(1) Pre-indexed style and item ID arrays for the active sex
  const activeHairStyles = CATALOG.indexes.hairs[look.sex].active;
  const pastHairStyles = CATALOG.indexes.hairs[look.sex].past;
  const activeFaces = CATALOG.indexes.faces[look.sex].active;
  const pastFaces = CATALOG.indexes.faces[look.sex].past;
  const starterHairStyles = STARTER_HAIRS[look.sex].filter(id => !!CATALOG.styles[id]);
  const starterFaces = STARTER_FACES[look.sex].filter(id => !!CATALOG.items[id]);

  // Mystery (random) vs Signature (pick) splits by coupon tier
  const mysteryHairs = useMemo(() => activeHairStyles.filter((st) => (getStyle(CATALOG, st)?.coupon ?? 'mystery') === 'mystery'), [activeHairStyles]);
  const signatureHairs = useMemo(() => activeHairStyles.filter((st) => getStyle(CATALOG, st)?.coupon === 'signature'), [activeHairStyles]);
  const mysteryFaces = useMemo(() => activeFaces.filter((fid) => (getItem(CATALOG, fid)?.coupon ?? 'mystery') === 'mystery'), [activeFaces]);
  const signatureFaces = useMemo(() => activeFaces.filter((fid) => getItem(CATALOG, fid)?.coupon === 'signature'), [activeFaces]);
  // Fixed catalog order everywhere — tapping selects in place, never reorders.
  const getGroupEquips = useCallback(
    (groupKey: string): number[] => {
      const g = CATALOG.indexes.groups[groupKey];
      if (!g) return [];
      return [...g.u, ...g[look.sex]];
    },
    [look.sex],
  );

  const equipSections = useMemo(() => {
    const ids = [...new Set(['founder-crate', 'aurora-crate', 'cover-10day', 'classic-equips'].flatMap(getGroupEquips))]
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


  type CatRow = { type: 'hair' | 'item'; id: number; mismatch?: boolean };
  // (needle filter inlined in catGroups below)
  // Grouped rows for the merged Hair/Face drawers, fixed catalog order.
  const catGroups = useMemo(() => {
    if (catSec !== 'Hair' && catSec !== 'Face') return null;
    const needle = catQ.trim().toLowerCase();
    const matches = (name: string | undefined, id: number) => matchesFuzzy(name, id, needle);
    const buildHair = (key: string, label: string, ids: number[]) => {
      const rows: CatRow[] = ids
        .filter((st) => matches(CATALOG.styles[st]?.name, st))
        .map((st) => ({ type: 'hair' as const, id: st }));
      return { key, label, rows };
    };
    const buildFace = (key: string, label: string, ids: number[]) => {
      const rows: CatRow[] = ids
        .filter((fid) => matches(CATALOG.items[fid]?.name, fid))
        .map((fid) => ({ type: 'item' as const, id: fid }));
      return { key, label, rows };
    };
    const groups = catSec === 'Hair'
      ? [buildHair('hair:mystery', 'Mystery', mysteryHairs), buildHair('hair:signature', 'Signature', signatureHairs), buildHair('hair:starter', 'Starter', starterHairStyles), buildHair('hair:past', 'Past rotation', pastHairStyles)]
      : [buildFace('face:mystery', 'Mystery', mysteryFaces), buildFace('face:signature', 'Signature', signatureFaces), buildFace('face:starter', 'Starter', starterFaces), buildFace('face:past', 'Past rotation', pastFaces)];
    // Empty groups sink to the bottom; the rest stay in canonical
    // Mystery → Signature → Starter → Past order so tapping never
    // reorders sections under the finger.
    return groups.sort((a, b) => Number(a.rows.length === 0) - Number(b.rows.length === 0));
  }, [catSec, catQ, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces]);
  // (category expand/collapse inlined at the drawer render below)

  const catRows = useMemo(() => {
    if (!catSec) return [];
    const needle = catQ.trim().toLowerCase();
    const r = equipSections.find((section) => section.id === catSec)?.ids ?? getGroupEquips(catSec);
    // Global job filter greys out instead of hiding: matching gear, then
    // off-job gear. Banner grouping happens in equipGroups below; inside
    // each group NX sorts by name, classic by requiredLevel asc then name.
    const filtered = needle ? r.filter((id) => matchesFuzzy(CATALOG.items[id]?.name, id, needle)) : r;
    const levelOf = (id: number) => CATALOG.items[id]?.requiredLevel ?? -1;
    const nameOf = (id: number) => CATALOG.items[id]?.name ?? '';
    const mismatchOf = (id: number) => !matchesJob(CATALOG.items[id], job);
    const rankOf = (id: number) => bannerRank(CATALOG.items[id]);
    return filtered
      .map((id) => ({ type: 'item' as const, id, mismatch: mismatchOf(id) }))
      .sort((a, b) => Number(a.mismatch) - Number(b.mismatch) || rankOf(a.id) - rankOf(b.id) || levelOf(a.id) - levelOf(b.id) || nameOf(a.id).localeCompare(nameOf(b.id)));
  }, [catSec, catQ, getGroupEquips, equipSections, job]);


  // Equip drawers: partition the flat row list into banner sections so NX
  // sources never intermix — Founder's crate → 10-day covers → Aurora stamp
  // → classic job equips. Same collapsible section UI as Hair/Face drawers.
  const equipGroups = useMemo(() => {
    if (catGroups || !catSec || catRows.length === 0) return null;
    const buckets = new Map<string, typeof catRows>();
    for (const row of catRows) {
      const group = CATALOG.items[row.id]?.group ?? 'classic-equips';
      const list = buckets.get(group) ?? [];
      list.push(row);
      buckets.set(group, list);
    }
    const order = ['founder-crate', 'cover-10day', 'aurora-crate', 'classic-equips'];
    const groups = order
      .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
      .map((key) => {
        const rows = buckets.get(key)!;
        const bannerId = CATALOG.items[rows[0]!.id]?.bannerId;
        const banner = getBanner(CATALOG, bannerId);
        const dates = banner?.start && banner?.end ? ` · ${shortDate(banner.start)}–${shortDate(banner.end)}` : '';
        const label = key === 'founder-crate' ? "Founder's Mystery Crate"
          : key === 'cover-10day' ? '10-Day Covers'
          : key === 'aurora-crate' ? 'Aurora Stamp Shop'
          : 'Job Equips';
        return { key, label: `${label} · ${rows.length}${dates}`, rows, bannerId };
      });
    // Sections stay in canonical banner order — tapping selects in place,
    // never reorders. Worn shows via the checkmark only.
    return groups;
  }, [catGroups, catSec, catRows]);

  const openCat = useCallback((sec: SectionId) => {
    setCatSec(sec);
    setCatQ('');
  }, []);

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
  const unattainableWorn = [
    hairMeta && !hairMeta.attainable ? { type: 'Hair', id: look.hair, meta: hairMeta } : null,
    faceMeta && !faceMeta.attainable ? { type: 'Face', id: look.face, meta: faceMeta } : null,
    ...wornEquipList.filter((e) => e.meta && !e.meta.attainable).map((e) => ({ type: e.slot, id: e.id!, meta: e.meta! })),
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
  // Equip slots: all items for the slot, Lv-sorted, off-job greyed.
  const railItems = useMemo(() => {
    // Quick tiles pin the worn pick first so the applied style is always
    // visible; everything else holds the fixed set order. Drawers stay
    // fully static (select in place).
    const isWorn = (slotId: string, row: CatRow): boolean => {
      if (slotId === 'Hair' && row.type === 'hair') return row.id === Math.floor(look.hair / 10);
      if (slotId === 'Face' && row.type === 'item') return faceStyleId(look.face) === faceStyleId(row.id);
      if (row.type === 'item') return Object.values(look.items).includes(row.id);
      return false;
    };
    const levelOf = (row: CatRow) => row.type === 'hair' ? -1 : (CATALOG.items[row.id]?.requiredLevel ?? -1);
    const nameOf = (row: CatRow) => row.type === 'hair' ? (CATALOG.styles[row.id]?.name ?? '') : (CATALOG.items[row.id]?.name ?? '');
    const mismatchOf = (row: CatRow) => row.type === 'item' && !matchesJob(CATALOG.items[row.id], job) ? true : false;
    const rankOf = (row: CatRow) => row.type === 'hair' ? -1 : bannerRank(CATALOG.items[row.id]);
    const restSort = (a: CatRow & { mismatch?: boolean }, b: CatRow & { mismatch?: boolean }) => Number(a.mismatch ?? false) - Number(b.mismatch ?? false) || rankOf(a) - rankOf(b) || levelOf(a) - levelOf(b) || nameOf(a).localeCompare(nameOf(b));
    const sortRows = (slotId: string, rows: CatRow[]) => {
      const flagged = rows.map((row) => ({ ...row, mismatch: mismatchOf(row) }));
      return [...flagged.filter((row) => isWorn(slotId, row)), ...flagged.filter((row) => !isWorn(slotId, row)).sort(restSort)];
    };
    const result: Record<string, CatRow[]> = {};
    for (const slot of railSlots) {
      if (slot.id === 'Hair') {
        result[slot.id] = sortRows(slot.id, [...mysteryHairs, ...signatureHairs, ...starterHairStyles, ...pastHairStyles].map((id) => ({ type: 'hair' as const, id })));
      } else if (slot.id === 'Face') {
        result[slot.id] = sortRows(slot.id, [...mysteryFaces, ...signatureFaces, ...starterFaces, ...pastFaces].map((id) => ({ type: 'item' as const, id })));
      } else {
        const ids = equipSections.find((s) => s.id === slot.id)?.ids ?? [];
        result[slot.id] = sortRows(slot.id, ids.map((id) => ({ type: 'item' as const, id })));
      }
    }
    return result;
  }, [railSlots, look.items, look.hair, look.face, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces, equipSections, job]);


  // Play mode: a pad drives the preview with a pose override (see play-controller).
  const stopPlay = useCallback(() => setController(null), []);
  const startPlay = useCallback(() => {
    const element = document.getElementById('preview');
    if (!element) return;
    setSettingsOpen(false);
    setController(new PlayController(element, () => {
      const weapon = getItem(CATALOG, lookRef.current.items.Weapon);
      return { id: lookRef.current.items.Weapon ?? undefined, sub: weapon?.sub, level: autoSwipeLevel(weapon?.requiredLevel) };
    }));
  }, []);
  useEffect(() => {
    if (!controller) return;
    controller.start();
    return () => controller.stop();
  }, [controller]);
  // Decode the worn look's walk/duck/attack frames up front so the first steps don't stutter.
  useEffect(() => {
    if (controller) void warmPoses(look, PLAY_POSES);
  }, [controller, look]);

  // Drag the sheet down: it follows the finger while the stage grows to show the whole
  // character; letting go past the threshold starts play mode, otherwise it snaps back.
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dragGate = useRef({ locked: false, start: startPlay });
  dragGate.current = { locked: welcomeOpen || !!controller, start: startPlay };
  useEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    if (!root || !rail) return;
    const phone = window.matchMedia('(max-width: 899px)');
    let drag: { x: number; y: number; atTop: boolean; active: boolean; max: number; pull: number } | null = null;
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
        x: touch.clientX, y: touch.clientY, atTop: !scroller || scroller.scrollTop <= 0, active: false, pull: 0,
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
    const onEnd = () => {
      const finished = drag;
      drag = null;
      if (!finished?.active) return;
      root.classList.remove('dragging');
      setPull(null);
      if (finished.pull > Math.min(110, finished.max * 0.4)) dragGate.current.start();
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

  const drawerTitle = useMemo(() => {
    if (!catSec) return '';
    return EQUIP_SECTIONS.find((section) => section.id === catSec)?.label ?? (catSec === 'Hair'
      ? 'Hair'
      : catSec === 'Face'
        ? 'Face'
        : catSec === 'founder-crate'
          ? "Founder's Crate"
          : catSec === 'aurora-crate'
            ? 'Aurora Crate'
            : '10-Day Covers · 700–1,200 NX');
  }, [catSec]);

  return (
    <div ref={rootRef} className={'mf' + (controller ? ' playing' : '')}>
      <div id="stage" className={welcomeOpen ? (welcomeLeaving ? 'leaving' : 'welcoming') : undefined}>
        <div id="controls">
          <button id="avatar" onClick={() => setSettingsOpen(v => !v)} aria-label="Edit character" aria-expanded={settingsOpen} aria-controls="settings"><canvas ref={avatarRef} width={AVATAR_PX} height={AVATAR_PX} aria-hidden="true" /></button>
          <div className="controls-right">
            <button id="share" onClick={shareLook} aria-label="Share this look" title={shared ? 'Shared!' : copied ? 'Link copied!' : 'Share this look'}><Icon name={copied || shared ? 'check' : 'share'} /></button>
            <button id="play" onClick={() => controller ? stopPlay() : startPlay()} aria-label={controller ? 'Back to closet' : 'Move your character'} aria-pressed={!!controller} title="Move your character"><Icon name="play" /></button>
            <button id="shuffle" onClick={() => setLook(randomLook(look.sex, Math.random, excludedSlots, nxOnly, job === 'All' ? 'Beginner' : job))} aria-label="Randomize outfit"><Icon name="shuffle" /></button>
          </div>
        </div>
        <div id="canvas" onClick={() => { if (!controller) setSettingsOpen(true); }} title="Edit character" style={{ cursor: 'pointer' }}>
          <LayeredCharacterCanvas look={look} onRendered={(canvas) => { setRendering(false); drawAvatar(canvas); }} />
          {rendering && <div id="spin" />}
          <div className="name-row">
            <span className={'name-tag' + (look.name ? '' : ' empty')}>{look.name ? String(look.name) : 'Your name'}</span>
          </div>
          <div className="equip-toast-slot" role="status" aria-live="polite" aria-atomic="true">
            {equipToast && <div className="equip-toast" key={equipToast.sequence}>
              <img src={iconURL(equipToast.id)} alt="" />
              <div><span>{equipToast.action} {equipToast.name}</span>{equipToast.replaced && <small>{equipToast.replaced}</small>}</div>
            </div>}
          </div>
        </div>
        {!controller && !welcomeOpen && <button type="button" id="play-pill" onClick={(event) => { event.stopPropagation(); startPlay(); }}><Icon name="play" />Play</button>}
      </div>
      {controller && <GamePad controller={controller} onExit={stopPlay} />}
      {settingsOpen && (
        <div id="settings">
          <header className="settings-head">
            <h2>My character</h2>
            <button className="settings-close" aria-label="Close" onClick={() => setSettingsOpen(false)}><Icon name="close" /></button>
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
              <select value={look.anim} onChange={(e) => patch({ anim: e.target.value, frame: 0 })}>
                {ANIMS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button onClick={() => patch({ frame: Math.max(0, look.frame - 1) })} aria-label="Previous frame">‹</button>
              <span className="frame-num">{look.frame}</span>
              <button onClick={() => patch({ frame: look.frame + 1 })} aria-label="Next frame">›</button>
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
            <button onClick={() => { setLook((l) => ({ ...l, items: {} })); }}>Clear worn</button>
          </footer>
        </div>
    )}

    <div id="rail" ref={railRef} className={welcomeOpen && !welcomeLeaving ? 'welcoming' : undefined}>
      <div id="rail-grip" aria-hidden="true"><span /><small>Drag down to play</small></div>
      {welcomeOpen && (
        <section id="welcome" className={welcomeLeaving ? 'leaving' : undefined} role="dialog" aria-labelledby="welcome-title">
          <header>
            <h2 id="welcome-title">Create your character</h2>
            <p>Pick a gender and skin tone — name is optional. You can change these later in settings.</p>
          </header>
          <CharacterEditor look={look} skins={skins} onName={(name) => patch({ name })} onSex={setSex} onSkin={(skin) => patch({ skin })} />
          <button className="welcome-done" onClick={finishWelcome}>Start dressing</button>
        </section>
      )}
        <div id="rail-head">
          {searchScope === 'all' ? (
            <div className="head-search" role="search">
              <input id="item-search" autoFocus aria-label="Search all items" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearchScope(null); setQ(''); } }} placeholder="Search all items…" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              <button className="search-toggle" aria-label="Close search" onClick={() => { setSearchScope(null); setQ(''); }}><Icon name="close" /></button>
            </div>
          ) : (
            <>
              <img className="brand-leaf" src="/leaf.png" alt="" width="22" height="22" />
              <h1 id="brand">Classic Closet</h1>
              <a className="site-credit" href="https://builtby.win/ston" target="_blank" rel="noopener noreferrer">by ston</a>
              <button className="search-toggle" aria-label="Search items" aria-expanded={false} aria-controls="item-search" onClick={() => { setCatSec(null); setCatQ(''); setSearchScope('all'); setQ(''); }}><Icon name="search" /></button>
            </>
          )}
        </div>
        <div id="job-bar" role="group" aria-label="Filter by class">
          {JOBS.map((j) => (
            <button key={j} type="button" className={'job-pill' + (job === j ? ' on' : '')} aria-pressed={job === j} onClick={() => setJob(j)} title={j === 'All' ? 'Show all classes' : j === 'Beginner' ? 'Beginner-wearable only' : `Grey out non-${j} gear`}>
              {j === 'All' ? 'All' : j}
            </button>
          ))}
        </div>
        <div id="slot-list" role="list" aria-label="Equipped items, head to feet">
          {railSlots.map((slot) => {
            const items = (railItems[slot.id] ?? []).filter(row => matchesFuzzy(row.type === 'hair' ? CATALOG.styles[row.id]?.name : CATALOG.items[row.id]?.name, row.id, q.trim().toLowerCase()));
            if (q.trim() && !items.length) return null;
            // Faces match by style (color variants share one tile) — first
            // match wins so at most one tile ever shows selected.
            const wornFaceRow = slot.id === 'Face'
              ? items.find((row) => row.type === 'item' && faceStyleId(look.face) === faceStyleId(row.id))?.id
              : undefined;
            return (
              <div
                key={slot.id}
                role="listitem"
                className={'slot-row' + (catSec === slot.id ? ' on' : '')}
              >
                <span className="slot-label">{slot.label}</span>
                {(slot.id === 'Hair' || slot.id === 'Face') && <div className="rail-colors" role="group" aria-label={slot.id === 'Hair' ? 'Hair color' : 'Eye color'}>
                  {(slot.id === 'Hair' ? HAIR_COLORS : EYE_COLORS).map((color, i) => <ColorSwatch key={color} color={color} dot={(slot.id === 'Hair' ? HAIR_DOTS : EYE_DOTS)[i]} selected={(slot.id === 'Hair' ? look.hairCol : faceColorIndex(look.face)) === i} onClick={() => slot.id === 'Hair' ? patch({ hair: Math.floor(look.hair / 10) * 10 + i, hairCol: i }) : patch({ face: faceVariantId(look.sex, faceStyleId(look.face), i) })} />)}
                </div>}
                <div className="slot-tiles">
                  {items.slice(0, 6).map((row) => {
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
                          onClick={() => wearItemById(row.id * 10 + look.hairCol, 'Hair')}
                        />
                      );
                    }
                    const item = getItem(CATALOG, row.id);
                    if (!item) return null;
                    const faceId = item.sub === 'Face' ? faceVariantId(look.sex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                    const worn = item.sub === 'Face' ? row.id === wornFaceRow : Object.values(look.items).includes(row.id);
                    return (
                      <Tile
                        key={row.id}
                        mini
                        on={worn}
                        img={iconURL(faceId)}
                        label={item.name}
                        coupon={item.coupon}
                        mismatched={row.mismatch}
                        mismatchJob={row.mismatch ? item.requiredJobs?.find((j) => j !== 'Beginner') : undefined}
                        onClick={() => wearItemById(row.id, item.sub)}
                      />
                    );
                  })}
                  <button className="slot-seeall" aria-label={`See all ${slot.label}`} onClick={() => { openCat(slot.id); setCatQ(q); }}>See all →</button>
                </div>
              </div>
            );
          })}
        </div>

        {catSec && (
          <div id="drawer" className="open">
            <div id="drawer-head">
              <button id="drawer-back" onClick={() => { setCatSec(null); setSearchScope(null); setCatQ(''); }}>‹ back</button>
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
              <p className="cat-sub compact">🎲 Mystery = random · 👆 Signature = you pick · <button className="inline-link" onClick={() => setRatesOpen(true)}>rates</button></p>
            )}
            {catSec === 'cover-10day' && (
              <p className="cat-sub">10-day duration · sale ends Nov 18 · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            {EQUIP_SECTIONS.some((section) => section.id === catSec) && (
              <div id="drawer-filter" role="group" aria-label="Filter by class">
                {JOBS.map((j) => (
                  <button key={j} type="button" className={'job-pill' + (job === j ? ' on' : '')} aria-pressed={job === j} onClick={() => setJob(j)}>
                    {j === 'All' ? 'All' : j}
                  </button>
                ))}
              </div>
            )}
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
                  {EYE_COLORS.map((color, i) => <ColorSwatch key={color} color={color} dot={EYE_DOTS[i]} selected={faceColorIndex(look.face) === i} onClick={() => patch({ face: faceVariantId(look.sex, faceStyleId(look.face), i) })} />)}
                </div>
              </div>
            )}
            {catGroups && catGroups.some((g) => g.rows.length > 0) && catGroups.filter((g) => g.rows.length > 0).map((group) => {
              const open = expandedCats[group.key] !== false;
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
                        {bannerIds.map(id => <BannerDetails key={id} id={id} coupon={group.key.split(':')[1]} />)}
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
                              lastText={lastText}
                              onClick={() => wearItemById(row.id * 10 + look.hairCol, 'Hair')}
                            />
                          );
                        }
                        const item = getItem(CATALOG, row.id);
                        if (!item) return null;
                        const faceId = item.sub === 'Face' ? faceVariantId(look.sex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                        const worn = item.sub === 'Face' ? faceStyleId(look.face) === faceStyleId(row.id) : Object.values(look.items).includes(row.id);
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
                  const faceId = item.sub === 'Face' ? faceVariantId(look.sex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                  const worn = item.sub === 'Face' ? faceStyleId(look.face) === faceStyleId(row.id) : Object.values(look.items).includes(row.id);
                  const banner = getBanner(CATALOG, item.bannerId);
                  const lastText = !item.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined;
                  return (
                    <Tile
                      key={row.id}
                      on={worn}
                      img={iconURL(faceId)}
                      label={item.name}
                      attainable={item.attainable}
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
  onClick: () => void;
}) {
  const jobLabel = props.equipInfo;
  const notAttainable = props.attainable === false;
  const banner = getBanner(CATALOG, props.bannerId);
  const methods = props.coupon === 'signature'
    ? ['select'] as const
    : props.coupon === 'mystery'
      ? ['random'] as const
      : props.bannerId === 'style-oct26'
        ? ['random', 'select'] as const
        : props.bannerId === 'founder-crate-oct26' || props.bannerId === 'beta-style-sep26'
          ? ['random'] as const
          : banner ? ['select'] as const : [];
  const isCover = props.bannerId === 'covers-10day-nov26';
  const expiration = isCover
    ? `10-day duration · sale ends ${banner?.end ?? 'Nov 18'}`
    : banner?.end
      ? `${notAttainable ? 'Expired' : 'Available until'} ${banner.end}`
      : notAttainable ? 'Not currently attainable' : undefined;
  return (
    <button type="button" aria-pressed={props.on} aria-label={props.mismatched && props.mismatchJob ? `${props.label} (switches class to ${props.mismatchJob})` : props.label || undefined} title={props.mismatched && props.mismatchJob ? `Off-job · tap switches class to ${props.mismatchJob}` : undefined} className={'tile' + (props.mini ? ' mini' : '') + (props.on ? ' on' : '') + (notAttainable ? ' not-attainable' : '') + (props.mismatched ? ' mismatch' : '')} onClick={props.onClick}>
      <div className="tile-preview">
      {(methods.length > 0 || expiration) && (
        <div className="tile-badges">
          <div className="tile-methods">
            {methods.map((method) => (
              <span key={method} className="tile-badge" role="img" aria-label={method === 'random' ? 'Random acquisition' : 'Select your choice'} title={method === 'random' ? `Random${props.rate ? ` · ${props.rate}` : ''}` : 'Select your choice'}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  {method === 'random' ? <><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5 5h.01M11 5h.01M8 8h.01M5 11h.01M11 11h.01" strokeWidth="2.5" strokeLinecap="round" /></> : <path d="m3 2 10 6-5 1-2 5-3-12Z" strokeLinejoin="round" />}
                </svg>
              </span>
            ))}
          </div>
          {expiration && <span className={'tile-badge tile-expiration' + (notAttainable ? ' expired' : '')} role="img" aria-label={expiration} title={[expiration, props.lastText].filter(Boolean).join(' · ')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" strokeLinecap="round" /></svg>
          </span>}
        </div>
      )}
      {props.img ? (
        <img decoding="async" draggable={false} src={props.img} alt="" />
      ) : (
        <span style={{ fontSize: 18 }}>{props.big}</span>
      )}
      {props.rateBadge && <span className="tile-rate-badge" role="img" aria-label={`Chance ${props.rateBadge}`} title={`Chance ${props.rateBadge}`}>{shortRate(props.rateBadge)}</span>}
      </div>
      {props.label && !props.mini && <span className="tile-label">{props.label}</span>}
      {jobLabel && !props.mini && <em className="rate">{jobLabel}</em>}
      {props.rate && !props.mini && <em className="rate">{props.rate}</em>}

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
          <button className={look.sex === 'm' ? 'on' : ''} onClick={() => onSex('m')}>♂ Male</button>
          <button className={look.sex === 'f' ? 'on' : ''} onClick={() => onSex('f')}>♀ Female</button>
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

function Icon({ name }: { name: 'settings' | 'shuffle' | 'search' | 'close' | 'share' | 'check' | 'play' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'settings' && <><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.9 1.8v2.6l-1.9 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.6-2.6 2.2-1.3 2.5.7 2-3.5-1.9-1.8v-2.6l1.9-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z" /><circle cx="11" cy="12.5" r="3" /></>}
    {name === 'shuffle' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" strokeWidth="3" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'share' && <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>}
    {name === 'check' && <path d="m4.5 12.5 5 5 10-11" />}
    {name === 'play' && <><rect x="2.5" y="7" width="19" height="10" rx="5" /><path d="M8 10v4M6 12h4M16 11h.01M18 13h.01" strokeWidth="2" /></>}
  </svg>;
}

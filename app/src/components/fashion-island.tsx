import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  API,
  DEFAULT_LOOK,
  EYE_COLORS,
  HAIR_COLORS,
  STORAGE_SEX_KEY,
  applyPick,
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
  fuzzyScore,
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
  type SearchEntry,
  type SectionId,
  type Sex,
} from '../lib/fashion';
import catalogData from '../data/catalog.json';
import LayeredCharacterCanvas from './layered-character-canvas';
import './fashion.css';

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
const SKIN_TONES = ['#f7d7b5', '#e8b98a', '#c98d5f', '#8a5a33', '#5b6b7a', '#cfcfcf', '#f2e3c6'];
const ANIMS = ['stand1', 'stand2', 'walk1', 'walk2', 'jump', 'alert', 'sit', 'fly', 'ladder'];
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

function loadInitialLook(): Look {
  if (typeof window === 'undefined') return DEFAULT_LOOK;
  const fromQuery = decodeLook(window.location.search);
  if (fromQuery) return { ...DEFAULT_LOOK, ...fromQuery, sex: (fromQuery.sex as Sex) || DEFAULT_LOOK.sex };

  const fromHash = decodeLook(window.location.hash);
  if (fromHash) return { ...DEFAULT_LOOK, ...fromHash, sex: (fromHash.sex as Sex) || DEFAULT_LOOK.sex };

  const fromStorage = loadLookFromStorage();
  const savedSex = (localStorage.getItem(STORAGE_SEX_KEY) as Sex) || null;
  if (fromStorage) {
    return { ...DEFAULT_LOOK, ...fromStorage, sex: (fromStorage.sex as Sex) || savedSex || DEFAULT_LOOK.sex };
  }

  return { ...DEFAULT_LOOK, sex: savedSex || DEFAULT_LOOK.sex };
}

export default function FashionIsland() {
  const [look, setLook] = useState<Look>(() => loadInitialLook());
  const [skins, setSkins] = useState<number[]>([2000]);
  const [q, setQ] = useState('');
  const [searchScope, setSearchScope] = useState<SectionId | 'all' | null>(null);
  const [excludedSlots, setExcludedSlots] = useState<RandomEquipSlot[]>([]);
  const [nxOnly, setNxOnly] = useState(true);
  const [jobFilter, setJobFilter] = useState('All');
  const [classJob, setClassJob] = useState('Beginner');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [catSec, setCatSec] = useState<SectionId | null>(null);
  const [catQ, setCatQ] = useState('');
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [equipToast, setEquipToast] = useState<{ id: number; name: string; action: 'Equipped' | 'Removed' | 'Blocked'; replaced: string; sequence: number } | null>(null);
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
        if (Array.isArray(s) && s.length) setSkins(s as number[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Synchronize query parameter and localStorage
    const encoded = encodeLook(look);
    const currentUrl = new URL(window.location.href);
    currentUrl.search = encoded ? '?' + encoded : '';
    currentUrl.hash = '';
    history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
    saveLookToStorage(look);
  }, [look]);

  const patch = useCallback((p: Partial<Look>) => {
    setLook((l) => ({ ...l, ...p }));
  }, []);

  const chooseClass = useCallback((job: string) => {
    setClassJob(job);
    const weapon = randomClassicWeapon(look.sex, job);
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
      // Keep the worn style when it exists for the target sex; otherwise fall back
      // to the first active style of the target sex (catalog is the source of truth,
      // not hardcoded id ranges).
      const style = Math.floor(next.hair / 10);
      const targetHairs = CATALOG.indexes.hairs[sex].active;
      if (!targetHairs.includes(style)) {
        const fallback = targetHairs[0] ?? (sex === 'm' ? 3013 : 3115);
        next.hair = fallback * 10 + next.hairCol;
      }
      const targetFaces = CATALOG.indexes.faces[sex].active;
      const currentFaceName = getItem(CATALOG, next.face)?.name;
      const targetStyle = targetFaces.find((id) => getItem(CATALOG, id)?.name === currentFaceName);
      next.face = faceVariantId(sex, faceStyleId(targetStyle ?? targetFaces[0] ?? (sex === 'm' ? 20805 : 21816)), faceColorIndex(next.face));
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
    if (!cosmetic && !unequipping && nextItems[slot] !== id) {
      const weaponName = getItem(CATALOG, look.items.Weapon)?.name ?? 'two-handed weapon';
      setEquipToast({ id, name: `${getItem(CATALOG, id)?.name ?? sub} — needs one-handed weapon (wearing ${weaponName})`, action: 'Blocked', replaced: '', sequence: ++toastSequence.current });
      return;
    }
    const removed = Object.keys(look.items).filter((key) => nextItems[key] === undefined);
    const slotNames: Record<string, string> = { Top: 'shirt', Bottom: 'pants', Overall: 'overall', Shield: 'shield' };
    setEquipToast({
      id: selectedId,
      name: getItem(CATALOG, selectedId)?.name ?? sub,
      action: unequipping ? 'Removed' : 'Equipped',
      replaced: !unequipping && removed.length ? `Removed ${removed.map((key) => slotNames[key] ?? key.toLowerCase()).join(' and ')}` : '',
      sequence: ++toastSequence.current,
    });
    const recentKey = sub === 'Hair' ? Math.floor(id / 10) : id;
    setRecentIds((prev) => [recentKey, ...prev.filter((x) => x !== recentKey)].slice(0, 30));
    if (sub === 'Hair') patch({ hair: id, hairCol: id % 10 });
    else if (sub === 'Face') patch({ face: selectedId });
    else {
      const weaponSub = sub === 'Shield' ? getItem(CATALOG, nextItems.Weapon)?.sub : sub;
      const stance = unequipping && slot === 'Weapon' ? null : stanceForWeapon(weaponSub, look.anim);
      patch(stance ? { items: nextItems, anim: stance.anim, frame: stance.frame } : { items: nextItems });
    }
  }, [look, patch]);

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
  // Sort priority for rows/tiles: selected → most recently selected → rest.
  // recentIds stores style keys for hair (floor id/10), raw ids otherwise.
  const recentRank = useCallback((key: number) => recentIds.includes(key) ? recentIds.indexOf(key) : Infinity, [recentIds]);
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


  // Global fuzzy search: substring + subsequence, ranked by score (worn floats up).
  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const wornIds = new Set(Object.values(look.items));
    const scored: Array<{ entry: SearchEntry; score: number }> = [];
    for (const o of CATALOG.indexes.search) {
      if (o.sex !== 'u' && o.sex !== look.sex) continue;
      let score: number | null = null;
      if (String(o.id).includes(needle)) score = 400;
      else if (o.isStyle) score = fuzzyScore(needle, CATALOG.styles[o.id]?.name ?? o.name);
      else score = fuzzyScore(needle, o.name);
      if (score == null) continue;
      if (wornIds.has(o.id)) score += 500;
      scored.push({ entry: o, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 120).map((s) => s.entry);
  }, [q, look.sex, look.items]);

  type CatRow = { type: 'hair' | 'item'; id: number };
  // (needle filter inlined in catGroups below)
  // Grouped, sorted rows for the merged Hair/Face drawers.
  // Sort inside each group: selected → most recently selected → rest.
  const catGroups = useMemo(() => {
    if (catSec !== 'Hair' && catSec !== 'Face') return null;
    const needle = catQ.trim().toLowerCase();
    const matches = (name: string | undefined, id: number) => matchesFuzzy(name, id, needle);
    const buildHair = (key: string, label: string, ids: number[]) => {
      const wornStyle = Math.floor(look.hair / 10);
      const rows: CatRow[] = ids
        .filter((st) => matches(CATALOG.styles[st]?.name, st))
        .map((st) => ({ type: 'hair' as const, id: st }))
        .sort((a, b) => Number(a.id !== wornStyle) - Number(b.id !== wornStyle) || recentRank(a.id) - recentRank(b.id));
      return { key, label, rows };
    };
    const buildFace = (key: string, label: string, ids: number[]) => {
      const wornStyle = faceStyleId(look.face);
      const rows: CatRow[] = ids
        .filter((fid) => matches(CATALOG.items[fid]?.name, fid))
        .map((fid) => ({ type: 'item' as const, id: fid }))
        .sort((a, b) => Number(faceStyleId(a.id) !== wornStyle) - Number(faceStyleId(b.id) !== wornStyle) || recentRank(a.id) - recentRank(b.id));
      return { key, label, rows };
    };
    const groups = catSec === 'Hair'
      ? [buildHair('hair:mystery', 'Mystery', mysteryHairs), buildHair('hair:signature', 'Signature', signatureHairs), buildHair('hair:starter', 'Starter', starterHairStyles), buildHair('hair:past', 'Past rotation', pastHairStyles)]
      : [buildFace('face:mystery', 'Mystery', mysteryFaces), buildFace('face:signature', 'Signature', signatureFaces), buildFace('face:starter', 'Starter', starterFaces), buildFace('face:past', 'Past rotation', pastFaces)];
    // Groups holding the selected or most-recent pick float up; empty groups sink.
    const groupRank = (g: { rows: CatRow[] }) => g.rows.length === 0
      ? Infinity
      : Math.min(...g.rows.map((r) => {
        const worn = r.type === 'hair' ? Math.floor(look.hair / 10) === r.id : faceStyleId(look.face) === faceStyleId(r.id);
        return worn ? -1 : recentRank(r.id);
      }));
    return groups.sort((a, b) => groupRank(a) - groupRank(b));
  }, [catSec, catQ, look.hair, look.face, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces, recentRank]);
  // (category expand/collapse inlined at the drawer render below)

  const catRows = useMemo(() => {
    if (!catSec) return [];
    const needle = catQ.trim().toLowerCase();
    let r = equipSections.find((section) => section.id === catSec)?.ids ?? getGroupEquips(catSec);
    if (EQUIP_SECTIONS.some((section) => section.id === catSec)) {
      const selectedJob = catSec === 'Weapon' ? classJob : jobFilter;
      r = r.filter((id) => matchesJob(CATALOG.items[id], selectedJob));
    }
    if (needle) r = r.filter((id) => matchesFuzzy(CATALOG.items[id]?.name, id, needle));
    // Selected → most recently selected → rest. Class/gender equippability is
    // already enforced by the matchesJob filter above.
    const wornIds = new Set(Object.values(look.items));
    return r
      .map((id) => ({ type: 'item' as const, id }))
      .sort((a, b) => Number(!wornIds.has(a.id)) - Number(!wornIds.has(b.id)) || recentRank(a.id) - recentRank(b.id));
  }, [catSec, catQ, getGroupEquips, equipSections, jobFilter, classJob, look.items, recentRank]);


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
  // Equip slots: items in that section, filtered by class/gender.
  const railItems = useMemo(() => {
    const wornIds = new Set(Object.values(look.items));
    const wornHair = Math.floor(look.hair / 10);
    const wornFace = faceStyleId(look.face);
    const sortRows = (rows: CatRow[]) => rows.sort((a, b) => {
      const aWorn = a.type === 'hair' ? a.id === wornHair : wornIds.has(a.id);
      const bWorn = b.type === 'hair' ? b.id === wornHair : wornIds.has(b.id);
      return Number(!aWorn) - Number(!bWorn) || recentRank(a.id) - recentRank(b.id);
    });
    const result: Record<string, CatRow[]> = {};
    for (const slot of railSlots) {
      if (slot.id === 'Hair') {
        result[slot.id] = sortRows([...mysteryHairs, ...signatureHairs, ...starterHairStyles, ...pastHairStyles].map((id) => ({ type: 'hair' as const, id })));
      } else if (slot.id === 'Face') {
        result[slot.id] = sortRows([...mysteryFaces, ...signatureFaces, ...starterFaces, ...pastFaces].map((id) => ({ type: 'item' as const, id })));
      } else {
        const ids = equipSections.find((s) => s.id === slot.id)?.ids ?? [];
        const filtered = EQUIP_SECTIONS.some((s) => s.id === slot.id)
          ? ids.filter((id) => matchesJob(CATALOG.items[id], slot.id === 'Weapon' ? classJob : jobFilter))
          : ids;
        result[slot.id] = sortRows(filtered.map((id) => ({ type: 'item' as const, id })));
      }
    }
    return result;
  }, [railSlots, look.items, look.hair, look.face, mysteryHairs, signatureHairs, starterHairStyles, pastHairStyles, mysteryFaces, signatureFaces, starterFaces, pastFaces, equipSections, jobFilter, classJob, recentRank]);


  const wornForSlot = useCallback((slot: SectionId): { id: number; name: string; img: string } | null => {
    if (slot === 'Hair') {
      const meta = getStyle(CATALOG, Math.floor(look.hair / 10));
      if (!meta) return null;
      return { id: look.hair, name: `${meta.name} · ${HAIR_COLORS[look.hairCol]}`, img: iconURL(look.hair) };
    }
    if (slot === 'Face') {
      const meta = getItem(CATALOG, look.face);
      if (!meta) return null;
      return { id: look.face, name: `${meta.name} · ${EYE_COLORS[faceColorIndex(look.face)]}`, img: iconURL(look.face) };
    }
    const id = look.items[slot];
    const meta = getItem(CATALOG, id);
    if (id == null || !meta) return null;
    return { id, name: meta.name, img: iconURL(id) };
  }, [look]);

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
    <div className="mf">
      <div id="stage">
        <div id="controls">
          <button id="cog" onClick={() => setSettingsOpen(v => !v)} aria-label="Settings" aria-expanded={settingsOpen} aria-controls="settings"><Icon name="settings" /></button>
          <div className="controls-right">
            <button id="share" onClick={shareLook} aria-label="Share this look" title={shared ? 'Shared!' : copied ? 'Link copied!' : 'Share this look'}><Icon name={copied || shared ? 'check' : 'share'} /></button>
            <button id="shuffle" onClick={() => setLook(randomLook(look.sex, Math.random, excludedSlots, nxOnly, classJob))} aria-label="Randomize outfit"><Icon name="shuffle" /></button>
          </div>
        </div>
        <div id="canvas" onClick={shareLook} title="Tap to share this look" style={{ cursor: 'pointer' }}>
          <LayeredCharacterCanvas look={look} onRendered={() => setRendering(false)} />
          {rendering && <div id="spin" />}
        </div>
        <div className="equip-toast-slot" role="status" aria-live="polite" aria-atomic="true">
          {equipToast && <div className="equip-toast" key={equipToast.sequence}>
            <img src={iconURL(equipToast.id)} alt="" />
            <div><span>{equipToast.action} {equipToast.name}</span>{equipToast.replaced && <small>{equipToast.replaced}</small>}</div>
          </div>}
        </div>
      </div>
      {settingsOpen && (
        <div id="settings">
          {unattainableWorn.length > 0 && <div className="worn-alert">
            {unattainableWorn.map(w => `${w.meta.name}: ${formatAttainableInfo(CATALOG, w.id).statusText}`).join(' · ')}
          </div>}
          <div className="setrow">
            <span>skin</span>
            <div id="skins">
              {skins.map((s, i) => (
                <button
                  key={s}
                  title={'skin ' + s}
                  className={look.skin === s ? 'on' : ''}
                  style={{ background: SKIN_TONES[i % SKIN_TONES.length] }}
                  onClick={() => patch({ skin: s })}
                />
              ))}
            </div>
          </div>
          <div className="setrow">
            <span>playing</span>
            <div className="seg">
              <button className={look.sex === 'm' ? 'on' : ''} onClick={() => setSex('m')}>♂ Male</button>
              <button className={look.sex === 'f' ? 'on' : ''} onClick={() => setSex('f')}>♀ Female</button>
            </div>
          </div>
          <div className="setrow">
            <span>class</span>
            <select aria-label="Choose class and weapon" value={classJob} onChange={(e) => chooseClass(e.target.value)}>
              {['Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'].map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
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
            <button onClick={() => patch({ frame: Math.max(0, look.frame - 1) })}>‹</button>
            <span>{look.frame}</span>
            <button onClick={() => patch({ frame: look.frame + 1 })}>›</button>
          </div>
          <fieldset className="randomizer-options">
            <legend>Randomizer options</legend>
            <div className="randomizer-slots">
              <label><input type="checkbox" checked={nxOnly} onChange={e => setNxOnly(e.target.checked)} /> NX outfit + classic weapon</label>
            </div>
            <div className="randomizer-slots">
              {RANDOM_EQUIP_SLOTS.map(slot => <label key={slot}>
                <input type="checkbox" checked={excludedSlots.includes(slot)} onChange={e => setExcludedSlots(current => e.target.checked ? [...current, slot] : current.filter(value => value !== slot))} />
                No {({ Hat: 'hat', Top: 'shirt', Bottom: 'pants', Shoes: 'shoes', Glove: 'gloves', Cape: 'cape', Weapon: 'weapon' })[slot]}
              </label>)}
            </div>
          </fieldset>
          <div className="setrow">
            <button onClick={shareLook}>{copied || shared ? 'copied!' : 'copy link'}</button>
            <button onClick={() => { setLook((l) => ({ ...l, items: {} })); }}>clear worn</button>
          </div>
        </div>
      )}

      <div id="rail">
        <div id="rail-head">
          {searchScope === 'all' ? (
            <div className="head-search" role="search">
              <input id="item-search" autoFocus aria-label="Search all items" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearchScope(null); setQ(''); } }} placeholder="Search all items…" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              <button className="search-toggle" aria-label="Close search" onClick={() => { setSearchScope(null); setQ(''); }}><Icon name="close" /></button>
            </div>
          ) : (
            <>
              <img className="brand-leaf" src="/leaf.png" alt="" width="22" height="22" />
              <h1 id="brand">Maple Closet</h1>
              <a className="site-credit" href="https://builtby.win" target="_blank" rel="noopener noreferrer">builtby.win ↗</a>
              <button className="search-toggle" aria-label="Search items" aria-expanded={false} aria-controls="item-search" onClick={() => { setCatSec(null); setCatQ(''); setSearchScope('all'); setQ(''); }}><Icon name="search" /></button>
            </>
          )}
        </div>
        <div id="slot-list" role="list" aria-label="Equipped items, head to feet">
          {railSlots.map((slot) => {
            const items = railItems[slot.id] ?? [];
            return (
              <div
                key={slot.id}
                role="listitem"
                className={'slot-row' + (catSec === slot.id ? ' on' : '')}
              >
                <span className="slot-label">{slot.label}</span>
                <div className="slot-tiles">
                  {items.map((row) => {
                    if (row.type === 'hair') {
                      const meta = getStyle(CATALOG, row.id);
                      if (!meta) return null;
                      return (
                        <Tile
                          key={row.id}
                          mini
                          on={Math.floor(look.hair / 10) === row.id}
                          img={iconURL(row.id * 10 + look.hairCol)}
                          label=""
                          coupon={meta.coupon}
                          onClick={() => wearItemById(row.id * 10 + look.hairCol, 'Hair')}
                        />
                      );
                    }
                    const item = getItem(CATALOG, row.id);
                    if (!item) return null;
                    const faceId = item.sub === 'Face' ? faceVariantId(look.sex, faceStyleId(row.id), faceColorIndex(look.face)) : row.id;
                    const worn = item.sub === 'Face' ? faceStyleId(look.face) === faceStyleId(row.id) : Object.values(look.items).includes(row.id);
                    return (
                      <Tile
                        key={row.id}
                        mini
                        on={worn}
                        img={iconURL(faceId)}
                        label=""
                        coupon={item.coupon}
                        onClick={() => wearItemById(row.id, item.sub)}
                      />
                    );
                  })}
                </div>
                <button className="slot-seeall" onClick={() => openCat(slot.id)}>See all</button>
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
            {catSec === 'Face' && (
              <p className="cat-sub">Mystery gives a random style · Signature lets you pick · <button className="inline-link" onClick={() => setRatesOpen(true)}>view full rates</button> · <a href={NEWS_POST} target="_blank" rel="noreferrer">Nexon cash shop announcement</a></p>
            )}
            {catSec === 'cover-10day' && (
              <p className="cat-sub">10-day duration · sale ends Nov 18 · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            {EQUIP_SECTIONS.some((section) => section.id === catSec) && (
              <div id="drawer-filter">
                <label htmlFor="job-filter">{catSec === 'Weapon' ? 'Class' : 'Filter by job'}</label>
                <select id="job-filter" value={catSec === 'Weapon' ? classJob : jobFilter} onChange={e => catSec === 'Weapon' ? chooseClass(e.target.value) : setJobFilter(e.target.value)}>
                  {(catSec === 'Weapon' ? ['Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'] : ['All', 'Warrior', 'Magician', 'Bowman', 'Thief']).map(job => <option key={job} value={job}>{job === 'All' ? 'All classes' : job}</option>)}
                </select>
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
              return (
                <section key={group.key} className="drawer-group">
                  <button
                    type="button"
                    className="drawer-group-head"
                    aria-expanded={open}
                    onClick={() => setExpandedCats((prev) => ({ ...prev, [group.key]: !(prev[group.key] !== false) }))}
                  >
                    <span>{group.label} · {group.rows.length}</span>
                    <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
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
                              rate={styleMeta.rate}
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
                </section>
              );
            })}
            {!catGroups && catRows.length > 0 && (
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
            {((catGroups && !catGroups.some((g) => g.rows.length > 0)) || (!catGroups && catRows.length === 0)) && (
              <p className="slot-hint">{catQ.trim() ? `No matches for “${catQ.trim()}” in ${drawerTitle}. Try fewer letters — fuzzy finds typos too.` : `Nothing here yet.`}</p>
            )}

          </div>
        )}

        {searchScope === 'all' && (
          <div id="search-overlay">
            <div id="scroll">
              {searchResults ? (
                searchResults.length ? (
                  <div className="sec">
                    <h2><span>Search · {searchResults.length}</span></h2>
                    <div className="row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                      {searchResults.map((entry) => (
                        <SearchTile key={entry.id + ':' + entry.sub} entry={entry} look={look} onWear={() => {
                          if (entry.isStyle) wearItemById(entry.id * 10 + look.hairCol, 'Hair');
                          else wearItemById(entry.id, entry.sub);
                        }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="slot-hint">No matches for “{q.trim()}”. Try fewer letters — fuzzy finds typos too.</p>
                )
              ) : (
                <p className="slot-hint">Type to search every hair, face, and equip by name or id.</p>
              )}
            </div>
          </div>
        )}

        {!catSec && searchScope !== 'all' && (
          <div id="scroll">
            <p className="slot-hint">Pick a slot above to browse styles and equips. Your character updates live on the left.</p>
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

const SearchTile = memo(function SearchTile(props: { entry: SearchEntry; look: Look; onWear: () => void }) {
  const { entry: s, look } = props;
  if (s.isStyle) {
    const styleMeta = getStyle(CATALOG, s.id);
    const worn = Math.floor(look.hair / 10) === s.id;
    const banner = getBanner(CATALOG, styleMeta?.bannerId);
    return (
      <Tile
        on={worn}
        img={iconURL(s.id * 10 + look.hairCol)}
        label={s.name}
        attainable={styleMeta?.attainable}
        rate={styleMeta?.rate}
        bannerId={styleMeta?.bannerId}
        coupon={styleMeta?.coupon}
        lastText={!styleMeta?.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined}
        onClick={props.onWear}
      />
    );
  }
  const item = getItem(CATALOG, s.id);
  const faceId = s.sub === 'Face' ? faceVariantId(look.sex, faceStyleId(s.id), faceColorIndex(look.face)) : s.id;
  const worn = s.sub === 'Face' ? faceStyleId(look.face) === faceStyleId(s.id) : Object.values(look.items).includes(s.id);
  const banner = getBanner(CATALOG, item?.bannerId);
  return (
    <Tile
      on={worn}
      img={iconURL(faceId)}
      label={s.name}
      attainable={item?.attainable}
      rate={item?.rate}
      bannerId={item?.bannerId}
      coupon={item?.coupon}
      equipInfo={equipInfo(item)}
      lastText={!item?.attainable && banner?.start && banner?.end ? `${banner.start.slice(5)} – ${banner.end.slice(5)}` : undefined}
      onClick={props.onWear}
    />
  );
});

const NEWS_POST = 'https://www.nexon.com/maplestory/news/sale/45819/founder-s-access-cash-shop';
const STYLE_RATES = 'https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45537';

const Section = memo(function Section(props: { id: string; label: string; sub?: string; onSeeAll?: () => void; news?: boolean; onRates?: () => void; children: React.ReactNode }) {
  return (
    <div className="sec">
      <h2>
        <span>{props.label}{props.news && <a className="newslink" href={NEWS_POST} target="_blank" rel="noreferrer" title="Nexon cash shop post"> ↗</a>}{props.onRates && <button className="newslink rates-trigger" onClick={props.onRates} title="View mystery coupon rates"> rates</button>}</span>
        {props.onSeeAll && <button className="seeall" onClick={props.onSeeAll}>see all →</button>}
      </h2>
      {props.sub && <p className="sec-sub">{props.sub}</p>}
      <div className="row">{props.children}</div>
    </div>
  );
});

const Tile = memo(function Tile(props: {
  on: boolean;
  img?: string;
  label: string;
  big?: string;
  rate?: string;
  group?: string;
  attainable?: boolean;
  lastText?: string;
  endText?: string;
  equipInfo?: string;
  bannerId?: string;
  coupon?: 'mystery' | 'signature';
  mini?: boolean;
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
    <button type="button" aria-pressed={props.on} className={'tile' + (props.on ? ' on' : '') + (notAttainable ? ' not-attainable' : '')} onClick={props.onClick}>
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
        <img loading="lazy" decoding="async" src={props.img} alt="" />
      ) : (
        <span style={{ fontSize: 18 }}>{props.big}</span>
      )}
      </div>
      {props.label && !props.mini && <span className="tile-label">{props.label}</span>}
      {jobLabel && !props.mini && <em className="rate">{jobLabel}</em>}
      {props.rate && !props.mini && <em className="rate">{props.rate}</em>}
    </button>
  );
});

function Icon({ name }: { name: 'settings' | 'shuffle' | 'search' | 'close' | 'share' | 'check' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'settings' && <><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.9 1.8v2.6l-1.9 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.6-2.6 2.2-1.3 2.5.7 2-3.5-1.9-1.8v-2.6l1.9-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z" /><circle cx="11" cy="12.5" r="3" /></>}
    {name === 'shuffle' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" strokeWidth="3" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'share' && <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>}
    {name === 'check' && <path d="m4.5 12.5 5 5 10-11" />}
  </svg>;
}

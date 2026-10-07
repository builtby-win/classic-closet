import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  API,
  DEFAULT_LOOK,
  EYE_COLORS,
  GROUP_SHORT,
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
  loadLookFromStorage,
  matchesJob,
  randomClassicWeapon,
  renderURL,
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
import CharacterCanvas from './character-canvas';
import './fashion.css';

const CATALOG = catalogData as FastCatalog;
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
const ROW_CAP = 12;

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

function updateSocialMeta(look: Look) {
  if (typeof document === 'undefined') return;
  const previewImg = renderURL(look);
  const metaOg = document.querySelector('meta[property="og:image"]');
  if (metaOg) metaOg.setAttribute('content', previewImg);
  const metaTw = document.querySelector('meta[name="twitter:image"]');
  if (metaTw) metaTw.setAttribute('content', previewImg);
}

export default function FashionIsland() {
  const [look, setLook] = useState<Look>(() => loadInitialLook());
  const [skins, setSkins] = useState<number[]>([2000]);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [excludedSlots, setExcludedSlots] = useState<RandomEquipSlot[]>([]);
  const [nxOnly, setNxOnly] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState('All');
  const [classJob, setClassJob] = useState('Beginner');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [catSec, setCatSec] = useState<SectionId | null>(null);
  const [catQ, setCatQ] = useState('');
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
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
    updateSocialMeta(look);
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
    if (sub === 'Hair') patch({ hair: id, hairCol: id % 10 });
    else if (sub === 'Face') patch({ face: selectedId });
    else {
      const stance = unequipping && slot === 'Weapon' ? null : stanceForWeapon(sub === 'Shield' ? getItem(CATALOG, nextItems.Weapon)?.sub : sub, look.anim);
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
  // Worn item first, then the rest — sections open on the current pick
  const wornFirst = useCallback(<T,>(ids: T[], worn: (id: T) => boolean) => {
    const i = ids.findIndex(worn);
    return i <= 0 ? ids : [ids[i], ...ids.slice(0, i), ...ids.slice(i + 1)];
  }, []);
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
      .filter((id) => !groupFilter || CATALOG.items[id]?.group === groupFilter);
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
  }, [getGroupEquips, groupFilter]);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'style-coupon': activeHairStyles.length + activeFaces.length,
      'founder-crate': CATALOG.indexes.groups['founder-crate'].u.length + CATALOG.indexes.groups['founder-crate'][look.sex].length,
      'aurora-crate': CATALOG.indexes.groups['aurora-crate'].u.length + CATALOG.indexes.groups['aurora-crate'][look.sex].length,
      'cover-10day': CATALOG.indexes.groups['cover-10day'].u.length + CATALOG.indexes.groups['cover-10day'][look.sex].length,
    };
    if (pastHairStyles.length || pastFaces.length) {
      counts['past-rotation'] = pastHairStyles.length + pastFaces.length;
    }
    return counts;
  }, [look.sex, activeHairStyles.length, activeFaces.length, pastHairStyles.length, pastFaces.length]);

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    return CATALOG.indexes.search
      .filter((o) => (o.sex === 'u' || o.sex === look.sex) && (o.name.toLowerCase().includes(needle) || String(o.id).includes(needle)))
      .filter((o) => {
        const item = o.isStyle ? getItem(CATALOG, o.id * 10) : getItem(CATALOG, o.id);
        return !groupFilter || item?.group === groupFilter;
      })
      .slice(0, 120);
  }, [q, look.sex, groupFilter]);

  const catRows = useMemo(() => {
    if (!catSec) return [];
    const needle = catQ.trim().toLowerCase();
    if (catSec === 'Hair') {
      let r = mysteryHairs;
      if (needle) r = r.filter((st) => CATALOG.styles[st]?.name.toLowerCase().includes(needle) || String(st).includes(needle));
      return r.map((st) => ({ type: 'hair' as const, id: st }));
    }
    if (catSec === 'HairSignature') {
      let r = signatureHairs;
      if (needle) r = r.filter((st) => CATALOG.styles[st]?.name.toLowerCase().includes(needle) || String(st).includes(needle));
      return r.map((st) => ({ type: 'hair' as const, id: st }));
    }
    if (catSec === 'HairClassic') {
      let r = starterHairStyles;
      if (needle) r = r.filter((st) => CATALOG.styles[st]?.name.toLowerCase().includes(needle) || String(st).includes(needle));
      return r.map((st) => ({ type: 'hair' as const, id: st }));
    }
    if (catSec === 'HairPast') {
      let r = pastHairStyles;
      if (needle) r = r.filter((st) => CATALOG.styles[st]?.name.toLowerCase().includes(needle) || String(st).includes(needle));
      return r.map((st) => ({ type: 'hair' as const, id: st }));
    }
    if (catSec === 'Face') {
      let r = mysteryFaces;
      if (needle) r = r.filter((fid) => CATALOG.items[fid]?.name.toLowerCase().includes(needle) || String(fid).includes(needle));
      return r.map((fid) => ({ type: 'item' as const, id: fid }));
    }
    if (catSec === 'FaceSignature') {
      let r = signatureFaces;
      if (needle) r = r.filter((fid) => CATALOG.items[fid]?.name.toLowerCase().includes(needle) || String(fid).includes(needle));
      return r.map((fid) => ({ type: 'item' as const, id: fid }));
    }
    if (catSec === 'FaceClassic') {
      let r = starterFaces;
      if (needle) r = r.filter((fid) => CATALOG.items[fid]?.name.toLowerCase().includes(needle) || String(fid).includes(needle));
      return r.map((fid) => ({ type: 'item' as const, id: fid }));
    }
    if (catSec === 'FacePast') {
      let r = pastFaces;
      if (needle) r = r.filter((fid) => CATALOG.items[fid]?.name.toLowerCase().includes(needle) || String(fid).includes(needle));
      return r.map((fid) => ({ type: 'item' as const, id: fid }));
    }
    let r = equipSections.find((section) => section.id === catSec)?.ids ?? getGroupEquips(catSec);
    if (EQUIP_SECTIONS.some((section) => section.id === catSec)) {
      const selectedJob = catSec === 'Weapon' ? classJob : jobFilter;
      r = r.filter((id) => matchesJob(CATALOG.items[id], selectedJob));
    }
    if (needle) r = r.filter((id) => CATALOG.items[id]?.name.toLowerCase().includes(needle) || String(id).includes(needle));
    return r.map((id) => ({ type: 'item' as const, id }));
  }, [catSec, catQ, mysteryHairs, signatureHairs, pastHairStyles, starterHairStyles, mysteryFaces, signatureFaces, pastFaces, starterFaces, getGroupEquips, equipSections, jobFilter, classJob]);

  const openCat = useCallback((sec: SectionId) => {
    setCatSec(sec);
    setCatQ('');
  }, []);

  const copyLink = useCallback(async () => {
    try {
      const targetUrl = new URL(window.location.href);
      targetUrl.search = '';
      for (const [k, v] of new URLSearchParams(encodeLook(look))) targetUrl.searchParams.set(k, v);
      targetUrl.hash = '';
      await navigator.clipboard.writeText(targetUrl.toString());
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

  return (
    <div className="mf">
      <div id="stage">
        <header className="site-brand">
          <h1 id="brand"><span aria-hidden="true">🍁</span> Maple Closet</h1>
          <a className="site-credit" href="https://builtby.win" target="_blank" rel="noopener noreferrer">builtby.win ↗</a>
        </header>
        <div id="controls">
          <button id="cog" onClick={() => setSettingsOpen(v => !v)} aria-label="Settings" aria-expanded={settingsOpen} aria-controls="settings"><Icon name="settings" /></button>
          <button id="shuffle" onClick={() => setLook(randomLook(look.sex, Math.random, excludedSlots, nxOnly, classJob))} aria-label="Randomize outfit"><Icon name="shuffle" /></button>
        </div>
        <div id="canvas">
          <CharacterCanvas look={look} onRendered={() => setRendering(false)} />
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
            <button onClick={copyLink}>{copied ? 'copied!' : 'copy link'}</button>
            <button onClick={() => { setLook((l) => ({ ...l, items: {} })); }}>clear worn</button>
          </div>
        </div>
      )}

      <div id="sheet">
        <div id="grab" />
        {searchOpen && <div id="bar" role="search">
          <input id="item-search" autoFocus aria-label="Search all items" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setQ(''); } }} placeholder="Search all items…" enterKeyHint="search" />
          <button className="icon-button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQ(''); }}><Icon name="close" /></button>
        </div>}
        <div id="groups">
          <button id="search-toggle" className={searchOpen ? 'on' : ''} aria-label="Search items" aria-expanded={searchOpen} aria-controls="item-search" onClick={() => { setSearchOpen(v => !v); setQ(''); }}><Icon name="search" /></button>
          <button className={groupFilter === null ? 'on' : ''} onClick={() => setGroupFilter(null)}>All</button>
          {Object.entries(groupCounts).map(([g, n]) => (
            <button key={g} className={groupFilter === g ? 'on' : ''} onClick={() => setGroupFilter(groupFilter === g ? null : g)}>
              {GROUP_SHORT[g] ?? g} · {n}
            </button>
          ))}
        </div>

        {!catSec && !searchResults && (
          <div id="scroll">
            <div className="color-strip">
              <span className="color-strip-label">Hair color · {HAIR_COLORS[look.hairCol]}</span>
              <div className="color-band" role="group" aria-label="Hair color">
                {HAIR_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={c}
                    aria-pressed={look.hairCol === i}
                    className={'color-swatch' + (look.hairCol === i ? ' on' : '')}
                    style={{ background: HAIR_DOTS[i] }}
                    onClick={() => patch({ hair: Math.floor(look.hair / 10) * 10 + i, hairCol: i })}
                  />
                ))}
              </div>
            </div>
            <Section id="Hair" label="🎲 Mystery Hair" onSeeAll={() => openCat('Hair')}>
              {wornFirst(mysteryHairs.filter((st) => getStyle(CATALOG, st)), (st) => Math.floor(look.hair / 10) === st).slice(0, ROW_CAP).map((st) => {
                const styleMeta = getStyle(CATALOG, st)!;
                return (
                  <Tile
                    key={st}
                    on={Math.floor(look.hair / 10) === st}
                    img={iconURL(st * 10 + look.hairCol)}
                    label={styleMeta.name}
                    rate={styleMeta.rate || '16.67%'}
                    attainable={true}
                    bannerId={styleMeta.bannerId}
                    coupon={styleMeta.coupon}
                    onClick={() => {
                      wearItemById(st * 10 + look.hairCol, 'Hair');
                    }}
                  />
                );
              })}
            </Section>

            {/* 2. SIGNATURE HAIR (pick your style) */}
            <Section id="HairSignature" label="✨ Signature Hair" onSeeAll={() => openCat('HairSignature')}>
              {wornFirst(signatureHairs.filter((st) => getStyle(CATALOG, st)), (st) => Math.floor(look.hair / 10) === st).slice(0, ROW_CAP).map((st) => {
                const styleMeta = getStyle(CATALOG, st)!;
                return (
                  <Tile
                    key={st}
                    on={Math.floor(look.hair / 10) === st}
                    img={iconURL(st * 10 + look.hairCol)}
                    label={styleMeta.name}
                    rate="Signature"
                    attainable={true}
                    bannerId={styleMeta.bannerId}
                    coupon={styleMeta.coupon}
                    onClick={() => {
                      wearItemById(st * 10 + look.hairCol, 'Hair');
                    }}
                  />
                );
              })}
            </Section>

            <Section id="HairClassic" label="Starter Hair" onSeeAll={() => openCat('HairClassic')}>
              {wornFirst(starterHairStyles, (st) => Math.floor(look.hair / 10) === st).map((st) => {
                const meta = getStyle(CATALOG, st)!;
                return <Tile key={st} on={Math.floor(look.hair / 10) === st} img={iconURL(st * 10 + look.hairCol)} label={meta.name} attainable={true} onClick={() => wearItemById(st * 10 + look.hairCol, 'Hair')} />;
              })}
            </Section>
            {pastHairStyles.length > 0 && <Section id="HairPast" label="Past Rotation Hair" onSeeAll={() => openCat('HairPast')}>
              {wornFirst(pastHairStyles, (st) => Math.floor(look.hair / 10) === st).slice(0, ROW_CAP).map((st) => {
                const meta = getStyle(CATALOG, st)!;
                return <Tile key={st} on={Math.floor(look.hair / 10) === st} img={iconURL(st * 10 + look.hairCol)} label={meta.name} attainable={meta.attainable} bannerId={meta.bannerId} onClick={() => wearItemById(st * 10 + look.hairCol, 'Hair')} />;
              })}
            </Section>}


            <div className="color-strip">
              <span className="color-strip-label">Eye color · {EYE_COLORS[faceColorIndex(look.face)]}</span>
              <div className="color-band" role="group" aria-label="Eye color">
                {EYE_COLORS.map((color, i) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={color}
                    aria-pressed={faceColorIndex(look.face) === i}
                    className={'color-swatch' + (faceColorIndex(look.face) === i ? ' on' : '')}
                    style={{ background: EYE_DOTS[i] }}
                    onClick={() => patch({ face: faceVariantId(look.sex, faceStyleId(look.face), i) })}
                  />
                ))}
              </div>
            </div>

            {/* 4. MYSTERY FACES (random 16.67%) */}
            <Section id="Face" label="🎲 Mystery Faces" onSeeAll={() => openCat('Face')}>
              {wornFirst(mysteryFaces.filter((fid) => getItem(CATALOG, fid)), (fid) => faceStyleId(look.face) === faceStyleId(fid)).slice(0, ROW_CAP).map((fid) => {
                const faceMeta = getItem(CATALOG, fid)!;
                const faceId = faceVariantId(look.sex, faceStyleId(fid), faceColorIndex(look.face));
                return (
                  <Tile
                    key={fid}
                    on={faceStyleId(look.face) === faceStyleId(fid)}
                    img={iconURL(faceId)}
                    label={faceMeta.name}
                    rate={faceMeta.rate}
                    attainable={true}
                    bannerId={faceMeta.bannerId}
                    coupon={faceMeta.coupon}
                    onClick={() => wearItemById(fid, 'Face')}
                  />
                );
              })}
            </Section>

            {/* 5. SIGNATURE FACES (pick your face) */}
            <Section id="FaceSignature" label="✨ Signature Faces" onSeeAll={() => openCat('FaceSignature')}>
              {wornFirst(signatureFaces.filter((fid) => getItem(CATALOG, fid)), (fid) => faceStyleId(look.face) === faceStyleId(fid)).slice(0, ROW_CAP).map((fid) => {
                const faceMeta = getItem(CATALOG, fid)!;
                const faceId = faceVariantId(look.sex, faceStyleId(fid), faceColorIndex(look.face));
                return (
                  <Tile
                    key={fid}
                    on={faceStyleId(look.face) === faceStyleId(fid)}
                    img={iconURL(faceId)}
                    label={faceMeta.name}
                    rate="Signature"
                    attainable={true}
                    bannerId={faceMeta.bannerId}
                    coupon={faceMeta.coupon}
                    onClick={() => wearItemById(fid, 'Face')}
                  />
                );
              })}
            </Section>

            <Section id="FaceClassic" label="Starter Eyes" onSeeAll={() => openCat('FaceClassic')}>
              {wornFirst(starterFaces, (fid) => faceStyleId(look.face) === faceStyleId(fid)).map((fid) => {
                const meta = getItem(CATALOG, fid)!;
                return <Tile key={fid} on={faceStyleId(look.face) === faceStyleId(fid)} img={iconURL(faceVariantId(look.sex, faceStyleId(fid), faceColorIndex(look.face)))} label={meta.name} attainable={true} onClick={() => wearItemById(fid, 'Face')} />;
              })}
            </Section>
            {pastFaces.length > 0 && <Section id="FacePast" label="Past Rotation Eyes" onSeeAll={() => openCat('FacePast')}>
              {wornFirst(pastFaces, (fid) => faceStyleId(look.face) === faceStyleId(fid)).slice(0, ROW_CAP).map((fid) => {
                const meta = getItem(CATALOG, fid)!;
                return <Tile key={fid} on={faceStyleId(look.face) === faceStyleId(fid)} img={iconURL(faceVariantId(look.sex, faceStyleId(fid), faceColorIndex(look.face)))} label={meta.name} attainable={meta.attainable} bannerId={meta.bannerId} onClick={() => wearItemById(fid, 'Face')} />;
              })}
            </Section>}

            {/* Equipment by slot; shirts and pants are alternatives to an overall. */}
            {equipSections.map(({ id: slot, label, ids: list }) => {
              if (!list.length) return null;
              return (
                <Section
                  key={slot}
                  id={slot}
                  label={label}
                  onSeeAll={() => openCat(slot)}
                >
                  {wornFirst(list.filter((id) => getItem(CATALOG, id)), (id) => Object.values(look.items).includes(id)).slice(0, ROW_CAP).map((id) => {
                    const item = getItem(CATALOG, id)!;
                    const worn = Object.values(look.items).includes(id);
                    return (
                      <Tile
                        key={id}
                        on={worn}
                        img={iconURL(id)}
                        label={item.name}
                        rate={item.rate}
                        bannerId={item.bannerId}
                        equipInfo={equipInfo(item)}
                        coupon={item.coupon}
                        attainable={item.attainable}
                        onClick={() => wearItemById(id, item.sub)}
                      />
                    );
                  })}
                </Section>
              );
            })}

          </div>
        )}

        {!catSec && searchResults && (
          <div id="scroll">
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
          </div>
        )}

        {catSec && (
          <div id="catpage" className="open">
            <div id="cathead">
              <button id="back" onClick={() => setCatSec(null)}>‹ back</button>
              <div id="cattitle">
                {EQUIP_SECTIONS.find((section) => section.id === catSec)?.label ?? (catSec === 'Hair'
                  ? '🎲 Mystery Hair · 5,500 NX'
                  : catSec === 'HairSignature'
                    ? '✨ Signature Hair · 7,500 NX'
                    : catSec === 'HairClassic'
                      ? 'Starter Hair'
                    : catSec === 'HairPast'
                      ? 'Past Rotation Hair'
                      : catSec === 'Face'
                        ? '🎲 Mystery Faces · 3,500 NX'
                        : catSec === 'FaceSignature'
                          ? '✨ Signature Faces · 5,500 NX'
                          : catSec === 'FaceClassic'
                            ? 'Starter Eyes'
                          : catSec === 'FacePast'
                            ? 'Past Rotation Eyes'
                            : catSec === 'founder-crate'
                              ? "Founder's Crate"
                              : catSec === 'aurora-crate'
                                ? 'Aurora Crate'
                                : '10-Day Covers · 700–1,200 NX')}
              </div>
            </div>
            {['Hair', 'Face'].includes(catSec) && (
              <p className="cat-sub">Random style per coupon · 16.67% each · coupon lasts 14 days · <a href={STYLE_RATES} target="_blank" rel="noreferrer">Nexon rates</a> · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            {['HairSignature', 'FaceSignature'].includes(catSec) && (
              <p className="cat-sub">Choose your style · coupon lasts 14 days · ends Oct 28 · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            {catSec === 'cover-10day' && (
              <p className="cat-sub">10-day duration · sale ends Nov 18 · <a href={NEWS_POST} target="_blank" rel="noreferrer">cash shop post</a></p>
            )}
            <div id="catbar">
              <input value={catQ} onChange={(e) => setCatQ(e.target.value)} placeholder="filter…" enterKeyHint="search" />
            </div>
            {EQUIP_SECTIONS.some((section) => section.id === catSec) && (
              <div className="cat-filter">
                <label htmlFor="job-filter">{catSec === 'Weapon' ? 'Class' : 'Filter by job'}</label>
                <select id="job-filter" value={catSec === 'Weapon' ? classJob : jobFilter} onChange={e => catSec === 'Weapon' ? chooseClass(e.target.value) : setJobFilter(e.target.value)}>
                  {(catSec === 'Weapon' ? ['Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'] : ['All', 'Warrior', 'Magician', 'Bowman', 'Thief']).map(job => <option key={job} value={job}>{job === 'All' ? 'All classes' : job}</option>)}
                </select>
              </div>
            )}
            {(['Hair', 'HairSignature', 'HairClassic', 'HairPast'] as SectionId[]).includes(catSec) && (
              <ColorStrip label={`Hair color · ${HAIR_COLORS[look.hairCol]}`} ariaLabel="Hair color">
                {HAIR_COLORS.map((color, i) => <ColorSwatch key={color} color={color} dot={HAIR_DOTS[i]} selected={look.hairCol === i} onClick={() => patch({ hair: Math.floor(look.hair / 10) * 10 + i, hairCol: i })} />)}
              </ColorStrip>
            )}
            {(['Face', 'FaceSignature', 'FaceClassic', 'FacePast'] as SectionId[]).includes(catSec) && (
              <ColorStrip label={`Eye color · ${EYE_COLORS[faceColorIndex(look.face)]}`} ariaLabel="Eye color">
                {EYE_COLORS.map((color, i) => <ColorSwatch key={color} color={color} dot={EYE_DOTS[i]} selected={faceColorIndex(look.face) === i} onClick={() => patch({ face: faceVariantId(look.sex, faceStyleId(look.face), i) })} />)}
              </ColorStrip>
            )}
            <div id="catgrid">
              {catRows.map((row) => {
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
          </div>
        )}
      </div>
    </div>
  );
}

function ColorStrip(props: { label: string; ariaLabel: string; children: React.ReactNode }) {
  return <div className="color-strip">
    <span className="color-strip-label">{props.label}</span>
    <div className="color-band" role="group" aria-label={props.ariaLabel}>{props.children}</div>
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

const Section = memo(function Section(props: { id: string; label: string; sub?: string; onSeeAll?: () => void; news?: boolean; rates?: boolean; children: React.ReactNode }) {
  return (
    <div className="sec">
      <h2>
        <span>{props.label}{props.news && <a className="newslink" href={NEWS_POST} target="_blank" rel="noreferrer" title="Nexon cash shop post"> ↗</a>}{props.rates && <a className="newslink" href={STYLE_RATES} target="_blank" rel="noreferrer" title="Nexon drop rates"> rates</a>}</span>
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
      <span className="tile-label">{props.label}</span>
      {jobLabel && <em className="rate">{jobLabel}</em>}
      {props.rate && <em className="rate">{props.rate}</em>}
    </button>
  );
});

function Icon({ name }: { name: 'settings' | 'shuffle' | 'search' | 'close' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'settings' && <><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.9 1.8v2.6l-1.9 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.6-2.6 2.2-1.3 2.5.7 2-3.5-1.9-1.8v-2.6l1.9-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z" /><circle cx="11" cy="12.5" r="3" /></>}
    {name === 'shuffle' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" strokeWidth="3" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
  </svg>;
}

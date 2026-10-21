/**
 * Rebuilds src/data/catalog.json into a fully normalized, relational FastCatalog entity store.
 *
 * Architecture:
 *   - Entity Tables:
 *     - banners: Record<bannerId, BannerMeta> (single source of truth for banner windows)
 *     - styles: Record<styleId, HairStyleMeta> (single source of truth for hair styles, virtualizing colors 0..7)
 *     - items: Record<itemId, ItemMeta> (single source of truth for equips and faces)
 *   - Index Tables:
 *     - indexes.hairs: { m/f: { active: number[], past: number[] } } (arrays of style IDs)
 *     - indexes.faces: { m/f: { active: number[], past: number[] } } (arrays of face IDs)
 *     - indexes.groups: { [groupId]: { m: number[], f: number[], u: number[] } } (arrays of equip IDs)
 *     - indexes.search: SearchEntry[] (compact search index without duplicate color rows)
 *
 * Run:
 *   pnpm catalog
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://maplestory.io/api/MCW/CBT2';
const OSMS_REF = '63db09449642c4bf3414276223e4cb7d72af02d9';
const OSMS_DATA = `https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/${OSMS_REF}/data/current`;
const CMS = 'https://g.nexonstatic.com/maplestory/cms/v1/general-posts';
type AssetSource = 'OSMS' | 'GMS' | 'MCW';
/** Region a pin forces for baking. 'MCW' is strict: MCW frames or throw, never
 *  silently fall back to a same-id different-art GMS record (cf. White Beanie). */
type PinSource = 'MCW' | 'GMS' | 'OSMS';

interface RawItem {
  id: number;
  name: string;
  requiredGender?: number;
  isCash?: boolean;
  requiredJobs?: string[];
  requiredLevel?: number;
  typeInfo: { overallCategory: string; subCategory: string };
  src?: AssetSource;
}

interface OsmsItem {
  id: number;
  name: string;
  category: string;
  sub_category: string;
  gender?: 'male' | 'female';
  stats?: { reqLevel?: number };
  weapon_type?: string;
  req_job_label?: string;
}

interface OsmsBeautyEntry {
  id: number;
  name: string;
  gender: 'male' | 'female';
}

interface BannerDef {
  id: string;
  type?: string;
  label: string;
  start: string;
  end: string;
  note?: string;
  post?: string;
  rates?: string;
  hairs?: Array<{ name: string; sex: 'm' | 'f'; rate?: string; style?: number; src?: AssetSource; history?: string[]; unverified?: boolean; unverifiedNote?: string }>;
  faces?: Array<{ name: string; sex: 'm' | 'f'; rate?: string; id?: number; src?: AssetSource; history?: string[]; unverified?: boolean; unverifiedNote?: string }>;
  signatureHairs?: Array<{ name: string; sex: 'm' | 'f'; style?: number; src?: AssetSource; history?: string[]; unverified?: boolean }>;
  signatureFaces?: Array<{ name: string; sex: 'm' | 'f'; id?: number; src?: AssetSource; history?: string[]; unverified?: boolean }>;
}
interface RotationsFile {
  current: BannerDef[];
  past?: BannerDef[];
}

export interface BannerMeta {
  id: string;
  label: string;
  start: string | null;
  end: string | null;
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
  src?: AssetSource;
  history?: string[];
  coupon?: 'mystery' | 'signature';
  unverified?: boolean;
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
  src?: AssetSource;
  history?: string[];
  coupon?: 'mystery' | 'signature';
  unverified?: boolean;
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
      m: { active: number[]; past: number[] };
      f: { active: number[]; past: number[] };
    };
    faces: {
      m: { active: number[]; past: number[] };
      f: { active: number[]; past: number[] };
    };
    groups: Record<string, {
      m: number[];
      f: number[];
      u: number[];
    }>;
    search: SearchEntry[];
  };
}

function stripHtml(body: string): string[] {
  return body
    .replace(/<[^>]+>/g, '|')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function rateTable(postId: number): Promise<Map<string, string>> {
  try {
    const post = (await fetch(`${CMS}/${postId}`).then((r) => r.json())) as { body: string };
    const segs = stripHtml(post.body);
    const pairs = new Map<string, string>();
    segs.forEach((s, j) => {
      if (/^[\d.]+%$/.test(s) && j > 0 && !/^[\d.]+%$/.test(segs[j - 1])) {
        pairs.set(segs[j - 1], s);
      }
    });
    return pairs;
  } catch (e) {
    console.warn(`Failed to fetch rate table ${postId}:`, e);
    return new Map();
  }
}

const rotationsPath = join(ROOT, 'data', 'rotations.json');
const rotations: RotationsFile = JSON.parse(readFileSync(rotationsPath, 'utf8'));

const founderRates = await rateTable(45538);
const mysteryRates = await rateTable(46331);
const auroraRates = await rateTable(45659);
console.log(`rates fetched: founder=${founderRates.size} mystery=${mysteryRates.size} aurora=${auroraRates.size}`);

const [osmsItemsFile, osmsBeauty, count] = await Promise.all([
  fetch(`${OSMS_DATA}/items.json`).then((r) => {
    if (!r.ok) throw new Error(`OSMS items fetch failed: ${r.status}`);
    return r.json() as Promise<{ items: OsmsItem[] }>;
  }),
  fetch(`${OSMS_DATA}/beauty.json`).then((r) => {
    if (!r.ok) throw new Error(`OSMS beauty fetch failed: ${r.status}`);
    return r.json() as Promise<{ hair: OsmsBeautyEntry[]; face: OsmsBeautyEntry[] }>;
  }),
  fetch(`${API}/item/count`).then((r) => r.json() as Promise<number>),
]);
const mcwDump: RawItem[] = await fetch(`${API}/item/list?count=${count}`).then((r) => r.json());
const mcwById = new Map(mcwDump.map(item => [item.id, item]));
const osmsGear: RawItem[] = osmsItemsFile.items
  .filter((item) => item.category === 'Equipment')
  .map((item) => {
    const mcw = mcwById.get(item.id);
    let subCategory = mcw?.typeInfo?.subCategory ?? item.sub_category;
    if (subCategory === 'Weapon' && item.weapon_type) {
      const weaponMap: Record<string, string> = {
        '1H Sword': 'One-Handed Sword',
        '1H Axe': 'One-Handed Axe',
        '1H Blunt Weapon': 'One-Handed Blunt Weapon',
        'Dagger': 'Dagger',
        'Wand': 'Wand',
        'Staff': 'Staff',
        '2H Sword': 'Two-Handed Sword',
        '2H Axe': 'Two-Handed Axe',
        '2H Blunt Weapon': 'Two-Handed Blunt',
        'Spear': 'Spear',
        'Polearm': 'Pole Arm',
        'Bow': 'Bow',
        'Crossbow': 'Crossbow',
        'Claw': 'Claw',
      };
      subCategory = weaponMap[item.weapon_type] ?? subCategory;
    }
    const requiredJobs = mcw?.requiredJobs ?? (
      item.req_job_label === 'All' ? ['Beginner'] : item.req_job_label ? [item.req_job_label] : undefined
    );
    return {
      id: item.id,
      name: item.name,
      requiredGender: item.gender === 'male' ? 0 : item.gender === 'female' ? 1 : mcw?.requiredGender,
      isCash: false,
      requiredJobs,
      requiredLevel: item.stats?.reqLevel ?? mcw?.requiredLevel,
      typeInfo: { overallCategory: 'Equip', subCategory },
      src: 'OSMS',
    };
  });
const osmsBeautyItems: RawItem[] = [
  ...osmsBeauty.hair.map((item) => ({
    id: item.id,
    name: item.name,
    requiredGender: item.gender === 'male' ? 0 : 1,
    typeInfo: { overallCategory: 'Beauty', subCategory: 'Hair' },
    src: 'OSMS' as const,
  })),
  ...osmsBeauty.face.map((item) => ({
    id: item.id,
    name: item.name,
    requiredGender: item.gender === 'male' ? 0 : 1,
    typeInfo: { overallCategory: 'Beauty', subCategory: 'Face' },
    src: 'OSMS' as const,
  })),
];
const osmsDump = [...osmsGear, ...osmsBeautyItems];
// OSMS is the primary source. Keep MCW records for names/IDs absent from its dump.
const dump = [...osmsDump, ...mcwDump.filter((item) => !osmsDump.some((osmsItem) => osmsItem.id === item.id))];
const byName = new Map(mcwDump.map((i) => [i.name.toLowerCase(), i]));
for (const item of osmsDump) byName.set(item.name.toLowerCase(), item);

// GMS fallback: fetch GMS items for styles/faces not on MCW
interface GmsItem {
  id: number;
  name: string;
  typeInfo: { subCategory: string; overallCategory: string };
  requiredGender: number;
  isCash: boolean;
}
const GMS_API = 'https://maplestory.io/api/GMS/270';
let gmsByName = new Map<string, GmsItem>();
let gmsById = new Map<number, GmsItem>();
// Retail reuses names across genders/versions (Sailor Outfit m/f, Bunny Ears
// hat vs non-cash sword), so keep every record for the crate fallback.
const gmsByNameAll = new Map<string, GmsItem[]>();
const osmsById = new Map(osmsDump.map(item => [item.id, item]));
try {
  const gmsCount = await fetch(`${GMS_API}/item/count`).then(r => r.json()) as number;
  const gmsDump = await fetch(`${GMS_API}/item/list?count=${gmsCount}`).then(r => r.json()) as GmsItem[];
  gmsById = new Map(gmsDump.map(item => [item.id, item]));
  gmsByName = new Map(gmsDump.filter((i) => i.name).map((i) => [i.name.toLowerCase(), i]));
  for (const item of gmsDump) {
    if (!item.name) continue;
    const key = item.name.toLowerCase();
    const list = gmsByNameAll.get(key) ?? [];
    list.push(item);
    gmsByNameAll.set(key, list);
  }
  console.log(`GMS fallback: ${gmsDump.length} items`);
} catch (e) {
  console.log('GMS fallback failed:', e);
}

/**
 * Resolve a crate/stamp rate-table name to catalog records.
 * Priority: human pin (nexon-overlay.json) > MCW/OSMS Classic > GMS retail.
 * Same-name GMS records all resolve (gender splits like Sailor Outfit);
 * non-cash dupes (Bunny Ears sword) lose to cash NX records.
 * Empty = not in any dataset; caller logs miss with fuzzy suggestions.
 */
const overlay: { pins?: Array<{ name: string; id: number; note?: string; src?: PinSource }>; hide?: Array<{ id: number; note?: string }> } = JSON.parse(
  readFileSync(join(ROOT, 'data', 'nexon-overlay.json'), 'utf8'),
);
const overlayPins = new Map((overlay.pins ?? []).map((p) => [p.name.toLowerCase(), p]));
const hiddenIds = new Map((overlay.hide ?? []).map((h) => [h.id, h.note ?? '']));
const hiddenNameHits = new Set<string>();
const osmsGearById = new Map(osmsDump.map((item) => [item.id, item]));

function pinRecord(id: number, forcedSrc?: PinSource): { item: RawItem | GmsItem; src: AssetSource | undefined } | null {
  const osms = osmsGearById.get(id) ?? osmsById.get(id);
  if (osms && !forcedSrc) return { item: osms, src: osms.src };
  const mcw = mcwById.get(id);
  if (mcw && (!forcedSrc || forcedSrc === 'MCW')) return { item: mcw, src: forcedSrc ?? mcw.src };
  const gms = gmsById.get(id);
  if (gms && (!forcedSrc || forcedSrc === 'GMS')) return { item: gms, src: forcedSrc ?? 'GMS' };
  // Forced region without a record there: fall through to any record so the
  // bake fails loudly on missing frames instead of resolving a wrong item.
  if (osms) return { item: osms, src: forcedSrc };
  if (mcw) return { item: mcw, src: forcedSrc };
  if (gms) return { item: gms, src: forcedSrc };
  return null;
}

function resolveCrateItem(name: string): Array<{ item: RawItem | GmsItem; src: AssetSource | undefined }> {
  const pin = overlayPins.get(name.toLowerCase());
  if (pin != null) {
    if (hiddenIds.has(pin.id)) { console.warn(`crate item hidden: ${name} -> ${pin.id} (${hiddenIds.get(pin.id)})`); hiddenNameHits.add(name); return []; }
    const rec = pinRecord(pin.id, pin.src);
    if (!rec) throw new Error(`nexon-overlay pin points nowhere: ${name} -> ${pin.id}`);
    return [rec];
  }
  const mcw = byName.get(name.toLowerCase());
  if (mcw && mcw.typeInfo.overallCategory === 'Equip') {
    if (hiddenIds.has(mcw.id)) { console.warn(`crate item hidden: ${name} -> ${mcw.id} (${hiddenIds.get(mcw.id)})`); hiddenNameHits.add(name); return []; }
    return [{ item: mcw, src: mcw.src }];
  }
  const candidates = (gmsByNameAll.get(name.toLowerCase()) ?? [])
    .filter((g) => g.typeInfo.overallCategory === 'Equip')
    .filter((g) => {
      if (hiddenIds.has(g.id)) { console.warn(`crate item hidden: ${name} -> ${g.id} (${hiddenIds.get(g.id)})`); hiddenNameHits.add(name); return false; }
      return true;
    });
  if (candidates.length) {
    const cash = candidates.filter((g) => g.isCash);
    return (cash.length ? cash : candidates).map((g) => ({ item: g, src: 'GMS' as const }));
  }
  return [];
}

/** Token-overlap suggestions for an unresolvable rate-table name. Never auto-applied. */
function suggestNames(name: string, limit = 3): string[] {
  const needles = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!needles.length) return [];
  const scored: Array<{ key: string; score: number }> = [];
  for (const key of new Set([...byName.keys(), ...gmsByNameAll.keys()])) {
    const hay = key.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const n of needles) {
      if (hay.includes(n)) score += 2;
      else if (hay.some((h) => h.includes(n) || n.includes(h))) score += 1;
    }
    if (score > 0) scored.push({ key, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(({ key }) => {
      const g = gmsByNameAll.get(key)?.[0];
      const m = byName.get(key);
      const rec = (g ?? m) as { id?: number; typeInfo?: { subCategory?: string }; isCash?: boolean } | undefined;
      return `${key} (id ${rec?.id}, ${rec?.typeInfo?.subCategory}${g ? `, GMS cash=${g.isCash}` : ''})`;
    });
}

function logCrateMiss(name: string): void {
  if (hiddenNameHits.has(name)) return; // already reported as hidden above
  console.warn(`crate item not in any dataset, skipped: ${name}`);
  for (const s of suggestNames(name)) console.warn(`  maybe: ${s}`);
  console.warn(`  pin the verified id in data/nexon-overlay.json -> pins`);
}

function findItem(name: string, subCategory: string): { item: RawItem | GmsItem; src: AssetSource | undefined } | null {
  const mcw = byName.get(name.toLowerCase());
  if (mcw && mcw.typeInfo.subCategory === subCategory) return { item: mcw, src: mcw.src };
  const gms = gmsByName.get(name.toLowerCase());
  if (gms && gms.typeInfo.subCategory === subCategory) return { item: gms, src: 'GMS' };
  return null;
}

// Explicit coupon IDs may exist only in retail data. Never apply this fallback to equips.
function cosmeticSource(id: number, sub: 'Hair' | 'Face'): AssetSource | undefined | null {
  const osmsId = sub === 'Face'
    ? (id >= 21000 ? 21000 : 20000) + (id % 100)
    : id;
  if (osmsById.get(osmsId)?.typeInfo.subCategory === sub) return 'OSMS';
  if (mcwById.get(id)?.typeInfo.subCategory === sub) return undefined;
  if (gmsById.get(id)?.typeInfo.subCategory === sub) return 'GMS';
  return null;
}

function sexOf(item: RawItem, fallback: 'm' | 'f' | 'u' = 'u'): 'm' | 'f' | 'u' {
  const sub = item.typeInfo.subCategory;
  if (sub === 'Hair') return item.id < 31000 ? 'm' : 'f';
  if (sub === 'Face') return item.id < 21000 ? 'm' : 'f';
  if (item.requiredGender === 0) return 'm';
  if (item.requiredGender === 1) return 'f';
  return fallback;
}

const fastCatalog: FastCatalog = {
  banners: {},
  styles: {},
  items: {},
  indexes: {
    hairs: {
      m: { active: [], past: [] },
      f: { active: [], past: [] },
    },
    faces: {
      m: { active: [], past: [] },
      f: { active: [], past: [] },
    },
    groups: {
      'founder-crate': { m: [], f: [], u: [] },
      'mystery-crate': { m: [], f: [], u: [] },
      'aurora-crate': { m: [], f: [], u: [] },
      'cover-10day': { m: [], f: [], u: [] },
      'classic-equips': { m: [], f: [], u: [] },
    },
    search: [],
  },
};

// 1. Populate banners table
for (const b of [...rotations.current, ...(rotations.past || [])]) {
  fastCatalog.banners[b.id] = {
    id: b.id,
    label: b.label,
    start: b.start,
    end: b.end,
    note: b.note,
    post: b.post,
    rates: b.rates,
  };
}

// 2. Process ACTIVE BANNERS
const activeHairStyleIds = new Set<number>();
const activeFaceIds = new Set<number>();

for (const banner of rotations.current) {
  // Hairs (virtualized: 1 style entry per hair style)
  for (const h of banner.hairs || []) {
    if (h.unverified) { console.log(`skip unverified hair: ${h.name} (${h.sex})`); continue; }
    let style = h.style;
    let src = h.src;
    if (style == null) {
      const found = findItem(h.name, 'Hair');
      if (found) {
        style = Math.floor(found.item.id / 10);
        src = found.src;
      }
    }
    if (style != null) {
      const source = cosmeticSource(style * 10, 'Hair');
      if (source === null) throw new Error(`No sprite source for hair: ${h.name} (${style})`);
      src = source;
    }
    if (style != null) {
      activeHairStyleIds.add(style);
      fastCatalog.styles[style] = {
        name: h.name,
        sex: h.sex,
        bannerId: banner.id,
        attainable: true,
        rate: h.rate || '16.67%',
        src: src,
        history: h.history,
        coupon: 'mystery',
      };
      fastCatalog.indexes.hairs[h.sex].active.push(style);
      fastCatalog.indexes.search.push({
        id: style,
        name: h.name,
        sub: 'Hair',
        sex: h.sex,
        isStyle: true,
      });
    }
  }

  // Signature Hairs
  for (const h of banner.signatureHairs || []) {
    let style = h.style;
    let src = h.src;
    if (style == null) {
      const found = findItem(h.name, 'Hair');
      if (found) {
        style = Math.floor(found.item.id / 10);
        src = found.src;
      }
    }
    if (style != null) {
      const source = cosmeticSource(style * 10, 'Hair');
      if (source === null) throw new Error(`No sprite source for signature hair`);
      src = source;
    }
    if (style != null) {
      activeHairStyleIds.add(style);
      fastCatalog.styles[style] = {
        name: h.name,
        sex: h.sex,
        bannerId: banner.id,
        attainable: true,
        rate: 'Signature',
        src: src,
        history: h.history,
        coupon: 'signature',
      };
      fastCatalog.indexes.hairs[h.sex].active.push(style);
      fastCatalog.indexes.search.push({
        id: style,
        name: h.name,
        sub: 'Hair',
        sex: h.sex,
        isStyle: true,
      });
    }
  }

  // Faces
  for (const f of banner.faces || []) {
    if (f.unverified) { console.log(`skip unverified face: ${f.name} (${f.sex})`); continue; }
    let faceId = f.id;
    let src = f.src;
    if (faceId == null) {
      const found = findItem(f.name, 'Face');
      if (found) { faceId = found.item.id; src = found.src; }
    }
    if (faceId != null) {
      const source = cosmeticSource(faceId, 'Face');
      if (source === null) throw new Error(`No sprite source for face: ${f.name} (${faceId})`);
      src = source;
    }
    if (faceId != null) {
      activeFaceIds.add(faceId);
      fastCatalog.items[faceId] = {
        name: f.name,
        sub: 'Face',
        sex: f.sex,
        bannerId: banner.id,
        attainable: true,
        group: 'style-coupon',
        rate: f.rate || '16.67%',
        src: src,
        history: f.history,
        coupon: 'mystery',
      };
      fastCatalog.indexes.faces[f.sex].active.push(faceId);
      fastCatalog.indexes.search.push({
        id: faceId,
        name: f.name,
        sub: 'Face',
        sex: f.sex,
      });
    }
  }

  // Signature Faces
  for (const f of banner.signatureFaces || []) {
    let faceId = f.id;
    let src = f.src;
    if (faceId == null) {
      const found = findItem(f.name, 'Face');
      if (found) { faceId = found.item.id; src = found.src; }
    }
    if (faceId != null) {
      const source = cosmeticSource(faceId, 'Face');
      if (source === null) throw new Error(`No sprite source for signature face`);
      src = source;
    }
    if (faceId != null) {
      activeFaceIds.add(faceId);
      fastCatalog.items[faceId] = {
        name: f.name,
        sub: 'Face',
        sex: f.sex,
        bannerId: banner.id,
        attainable: true,
        group: 'style-coupon',
        rate: 'Signature',
        src: src,
        history: f.history,
        coupon: 'signature',
      };
      fastCatalog.indexes.faces[f.sex].active.push(faceId);
      fastCatalog.indexes.search.push({
        id: faceId,
        name: f.name,
        sub: 'Face',
        sex: f.sex,
      });
    }
  }

  // Equips (Founder's Crate)
  if (banner.id === 'founder-crate-oct26') {
    for (const [name, rate] of founderRates) {
      const resolved = resolveCrateItem(name);
      if (!resolved.length) logCrateMiss(name);
      for (const { item: hit, src } of resolved) {
        if (hit.typeInfo.overallCategory !== 'Equip') continue;
        const sex = sexOf(hit);
        fastCatalog.items[hit.id] = {
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
          bannerId: banner.id,
          attainable: true,
          group: 'founder-crate',
          rate,
          src,
        };
        fastCatalog.indexes.groups['founder-crate'][sex].push(hit.id);
        fastCatalog.indexes.search.push({
          id: hit.id,
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
        });
      }
    }
  }

  // Equips (Grand Launch Mystery Crate)
  if (banner.id === 'mystery-crate-nov26') {
    for (const [name, rate] of mysteryRates) {
      const resolved = resolveCrateItem(name);
      if (!resolved.length) logCrateMiss(name);
      for (const { item: hit, src } of resolved) {
        if (hit.typeInfo.overallCategory !== 'Equip') continue;
        const sex = sexOf(hit);
        fastCatalog.items[hit.id] = {
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
          bannerId: banner.id,
          attainable: true,
          group: 'mystery-crate',
          rate,
          src,
        };
        fastCatalog.indexes.groups['mystery-crate'][sex].push(hit.id);
        fastCatalog.indexes.search.push({
          id: hit.id,
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
        });
      }
    }
  }

  // Equips (Aurora Crate)
  if (banner.id === 'aurora-s1') {
    for (const [name, rate] of auroraRates) {
      const resolved = resolveCrateItem(name);
      if (!resolved.length) logCrateMiss(name);
      for (const { item: hit, src } of resolved) {
        if (hit.typeInfo.overallCategory !== 'Equip') continue;
        const sex = sexOf(hit);
        fastCatalog.items[hit.id] = {
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
          bannerId: banner.id,
          attainable: true,
          group: 'aurora-crate',
          rate,
          src,
        };
        fastCatalog.indexes.groups['aurora-crate'][sex].push(hit.id);
        fastCatalog.indexes.search.push({
          id: hit.id,
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
        });
      }
    }
  }

  // Equips (10-Day Covers)
  if (banner.id === 'covers-10day-nov26') {
    const coversList = [
      'Dark Rider',
      'Basic Wildcats Baseball Pants',
      'Black Baseball Cleats',
      'Blue Picnic Hat',
      'Beige Double Coat',
      'Military Shorts',
      'Kuniragi Hat',
      'Green Striped Trainer',
      'Red Training Shorts',
      'Red Raincoat',
      'Red Rain Boots',
      'Goggled Black Cap',
      'Yellow Tights',
      'Green Picnicwear',
      'Red Loose Sox',
    ];
    for (const name of coversList) {
      const hit = byName.get(name.toLowerCase());
      if (hit && hit.typeInfo.overallCategory === 'Equip') {
        const sex = sexOf(hit);
        fastCatalog.items[hit.id] = {
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
          bannerId: banner.id,
          attainable: true,
          group: 'cover-10day',
          src: hit.src,
        };
        fastCatalog.indexes.groups['cover-10day'][sex].push(hit.id);
        fastCatalog.indexes.search.push({
          id: hit.id,
          name: hit.name,
          sub: hit.typeInfo.subCategory,
          sex,
        });
      }
    }
  }
}

// Non-NX wearables from Classic data. Hair/head records are not job equips.
// Dataset presence allows previewing; it does not establish a drop/shop location.
for (const item of dump) {
  if (item.isCash !== false || item.typeInfo.overallCategory !== 'Equip' || item.id < 1000000) continue;
  if (fastCatalog.items[item.id]) continue;
  const sex = sexOf(item);
  fastCatalog.items[item.id] = {
    name: item.name,
    sub: item.typeInfo.subCategory,
    sex,
    bannerId: '',
    attainable: true,
    group: 'classic-equips',
    requiredJobs: item.requiredJobs,
    requiredLevel: item.requiredLevel,
    src: item.src,
  };
  fastCatalog.indexes.groups['classic-equips'][sex].push(item.id);
  fastCatalog.indexes.search.push({ id: item.id, name: item.name, sub: item.typeInfo.subCategory, sex });
}

// 3. Process PAST ROTATIONS
for (const banner of rotations.past || []) {
  for (const h of banner.hairs || []) {
    let style = h.style;
    if (style == null) {
      const found = findItem(h.name, 'Hair');
      if (found) style = Math.floor(found.item.id / 10);
    }
    if (h.unverified) continue;
    if (style != null && !activeHairStyleIds.has(style)) {
      const src = cosmeticSource(style * 10, 'Hair');
      if (src === null) throw new Error(`No sprite source for past hair: ${h.name}`);
      fastCatalog.styles[style] = {
        name: h.name,
        sex: h.sex,
        bannerId: banner.id,
        attainable: false,
        rate: h.rate,
        src,
        history: h.history,
      };
      fastCatalog.indexes.hairs[h.sex].past.push(style);
      fastCatalog.indexes.search.push({
        id: style,
        name: h.name,
        sub: 'Hair',
        sex: h.sex,
        isStyle: true,
      });
    }
  }

  for (const f of banner.faces || []) {
    const faceId = f.id ?? findItem(f.name, 'Face')?.item.id;
    if (f.unverified) continue;
    if (faceId != null && !activeFaceIds.has(faceId)) {
      const src = cosmeticSource(faceId, 'Face');
      if (src === null) throw new Error(`No sprite source for past face: ${f.name}`);
      fastCatalog.items[faceId] = {
        name: f.name,
        sub: 'Face',
        sex: f.sex,
        bannerId: banner.id,
        attainable: false,
        group: 'past-rotation',
        rate: f.rate,
        src,
        history: f.history,
      };
      fastCatalog.indexes.faces[f.sex].past.push(faceId);
      fastCatalog.indexes.search.push({
        id: faceId,
        name: f.name,
        sub: 'Face',
        sex: f.sex,
      });
    }
  }
}

// Starter salon styles remain available for free after coupon rotations end.
const starterHairs = { m: [3000, 3002, 3003], f: [3100, 3104] };
const starterFaces = { m: [20000, 20001, 20002], f: [21000, 21001, 21002] };
for (const sex of ['m', 'f'] as const) {
  for (const id of starterHairs[sex]) {
    const style = fastCatalog.styles[id];
    if (!style) continue;
    style.attainable = true;
    style.bannerId = '';
    delete style.rate;
    delete style.history;
    fastCatalog.indexes.hairs[sex].past = fastCatalog.indexes.hairs[sex].past.filter(value => value !== id);
  }
  for (const id of starterFaces[sex]) {
    const source = osmsById.get(id);
    if (!fastCatalog.items[id] && source) {
      fastCatalog.items[id] = {
        name: source.name,
        sub: 'Face',
        sex,
        bannerId: '',
        attainable: true,
        src: 'OSMS',
      };
      fastCatalog.indexes.search.push({ id, name: source.name, sub: 'Face', sex });
    }
    const face = fastCatalog.items[id];
    if (!face) throw new Error(`Missing OSMS starter face ${id}`);
    face.attainable = true;
    face.bannerId = '';
    face.src ??= 'OSMS';
    delete face.rate;
    delete face.history;
    delete face.group;
    fastCatalog.indexes.faces[sex].active = fastCatalog.indexes.faces[sex].active.filter(value => value !== id);
    fastCatalog.indexes.faces[sex].past = fastCatalog.indexes.faces[sex].past.filter(value => value !== id);
  }
}

// Sort index arrays alphabetically by entity name
const sortHairs = (a: number, b: number) => fastCatalog.styles[a].name.localeCompare(fastCatalog.styles[b].name);
const sortItems = (a: number, b: number) => fastCatalog.items[a].name.localeCompare(fastCatalog.items[b].name);

fastCatalog.indexes.hairs.m.active.sort(sortHairs);
fastCatalog.indexes.hairs.m.past.sort(sortHairs);
fastCatalog.indexes.hairs.f.active.sort(sortHairs);
fastCatalog.indexes.hairs.f.past.sort(sortHairs);

fastCatalog.indexes.faces.m.active.sort(sortItems);
fastCatalog.indexes.faces.m.past.sort(sortItems);
fastCatalog.indexes.faces.f.active.sort(sortItems);
fastCatalog.indexes.faces.f.past.sort(sortItems);

for (const grp of Object.values(fastCatalog.indexes.groups)) {
  grp.m.sort(sortItems);
  grp.f.sort(sortItems);
  grp.u.sort(sortItems);
}

fastCatalog.indexes.search.sort((a, b) => a.name.localeCompare(b.name));

const out = join(ROOT, 'src', 'data', 'catalog.json');
writeFileSync(out, JSON.stringify(fastCatalog));

const stylesCount = Object.keys(fastCatalog.styles).length;
const itemsCount = Object.keys(fastCatalog.items).length;
console.log(`Generated Normalized FastCatalog: ${stylesCount} styles, ${itemsCount} items, ${Object.keys(fastCatalog.banners).length} banners → ${out}`);

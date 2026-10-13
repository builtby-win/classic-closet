// Worker-safe Open Graph helpers for shared look links.
// No catalog import: region routing mirrors assetSource() in lib/fashion.ts.
// All hair (30000-49999) and face (20000-22000) ids render from GMS/270
// regardless of color variant or OSMS/GMS src; skins and equips render
// from MCW/CBT2. Verified against src/data/catalog.json (all GMS-src
// items are faces; all null-src items are equips).

export const OG_SITE_URL = 'https://classic-closet.builtby.win';
export const OG_DEFAULT_IMAGE = `${OG_SITE_URL}/og-default.png`;
export const OG_TITLE_DEFAULT = 'Classic Closet';
export const OG_TITLE_PREVIEW = 'Classic Closet — Character Preview';
export const OG_DESCRIPTION =
  'Dress-up preview for MapleStory Classic World. Pick hair, face, and equips, see your character live.';

/** Crawler render scale: resize=1 yields ~47x71px (below every unfurler
 *  minimum); resize=4 yields ~256x316px and stays under 10KB. */
export const CRAWLER_RESIZE = 4;

export interface OgSource {
  region: string;
  version: string;
}

/** Region routing for a single numeric asset id. Handles every hair color
 *  (style * 10 + 0-7), every eye color (base + color * 100 + style),
 *  GMS-only faces, skins/bodies, and all equip ids. */
export function ogSourceFor(itemId: number): OgSource {
  if (
    Number.isInteger(itemId) &&
    ((itemId >= 30000 && itemId < 50000) || (itemId >= 20000 && itemId < 22000))
  ) {
    return { region: 'GMS', version: '270' };
  }
  return { region: 'MCW', version: 'CBT2' };
}

export interface ParsedLook {
  skin: number;
  face: number;
  hair: number;
  anim: string;
  frame: number;
  items: Record<string, number>;
}

const DEFAULTS: ParsedLook = {
  skin: 2000,
  face: 20805,
  hair: 30130,
  anim: 'stand1',
  frame: 0,
  items: {},
};

function toInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function cleanAnim(value: string | null): string {
  if (value && /^[A-Za-z0-9]{1,16}$/.test(value)) return value;
  return DEFAULTS.anim;
}

function cleanSlotKey(key: string): string | null {
  return /^[A-Za-z]{1,24}$/.test(key) ? key : null;
}

function normalizeLook(raw: Partial<ParsedLook> & { items?: unknown }): ParsedLook {
  const skin =
    typeof raw.skin === 'number' && Number.isInteger(raw.skin) && raw.skin >= 2000 && raw.skin <= 2999
      ? raw.skin
      : DEFAULTS.skin;
  const face =
    typeof raw.face === 'number' && Number.isInteger(raw.face) && raw.face >= 20000 && raw.face < 22000
      ? raw.face
      : DEFAULTS.face;
  const hair =
    typeof raw.hair === 'number' && Number.isInteger(raw.hair) && raw.hair >= 30000 && raw.hair < 50000
      ? raw.hair
      : DEFAULTS.hair;
  const anim = typeof raw.anim === 'string' ? cleanAnim(raw.anim) : DEFAULTS.anim;
  const frame =
    typeof raw.frame === 'number' && Number.isInteger(raw.frame) && raw.frame >= 0 && raw.frame <= 12
      ? raw.frame
      : DEFAULTS.frame;
  const items: Record<string, number> = {};
  if (raw.items && typeof raw.items === 'object') {
    for (const [k, v] of Object.entries(raw.items as Record<string, unknown>)) {
      const slot = cleanSlotKey(k);
      if (!slot || typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 99999999) continue;
      items[slot] = v;
    }
  }
  return { skin, face, hair, anim, frame, items };
}

function decodeBase64Json(b64: string): Record<string, unknown> | null {
  try {
    let normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) normalized += '=';
    const json = typeof atob !== 'undefined' ? atob(normalized) : Buffer.from(normalized, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // invalid look param — caller falls back to defaults
  }
  return null;
}

/**
 * Parse a shared look from URLSearchParams. Handles ?look=<base64url JSON>
 * and readable params (?sex=&skin=&hair=&face=&anim=&frame=&<Slot>=id).
 * Returns null when the URL carries no look at all.
 */
export function parseLookParams(params: URLSearchParams): ParsedLook | null {
  const lookParam = params.get('look');
  if (lookParam) {
    const decoded = decodeBase64Json(lookParam);
    if (decoded) {
      const raw: Partial<ParsedLook> & { items?: unknown } = {};
      if (typeof decoded.skin === 'number') raw.skin = decoded.skin;
      if (typeof decoded.face === 'number') raw.face = decoded.face;
      if (typeof decoded.hair === 'number') raw.hair = decoded.hair;
      if (typeof decoded.anim === 'string') raw.anim = decoded.anim;
      if (typeof decoded.frame === 'number') raw.frame = decoded.frame;
      if (decoded.items && typeof decoded.items === 'object') raw.items = decoded.items as Record<string, number>;
      return normalizeLook(raw);
    }
    return null;
  }
  if (!params.has('hair') && !params.has('face') && !params.has('sex')) return null;
  const raw: Partial<ParsedLook> & { items?: unknown } = {
    skin: toInt(params.get('skin'), DEFAULTS.skin, 2000, 2999),
    face: toInt(params.get('face'), DEFAULTS.face, 20000, 21999),
    hair: toInt(params.get('hair'), DEFAULTS.hair, 30000, 49999),
    anim: cleanAnim(params.get('anim')),
    frame: toInt(params.get('frame'), DEFAULTS.frame, 0, 12),
  };
  const KNOWN = new Set(['sex', 'skin', 'hair', 'hairCol', 'face', 'anim', 'frame', 'look']);
  const items: Record<string, number> = {};
  for (const [k, v] of params) {
    if (KNOWN.has(k)) continue;
    const slot = cleanSlotKey(k);
    const id = Number(v);
    if (!slot || !Number.isInteger(id) || id <= 0 || id > 99999999) continue;
    items[slot] = id;
  }
  raw.items = items;
  return normalizeLook(raw);
}

/**
 * Crawler-friendly render URL for a parsed look. Same /api/character/
 * endpoint and framing as renderURL() in lib/fashion.ts (skin body+head,
 * full face/hair ids so every color variant resolves, per-asset region),
 * but upscaled past unfurler minimums (LINE/iMessage need 200px+).
 */
export function crawlerRenderURL(look: ParsedLook): string {
  const ids = [look.skin, look.skin + 10000, look.face, look.hair, ...Object.values(look.items)];
  const entries = ids.map((itemId) => ({ itemId, ...ogSourceFor(itemId) }));
  const items = encodeURIComponent(entries.map((entry) => JSON.stringify(entry)).join(','));
  return (
    `https://maplestory.io/api/character/${items}/${encodeURIComponent(look.anim)}/${look.frame}` +
    `?showears=false&showLefEars=false&showHighLefEars=false` +
    `&resize=${CRAWLER_RESIZE}&flipX=false&renderMode=0&padX=30&padY=50`
  );
}

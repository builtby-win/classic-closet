/**
 * Human-review gate for baked sprites. Every catalog item's baked art is fingerprinted;
 * an item is "reviewed" once a person approved that exact fingerprint in
 * data/sprite-review.json. New items and re-baked art (different source, different
 * frames) show up as unreviewed until approved again, so a wrong same-name sprite
 * (Glowing Pumpkin Basket: lantern vs pumpkin) can't ship unseen.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ITEMS_DIR = join(ROOT, 'public', 'sprites', 'items');
export const APPROVALS_PATH = join(ROOT, 'data', 'sprite-review.json');
/** Mean-colour similarity at or above this flags a pair as near-duplicate art. */
export const NEAR_DUPLICATE = 0.9;

export interface CatalogItem { name: string; sub: string; src?: string; bannerId?: string }

export function loadCatalogItems(): Record<string, CatalogItem> {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'catalog.json'), 'utf8')).items;
}

export function loadApprovals(): Record<string, string> {
  if (!existsSync(APPROVALS_PATH)) return {};
  return JSON.parse(readFileSync(APPROVALS_PATH, 'utf8')).approved ?? {};
}

/** Hash of the item's idle sprite plus every per-weapon-type variant, or null when nothing is baked. */
export function spriteHash(id: string, files: string[] = readdirSync(ITEMS_DIR)): string | null {
  const own = files.filter((f) => f === `${id}.json` || new RegExp(`^${id}\\.w\\d+\\.json$`).test(f)).sort();
  if (!own.includes(`${id}.json`)) return null;
  const hash = createHash('sha256');
  for (const f of own) hash.update(f).update(readFileSync(join(ITEMS_DIR, f)));
  return hash.digest('hex').slice(0, 16);
}

/** Catalog ids whose baked art has no approval for its current fingerprint. */
export function unreviewedItems(): Array<{ id: string; hash: string; item: CatalogItem; changed: boolean }> {
  const items = loadCatalogItems();
  const approved = loadApprovals();
  const files = readdirSync(ITEMS_DIR);
  const out = [];
  for (const [id, item] of Object.entries(items)) {
    const hash = spriteHash(id, files);
    if (hash && approved[id] !== hash) out.push({ id, hash, item, changed: id in approved });
  }
  return out;
}

/** Pixels of the item's idle frame as RGBA, or null (missing / unsupported PNG). */
function idleFrame(id: string): { w: number; h: number; px: Buffer } | null {
  const frames = JSON.parse(readFileSync(join(ITEMS_DIR, `${id}.json`), 'utf8')).frames as Record<string, Array<{ image: string }>>;
  const key = ['stand1:0', 'default:0'].find((k) => frames[k]) ?? Object.keys(frames)[0];
  const image = key && frames[key]?.[0]?.image;
  return image ? decodePng(Buffer.from(image.replace(/^data:image\/png;base64,/, ''), 'base64')) : null;
}

/** Minimal decoder for the 8-bit RGBA non-interlaced PNGs the bake produces. */
function decodePng(buf: Buffer): { w: number; h: number; px: Buffer } | null {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0) return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
    if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len));
    o += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!, row = y * stride, src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[row + x - 4]! : 0, b = y ? px[row - stride + x]! : 0, c = x >= 4 && y ? px[row - stride + x - 4]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      px[row + x] = (raw[src + x]! + pred) & 255;
    }
  }
  return { w, h, px };
}

const GRID = 24;
/** Opaque-bbox crop averaged onto a GRID×GRID RGBA grid, so size/offset don't hide a match. */
export function signature(id: string): Float32Array | null {
  const img = idleFrame(id);
  if (!img) return null;
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.px[(y * img.w + x) * 4 + 3]! > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sig = new Float32Array(GRID * GRID * 4), n = new Float32Array(GRID * GRID);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cell = Math.min(GRID - 1, Math.floor(((y - y0) / bh) * GRID)) * GRID + Math.min(GRID - 1, Math.floor(((x - x0) / bw) * GRID));
    const i = (y * img.w + x) * 4;
    for (let k = 0; k < 4; k++) sig[cell * 4 + k]! += img.px[i + k]!;
    n[cell]!++;
  }
  for (let c = 0; c < GRID * GRID; c++) if (n[c]) for (let k = 0; k < 4; k++) sig[c * 4 + k]! /= n[c]!;
  return sig;
}

/** 0..1, over cells where either sprite has ink (empty margins don't inflate the score). */
export function similarity(a: Float32Array, b: Float32Array): number {
  let diff = 0, cells = 0;
  for (let c = 0; c < GRID * GRID; c++) {
    const aa = a[c * 4 + 3]!, ba = b[c * 4 + 3]!;
    if (aa < 8 && ba < 8) continue;
    cells++;
    for (let k = 0; k < 4; k++) diff += Math.abs(a[c * 4 + k]! - b[c * 4 + k]!);
  }
  return cells ? 1 - diff / (cells * 4 * 255) : 0;
}

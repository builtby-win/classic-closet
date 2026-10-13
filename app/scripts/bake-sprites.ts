/**
 * Bakes sprite frames for Classic Closet items and base bodies into public/sprites/.
 * Source layers and coordinates are stored in /sprites/items/ and /sprites/base/.
 * Incremental: skips assets already baked to disk.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeBaseBodies } from './bake-base-layers';
import { EYE_COLORS, faceVariantId } from '../src/lib/fashion';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(ROOT, 'src', 'data', 'catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const ITEMS_DIR = join(ROOT, 'public', 'sprites', 'items');
const FACES_DIR = join(ROOT, 'public', 'sprites', 'faces');

mkdirSync(ITEMS_DIR, { recursive: true });
mkdirSync(FACES_DIR, { recursive: true });

function bakeFaceIcons() {
  let count = 0;
  for (const [id, meta] of Object.entries<any>(catalog.items)) {
    if (meta.sub !== 'Face') continue;
    const spritePath = join(ITEMS_DIR, `${id}.json`);
    if (!existsSync(spritePath)) continue;
    const sprite = JSON.parse(readFileSync(spritePath, 'utf8'));
    const image = sprite.frames?.['default:0']?.[0]?.image;
    if (!image) continue;
    const iconId = (Number(id) >= 21000 ? 21000 : 20000) + (Number(id) % 100);
    writeFileSync(join(FACES_DIR, `${iconId}.png`), Buffer.from(image.replace(/^data:image\/png;base64,/, ''), 'base64'));
    count++;
  }
  console.log(`Baked ${count} face icons`);
}

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(ms) });
}

async function fetchItemData(id: number, src?: 'GMS' | 'OSMS', sub?: string, tries = 3): Promise<any | null> {
  // Same numeric ids are different items per region (e.g. GMS 1332001 is
  // Halfmoon Zamadar, MCW 1332001 is Fruit Knife). OSMS gear lives on the
  // MCW endpoint, so it MUST bake from MCW first; only modern OSMS hair/face
  // cosmetics (rendered from GMS, see assetSource) and GMS items prefer GMS.
  const cosmetic = sub === 'Hair' || sub === 'Face';
  const gmsFirst = src === 'GMS' || (src === 'OSMS' && cosmetic);
  const preferred = gmsFirst
    ? 'https://maplestory.io/api/GMS/270'
    : 'https://maplestory.io/api/MCW/CBT2';
  const fallback = gmsFirst
    ? 'https://maplestory.io/api/MCW/CBT2'
    : 'https://maplestory.io/api/GMS/270';
  for (let attempt = 1; attempt <= tries; attempt++) {
    for (const apiBase of [preferred, fallback]) {
      try {
        const res = await fetchWithTimeout(`${apiBase}/item/${id}`, 12000);
        if (!res.ok) continue;
        const raw = await res.json();
        if (raw?.frameBooks && Object.keys(raw.frameBooks).length) return raw;
      } catch {
        // try the other region, then retry with backoff
      }
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return null;
}

const BAKED_ACTIONS = new Set(['stand1', 'stand2', 'alert', 'jump', 'default']);
/** Play-mode poses live in `<id>.motion.json`, fetched only when the pad opens. */
const MOTION_ACTIONS = new Set(['walk1', 'walk2', 'prone', 'swingO1', 'stabO1', 'swingT1', 'stabT1', 'swingP1', 'shoot1', 'shoot2']);

function extractFrames(raw: any, actions: Set<string> = BAKED_ACTIONS): Record<string, any[]> {
  const frames: Record<string, any[]> = {};
  for (const [actionName, action] of Object.entries<any>(raw.frameBooks)) {
    if (!action?.frames) continue;
    action.frames.forEach((f: any, fIdx: number) => {
      if (!actions.has(actionName)) return;
      const key = `${actionName}:${fIdx}`;
      const effects: any[] = [];
      for (const eff of Object.values<any>(f.effects || {})) {
        if (!eff?.image) continue;
        const mapOffset: Record<string, { x: number; y: number }> = {};
        for (const [name, point] of Object.entries<any>(eff.mapOffset ?? {})) {
          if (point && typeof point.x === 'number' && typeof point.y === 'number') {
            mapOffset[name] = { x: point.x, y: point.y };
          }
        }
        effects.push({
          image: eff.image.startsWith('data:') ? eff.image : `data:image/png;base64,${eff.image}`,
          origin: { x: eff.origin?.x ?? 0, y: eff.origin?.y ?? 0 },
          mapOffset,
          position: eff.position || 'default',
        });
      }
      if (effects.length) frames[key] = effects;
    });
  }

  return frames;
}

async function bakeItem(id: number, meta: any): Promise<boolean> {
  const dest = join(ITEMS_DIR, `${id}.json`);
  if (existsSync(dest)) return true;

  const raw = await fetchItemData(id, meta?.src, meta?.sub);
  if (!raw || !raw.frameBooks) return false;

  const frames = extractFrames(raw);
  const vslots: string[] = raw.metaInfo?.vslots ?? [];
  const islots: string[] = raw.metaInfo?.islots ?? [];

  if (!Object.keys(frames).length) return false;

  writeFileSync(dest, JSON.stringify({ id, frames, vslot: vslots.join(''), islot: islots.join('') }));
  return true;
}

/** Items baked before `jump` was a baked pose: merge in just the jump frames. */
async function backfillJump(id: number, meta: any): Promise<void> {
  const dest = join(ITEMS_DIR, `${id}.json`);
  if (!existsSync(dest)) return;
  const baked = JSON.parse(readFileSync(dest, 'utf8'));
  if (baked.frames['jump:0'] || baked.jumpChecked) return;
  // Faces carry one expression frame and no pose frames.
  if (!Object.keys(baked.frames).some((key) => /^(stand1|stand2|alert):/.test(key))) return;
  const raw = await fetchItemData(id, meta?.src, meta?.sub);
  const jump = raw?.frameBooks?.jump ? extractFrames({ frameBooks: { jump: raw.frameBooks.jump } }) : {};
  Object.assign(baked.frames, jump);
  // Items without a jump book (e.g. some cash weapons) are marked so reruns skip them.
  if (!Object.keys(jump).length) baked.jumpChecked = true;
  writeFileSync(dest, JSON.stringify(baked));
}

/** Walk/duck/attack frames, kept out of the main item file so the editor stays light. */
async function bakeMotion(id: number, meta: any): Promise<void> {
  const dest = join(ITEMS_DIR, `${id}.motion.json`);
  if (existsSync(dest) || !existsSync(join(ITEMS_DIR, `${id}.json`))) return;
  const raw = await fetchItemData(id, meta?.src, meta?.sub);
  if (!raw?.frameBooks) return;
  // Written even when empty so reruns skip items (e.g. cash weapons) with no motion.
  writeFileSync(dest, JSON.stringify({ id, frames: extractFrames(raw, MOTION_ACTIONS) }));
}

// Concurrency pool with progress
async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        await fn(current);
      } catch {
        // continue
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  await bakeBaseBodies();

  const itemEntries = Object.entries<any>(catalog.items);
  console.log(`--- Baking ${itemEntries.length} items (concurrency: 10) ---`);

  let count = 0;
  let skipped = 0;
  let success = 0;
  // Rings ship zero frameBooks (chat/label UI effect, no avatar layers):
  // expected-unbakeable, warn only. Anything else failing is real.
  const equipFailed: number[] = [];

  await pool(itemEntries, 10, async ([idStr, meta]) => {
    const id = Number(idStr);
    const dest = join(ITEMS_DIR, `${id}.json`);
    if (existsSync(dest)) {
      skipped++;
      return;
    }
    const ok = await bakeItem(id, meta);
    count++;
    if (ok) {
      success++;
    } else if (meta?.sub === 'Ring') {
      console.warn(`skip unbakeable ring (no avatar frames): ${id}`);
    } else {
      equipFailed.push(id);
    }
    if (count % 50 === 0) {
      console.log(`Progress: ${count} baked (${success} ok, ${skipped} skipped)...`);
    }
  });
  if (equipFailed.length) {
    throw new Error(`Could not bake equips (retried): ${equipFailed.sort((a, b) => a - b).join(', ')}`);
  }

  console.log('--- Baking Face Color Variants ---');
  const faceJobs = new Map<number, { src?: 'GMS' | 'OSMS' }>();
  for (const [id, meta] of Object.entries<any>(catalog.items)) {
    if (meta.sub !== 'Face') continue;
    const sex = Number(id) >= 21000 ? 'f' : 'm';
    for (let color = 0; color < EYE_COLORS.length; color++) {
      faceJobs.set(faceVariantId(sex, Number(id) % 100, color), { src: meta.src });
    }
  }
  const faceFailed: number[] = [];
  await pool([...faceJobs], 10, async ([id, meta]) => {
    try {
      if (!await bakeItem(id, meta)) faceFailed.push(id);
    } catch {
      faceFailed.push(id);
    }
  });
  if (faceFailed.length) {
    throw new Error(`Could not bake face variants: ${faceFailed.sort((a, b) => a - b).join(', ')}`);
  }
  console.log(`All ${faceJobs.size} face color variants present.`);

  bakeFaceIcons();
  console.log('--- Baking Hair Styles ---');
  const hairFailed: number[] = [];
  const hairStyles = Object.keys(catalog.styles).map(Number);
  const hairIds: number[] = [];
  for (const style of hairStyles) {
    for (let c = 0; c < 8; c++) {
      hairIds.push(style * 10 + c);
    }
  }

  await pool(hairIds, 10, async (hairId) => {
    const dest = join(ITEMS_DIR, `${hairId}.json`);
    if (existsSync(dest)) return;
    if (!await bakeItem(hairId, { src: catalog.styles[Math.floor(hairId / 10)]?.src })) {
      hairFailed.push(hairId);
    }
  });
  if (hairFailed.length) {
    throw new Error(`Could not bake hair variants (retried): ${hairFailed.sort((a, b) => a - b).join(', ')}`);
  }

  console.log('--- Backfilling jump frames ---');
  const backfillJobs: [number, any][] = [
    ...itemEntries.map(([id, meta]): [number, any] => [Number(id), meta]),
    ...hairIds.map((id): [number, any] => [id, { src: catalog.styles[Math.floor(id / 10)]?.src }]),
  ];
  await pool(backfillJobs, 10, ([id, meta]) => backfillJump(id, meta));

  console.log('--- Baking play-mode motion frames ---');
  await pool([
    ...itemEntries.filter(([, meta]) => meta?.sub !== 'Face').map(([id, meta]): [number, any] => [Number(id), meta]),
    ...hairIds.map((id): [number, any] => [id, { src: catalog.styles[Math.floor(id / 10)]?.src }]),
  ], 10, ([id, meta]) => bakeMotion(id, meta));

  console.log(`Done! Total: ${count} baked, ${skipped} already existed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

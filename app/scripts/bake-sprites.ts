/**
 * Bakes sprite frames for Maple Closet items and base bodies into public/sprites/.
 * Slices are stored as static JSON files (/sprites/items/{id}.json) and base PNGs (/sprites/base/...).
 * Incremental: skips assets already baked to disk.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(ROOT, 'src', 'data', 'catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const BASE_DIR = join(ROOT, 'public', 'sprites', 'base');
const ITEMS_DIR = join(ROOT, 'public', 'sprites', 'items');
const FACES_DIR = join(ROOT, 'public', 'sprites', 'faces');

mkdirSync(BASE_DIR, { recursive: true });
mkdirSync(ITEMS_DIR, { recursive: true });
mkdirSync(FACES_DIR, { recursive: true });

function bakeFaceIcons() {
  let count = 0;
  for (const [id, meta] of Object.entries<any>(catalog.items)) {
    if (meta.sub !== 'Face') continue;
    const spritePath = join(ITEMS_DIR, `${id}.json`);
    if (!existsSync(spritePath)) continue;
    try {
      const sprite = JSON.parse(readFileSync(spritePath, 'utf8'));
      const image = sprite.frames?.['default:0']?.[0]?.image;
      const base64 = typeof image === 'string' ? image.replace(/^data:image\/png;base64,/, '') : '';
      if (!base64) continue;
      const iconId = (Number(id) >= 21000 ? 21000 : 20000) + (Number(id) % 100);
      writeFileSync(join(FACES_DIR, `${iconId}.png`), Buffer.from(base64, 'base64'));
      count++;
    } catch { /* skip invalid cached sprite */ }
  }
  console.log(`Baked ${count} face icons`);
}

const SKINS = [2000, 2001, 2002, 2003, 2004, 2005, 2006];
const POSES = ['stand1', 'stand2', 'alert'];

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(ms) });
}

async function bakeBaseBodies() {
  console.log('--- Baking Base Bodies ---');
  for (const skin of SKINS) {
    for (const anim of POSES) {
      const dest = join(BASE_DIR, `${skin}_${anim}_0.png`);
      if (existsSync(dest)) continue;
      const url = `https://maplestory.io/api/character/%7B%22itemId%22%3A${skin}%2C%22region%22%3A%22MCW%22%2C%22version%22%3A%22CBT2%22%7D%2C%7B%22itemId%22%3A${skin + 10000}%2C%22region%22%3A%22MCW%22%2C%22version%22%3A%22CBT2%22%7D/${anim}/0`;
      try {
        const res = await fetchWithTimeout(url, 10000);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(dest, buf);
          console.log(`Saved base body: ${skin}_${anim}_0.png`);
        }
      } catch (e) {
        console.warn(`Failed base body ${skin} ${anim}:`, (e as any)?.message || e);
      }
    }
  }
}

async function fetchItemData(id: number, src?: 'GMS' | 'OSMS'): Promise<any | null> {
  // Modern OSMS hair and face cosmetics are served from the GMS data set, just
  // like the other modern cosmetics selected by assetSource().
  const preferred = src === 'GMS' || src === 'OSMS'
    ? 'https://maplestory.io/api/GMS/270'
    : 'https://maplestory.io/api/MCW/CBT2';
  const fallback = preferred.includes('GMS/270')
    ? 'https://maplestory.io/api/MCW/CBT2'
    : 'https://maplestory.io/api/GMS/270';
  for (const apiBase of [preferred, fallback]) {
    try {
      const res = await fetchWithTimeout(`${apiBase}/item/${id}`, 8000);
      if (!res.ok) continue;
      const raw = await res.json();
      if (raw?.frameBooks && Object.keys(raw.frameBooks).length) return raw;
    } catch {
      // try the other region
    }
  }
  return null;
}

async function bakeItem(id: number, meta: any): Promise<boolean> {
  const dest = join(ITEMS_DIR, `${id}.json`);
  if (existsSync(dest)) return true;

  const raw = await fetchItemData(id, meta?.src);
  if (!raw || !raw.frameBooks) return false;

  const frames: Record<string, any[]> = {};
  const vslots: string[] = raw.metaInfo?.vslots ?? [];
  const islots: string[] = raw.metaInfo?.islots ?? [];
  for (const [actionName, action] of Object.entries<any>(raw.frameBooks)) {
    if (!action?.frames) continue;
    action.frames.forEach((f: any, fIdx: number) => {
      if (actionName !== 'stand1' && actionName !== 'stand2' && actionName !== 'alert' && actionName !== 'default') {
        return;
      }
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

  if (!Object.keys(frames).length) return false;

  writeFileSync(dest, JSON.stringify({ id, frames, vslot: vslots.join(''), islot: islots.join('') }));
  return true;
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

  await pool(itemEntries, 10, async ([idStr, meta]) => {
    const id = Number(idStr);
    const dest = join(ITEMS_DIR, `${id}.json`);
    if (existsSync(dest)) {
      skipped++;
      return;
    }
    const ok = await bakeItem(id, meta);
    count++;
    if (ok) success++;
    if (count % 50 === 0) {
      console.log(`Progress: ${count} baked (${success} ok, ${skipped} skipped)...`);
    }
  });

  bakeFaceIcons();

  console.log('--- Baking Hair Styles ---');
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
    await bakeItem(hairId, { src: catalog.styles[Math.floor(hairId / 10)]?.src });
  });

  console.log(`Done! Total: ${count} baked, ${skipped} already existed.`);
}

main().catch(console.error);

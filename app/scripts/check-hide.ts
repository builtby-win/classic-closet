/**
 * Re-checks data/nexon-overlay.json hide[] entries for newly landed art.
 * Hidden items are rate-table names with zero (or wrong) avatar frames in
 * every dataset (e.g. Race Queen Uniform 1057069: MCW serves stale retail
 * blue art, the crate item is red/white). Frame presence alone is NOT enough
 * (proven 2026-10-21) — a hide entry may carry wrongIconMd5, the md5 of the
 * known-wrong inventory icon; ACTION fires only when frames exist AND the
 * icon differs. Then: drop the hide entry, verify art vs the Nexon set
 * render, and re-run pnpm catalog + pnpm bake-sprites.
 *
 * Run: pnpm check-hide
 * Exit 0 = nothing landed; exit 2 = art landed, action needed.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const overlay = JSON.parse(readFileSync(join(ROOT, 'data', 'nexon-overlay.json'), 'utf8')) as {
  hide?: Array<{ id: number; note?: string; wrongIconMd5?: string }>;
};

const UA = { 'User-Agent': 'classic-closet check-hide' };

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: UA });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function hasFrames(base: string, id: number): Promise<'yes' | 'no' | 'unknown'> {
  const raw = await fetchBytes(`${base}/item/${id}`);
  if (!raw) return 'unknown';
  try {
    const parsed = JSON.parse(raw.toString()) as { frameBooks?: Record<string, unknown> } | null;
    return parsed?.frameBooks && Object.keys(parsed.frameBooks).length ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}

const BASES = ['https://maplestory.io/api/MCW/CBT2', 'https://maplestory.io/api/GMS/270'];

let actionNeeded = false;
for (const h of overlay.hide ?? []) {
  const landed: string[] = [];
  const states: string[] = [];
  for (const b of BASES) {
    const frames = await hasFrames(b, h.id);
    states.push(`${b.split('/api/')[1]}=${frames}`);
    if (frames !== 'yes') continue;
    if (h.wrongIconMd5) {
      const icon = await fetchBytes(`${b}/item/${h.id}/icon`);
      const md5 = icon ? createHash('md5').update(icon).digest('hex') : 'unfetchable';
      if (md5 === h.wrongIconMd5) {
        states.push(`(${b.split('/api/')[1]} art still known-wrong)`);
        continue;
      }
      landed.push(`${b} (icon ${md5})`);
    } else {
      landed.push(b);
    }
  }
  if (landed.length) {
    actionNeeded = true;
    console.log(`ACTION: ${h.id} has new art (${landed.join(', ')}) — ${h.note ?? ''}`);
  } else {
    console.log(`still hidden: ${h.id} — ${states.join(' ')}`);
  }
}
if ((overlay.hide ?? []).length === 0) console.log('hide[] is empty — nothing to check.');
process.exit(actionNeeded ? 2 : 0);

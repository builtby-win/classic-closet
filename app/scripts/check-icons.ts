/**
 * Probes every item icon the closet shows and reports the ones that 404 even
 * after the in-app fallback chain (iconFallbackURL in src/lib/fashion.ts).
 * Icons that only load via a fallback are listed too: they work, but cost a
 * failed request first and mean the primary source is missing that art.
 *
 * Run: pnpm check-icons
 * Exit 0 = every icon resolves; exit 2 = at least one icon is broken.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconFallbackURL, iconURL } from '../src/lib/fashion';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'catalog.json'), 'utf8')) as {
  items: Record<string, { name: string; sub: string; src?: string }>;
};

const UA = { 'User-Agent': 'classic-closet check-icons' };

async function ok(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(12000), headers: UA })).ok;
  } catch {
    return false;
  }
}

/** The URL the chain settles on, or null when every source 404s. */
async function resolve(id: number): Promise<{ url: string; hops: number } | null> {
  let url: string | null = iconURL(id);
  if (url.startsWith('/')) return { url, hops: 0 }; // baked local icon (faces)
  for (let hops = 0; url; hops++) {
    if (await ok(url)) return { url, hops };
    url = iconFallbackURL(url);
  }
  return null;
}

const entries = Object.entries(catalog.items);
const broken: string[] = [];
const fallbacks: string[] = [];
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < entries.length) {
    const [id, meta] = entries[next++]!;
    const hit = await resolve(Number(id));
    const label = `${id} ${meta.name} (${meta.sub}, src ${meta.src ?? 'MCW'})`;
    if (!hit) broken.push(label);
    else if (hit.hops) fallbacks.push(`${label} -> ${hit.url}`);
  }
}));

console.log(`${entries.length} icons checked: ${broken.length} broken, ${fallbacks.length} via fallback.`);
for (const line of fallbacks.sort()) console.log(`  fallback  ${line}`);
for (const line of broken.sort()) console.log(`  BROKEN    ${line}`);
process.exit(broken.length ? 2 : 0);

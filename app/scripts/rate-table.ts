import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Which part of a rate post to parse. Post 46331 holds two tables: the live one,
 *  then (after a "Coming Soon" heading) the table taking effect later. */
export type RatePart = 'current' | 'upcoming';

const MARKER = 'Coming Soon';

function stripHtml(body: string): string[] {
  return body
    .replace(/<[^>]+>/g, '|')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseRateTable(body: string, part?: RatePart): Map<string, string> {
  if (part) {
    const marker = body.indexOf(MARKER);
    if (marker < 0) throw new Error(`rate post has no "${MARKER}" marker; cannot pick the ${part} table (freeze it from a build made before the switch)`);
    body = part === 'current' ? body.slice(0, marker) : body.slice(marker);
    // A later cycle appends another marker; the table for `part` ends there.
    const next = body.indexOf(MARKER, part === 'upcoming' ? MARKER.length : 0);
    if (next >= 0) body = body.slice(0, next);
  }
  const segs = stripHtml(body);
  const pairs = new Map<string, string>();
  segs.forEach((s, j) => {
    if (/^[\d.]+%$/.test(s) && j > 0 && !/^[\d.]+%$/.test(segs[j - 1])) pairs.set(segs[j - 1], s);
  });
  return pairs;
}

/** Per-banner immutable rate snapshots: the first build that sees a banner's
 *  table records it; later rebuilds read the snapshot, never the live post, so
 *  Nexon editing/replacing the post can't change a banner's pool. */
export async function frozenRates(
  file: string,
  bannerId: string,
  capture: () => Promise<Map<string, string>>,
): Promise<Map<string, string>> {
  const store: Record<string, Record<string, string>> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const hit = store[bannerId];
  if (hit) return new Map(Object.entries(hit));
  const fresh = await capture();
  if (!fresh.size) throw new Error(`empty rate table for ${bannerId}; refusing to freeze`);
  store[bannerId] = Object.fromEntries(fresh);
  writeFileSync(file, JSON.stringify(store, null, 2) + '\n');
  return fresh;
}

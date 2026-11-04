/**
 * Visual review page for a crate banner: Nexon's per-set post images next to the
 * catalog icons each name resolved to, so a human can approve the resolution.
 *
 * Usage:
 *   pnpm review-crate <saleId> <group> [port]
 *   e.g. pnpm review-crate 47031 mystery-crate-2
 *
 * Reads the sale post (CMS v1/news/<saleId>) up to its "ONGOING SALES" heading, pairs
 * every set image with the item names listed after it, and looks the names up in
 * the baked catalog group. Serves the page on localhost and opens it. Red tiles =
 * name in the post with no catalog id; a name with several tiles = several ids.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CatalogItem { name: string; sub: string; sex: string; src?: string }
interface Catalog { items: Record<string, CatalogItem>; indexes: { groups: Record<string, Record<'m' | 'f' | 'u', number[]>> } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [saleId, group, port = '8765'] = process.argv.slice(2);
if (!saleId || !group) throw new Error('usage: pnpm review-crate <saleId> <group> [port]');

const catalog: Catalog = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'catalog.json'), 'utf8'));
const groupIds = catalog.indexes.groups[group];
if (!groupIds) throw new Error(`unknown group "${group}"; have: ${Object.keys(catalog.indexes.groups).join(', ')}`);

const idsByName = new Map<string, number[]>();
for (const id of [...groupIds.u, ...groupIds.m, ...groupIds.f]) {
  const name = catalog.items[id]!.name;
  idsByName.set(name, [...(idsByName.get(name) ?? []), id]);
}

const ICON_VERSION: Record<string, string> = { MCW: 'MCW/CBT2', GMS: 'GMS/270', MCW1: 'MCW/1' };
const iconUrl = (id: number) => `https://maplestory.io/api/${ICON_VERSION[catalog.items[id]!.src ?? ''] ?? 'MCW/CBT2'}/item/${id}/icon`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

const post = (await fetch(`https://g.nexonstatic.com/maplestory/cms/v1/news/${saleId}`).then((r) => r.json())) as { body: string };
const body = post.body.slice(0, post.body.indexOf('ONGOING SALES') >= 0 ? post.body.indexOf('ONGOING SALES') : undefined);

// parts = [text, <img>, text, <img>, text, ...]; each set image is followed by its name list.
const parts = body.split(/(<img[^>]*>)/);
let sets = '';
for (let k = 1; k < parts.length; k += 2) {
  const url = /src="([^"]+)"/.exec(parts[k]!)?.[1];
  if (!url || !/cash-shop-update/.test(url) || /in-post-banner/.test(url)) continue;
  const text = decode(parts[k + 1]!.split('<img')[0]!.replace(/<[^>]+>/g, ' ')).split('See all the reward')[0]!;
  const names = text
    .split(/(?<=\.)\s+/)
    .map((s) => s.replace(/\s+\./g, '.').trim())
    .filter((s) => s && !/^(All|Both|Item)\b/.test(s) && !/can only be|can be equipped/.test(s))
    .flatMap((s) => s.replace(/\.$/, '').split(/,\s*(?:and\s+)?|\s+and\s+/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!names.length) continue;
  const tiles = names
    .flatMap((name) => {
      const ids = idsByName.get(name);
      if (!ids) return [`<div class="t miss"><b>${esc(name)}</b><br>NOT IN CATALOG</div>`];
      return ids.map((id) => {
        const it = catalog.items[id]!;
        return `<div class="t"><img src="${iconUrl(id)}"><br><b>${esc(name)}</b><br><small>${id} · ${it.sub} · ${it.sex}</small></div>`;
      });
    })
    .join('');
  sets += `<div class="set"><img src="${esc(url)}"><div>${tiles}</div></div>\n`;
}

const page = `<meta charset=utf-8><title>${esc(group)} review</title><style>
body{font:14px system-ui;background:#111;color:#eee;margin:20px}
.set{border:1px solid #444;margin:16px 0;padding:12px;display:flex;gap:20px;align-items:flex-start}
.set>img{max-width:520px;background:#fff}
.t{display:inline-block;width:130px;text-align:center;margin:4px;vertical-align:top}
.t img{width:64px;height:64px;object-fit:contain;background:#fff;image-rendering:pixelated}
.miss{color:#f66}small{color:#999}</style>
<h1>${esc(group)}: Nexon image vs catalog icon (sale ${esc(saleId)})</h1>
<p>Icons use the same maplestory.io source as the app. Red = no catalog id.</p>
${sets}`;

createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page)).listen(Number(port), () => {
  console.log(`review page: http://localhost:${port}/ (ctrl-c to stop)`);
  execSync(`open http://localhost:${port}/`);
});

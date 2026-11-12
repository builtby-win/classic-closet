/**
 * Visual review page for a style-coupon banner: Nexon's per-style post images next
 * to the app's own render (same maplestory.io source/ids as the catalog) so a human
 * can verify every hair/face id.
 *
 * Usage:
 *   pnpm review-styles <saleId> <bannerId>
 *   e.g. pnpm review-styles 47069 style-nov11
 *
 * Listens on a free port (never collides with a running dev server) and opens it.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOOK, renderURL } from '../src/lib/fashion';

interface Entry { name: string; sex: 'm' | 'f'; style?: number; id?: number; src?: string }
interface Banner { id: string; hairs?: Entry[]; faces?: Entry[] }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [saleId, bannerId] = process.argv.slice(2);
if (!saleId || !bannerId) throw new Error('usage: pnpm review-styles <saleId> <bannerId>');

const rotations = JSON.parse(readFileSync(join(ROOT, 'data', 'rotations.json'), 'utf8')) as { current: Banner[]; past: Banner[] };
const banner = [...rotations.current, ...rotations.past].find((b) => b.id === bannerId);
if (!banner) throw new Error(`unknown banner "${bannerId}"`);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

const post = (await fetch(`https://g.nexonstatic.com/maplestory/cms/v1/news/${saleId}`).then((r) => r.json())) as { body: string };
const end = post.body.indexOf('ONGOING SALES');
const body = post.body.slice(0, end >= 0 ? end : undefined);

// Headings "Male Hair Styles" etc. scope the <img>Name</p> tiles that follow.
const tokens = body.split(/(<h3[^>]*>.*?<\/h3>|<img[^>]*>[^<]*)/s);
let sex: 'm' | 'f' = 'm';
let kind: 'hairs' | 'faces' = 'hairs';
const sections: Record<string, string[]> = {};
for (const t of tokens) {
  const h = /<h3[^>]*>(.*?)<\/h3>/s.exec(t)?.[1]?.replace(/<[^>]+>/g, '');
  if (h) {
    const m = /(Male|Female)\s+(Hair|Face)/.exec(h);
    if (m) { sex = m[1] === 'Male' ? 'm' : 'f'; kind = m[2] === 'Hair' ? 'hairs' : 'faces'; }
    continue;
  }
  const img = /<img[^>]*src="([^"]+)"[^>]*>([^<]*)/.exec(t);
  if (!img || !img[2]?.trim()) continue;
  const key = `${kind}:${sex}:${decode(img[2]).trim()}`;
  (sections[key] ??= []).push(img[1]!);
}

const tiles = (kind: 'hairs' | 'faces') => (banner[kind] ?? []).map((e) => {
  const id = kind === 'hairs' ? e.style! * 10 : e.id!;
  const url = sections[`${kind}:${e.sex}:${e.name}`]?.shift();
  const render = renderURL({ ...DEFAULT_LOOK, hair: kind === 'hairs' ? id : DEFAULT_LOOK.hair, face: kind === 'faces' ? id : DEFAULT_LOOK.face });
  return `<div class="t${url ? '' : ' miss'}"><div class="pair">${url ? `<img src="${esc(url)}">` : '<i>no Nexon image</i>'}<img src="${esc(render)}"></div><b>${esc(e.name)}</b> <small>${id} · ${e.sex}${e.src ? ` · ${e.src}` : ''}</small></div>`;
}).join('');

const page = `<meta charset=utf-8><title>${esc(bannerId)} review</title><style>
body{font:14px system-ui;background:#111;color:#eee;margin:20px}
.t{display:inline-block;width:340px;margin:8px;vertical-align:top;text-align:center}
.pair{display:flex;gap:6px;justify-content:center;align-items:center;height:210px}
.pair img{max-width:160px;max-height:200px;background:#fff;object-fit:contain}
.miss{color:#f66}small{color:#999}</style>
<h1>${esc(bannerId)}: Nexon image (left) vs app render (right)</h1>
<h2>Hairs</h2>${tiles('hairs')}<h2>Faces</h2>${tiles('faces')}`;

const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page)).listen(0, () => {
  const { port } = server.address() as { port: number };
  console.log(`review page: http://localhost:${port}/ (ctrl-c to stop)`);
  execSync(`open http://localhost:${port}/`);
});

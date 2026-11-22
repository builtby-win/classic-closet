/**
 * Selector for Classic items that may be missing from the catalog. Shows Nexon's own
 * icon + stats (v2.0 "New Weapons" + the Moon Bunny Hat PQ reward) and MeowDB-only
 * candidates with no Nexon evidence (flagged, no preview). Picks are exported as
 * data/hollow-picks.json; they are names + evidence, NOT catalog item ids.
 *
 * Usage: pnpm review-hollow
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hollow-picks.json');
const PATCH = 48255;
const PREVIEW = 48256;
const link = (id: number) => `https://www.nexon.com/maplestory/news/update/${id}`;

interface Cand { name: string; kind: string; stats: string[]; icon?: string; evidence?: string; note?: string }

async function body(id: number): Promise<string> {
  const r = await fetch(`https://g.nexonstatic.com/maplestory/cms/v1/news/${id}`);
  if (!r.ok) throw new Error(`Nexon CMS ${id}: ${r.status}`);
  return ((await r.json()) as { body: string }).body;
}

const decode = (s: string) => s.replace(/&#0?39;|&apos;|&rsquo;|’/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).trim();

const patch = await body(PATCH);
const preview = await body(PREVIEW);

const section = patch.slice(patch.indexOf('<!--New Weapons-->'));
const weapons = section.slice(0, section.indexOf('</ul>\n</div>') > 0 ? section.indexOf('<!--', 20) : undefined);
const cands: Cand[] = [];
for (const m of weapons.matchAll(/<li><img alt="[^"]*" src="([^"]+)"[^>]*>\s*<strong>(.*?)<\/strong>\s*\((.*?)\)\s*<ul>(.*?)<\/ul>/gs)) {
  cands.push({
    name: strip(m[2]),
    kind: strip(m[3]),
    icon: m[1],
    stats: [...m[4].matchAll(/<li>(.*?)<\/li>/g)].map((s) => strip(s[1])),
    evidence: link(PATCH),
  });
}
if (cands.length < 10) throw new Error(`parsed only ${cands.length} New Weapons; Nexon post layout changed`);

const hat = preview.match(/<img alt="Moon Bunny Hat" src="([^"]+)"/);
cands.push({
  name: 'Moon Bunny Hat',
  kind: 'Hat (PQ reward)',
  icon: hat?.[1],
  stats: ['Moon Bunny Rice Cake PQ: Possible Rewards', 'Primrose Seed shop: 10 seeds, tradable within world, permanent'],
  evidence: link(PREVIEW),
});
cands.push({
  name: 'Firefly Earrings',
  kind: 'Earrings',
  stats: [],
  note: 'MeowDB only (item-db/5583, Lv 45). No Nexon post mentions it. No preview available.',
  evidence: 'https://meowdb.com/msclassic/item-db/5583',
});

let saved: { picks?: Array<{ name: string }> } = {};
try { saved = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const prior = new Set((saved.picks ?? []).map((p) => p.name));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const cards = cands.map((c, i) => `
<label class="card">
  <input type="checkbox" data-i="${i}" ${prior.has(c.name) ? 'checked' : ''}>
  ${c.icon ? `<img src="${esc(c.icon)}" alt="">` : '<div class="noimg">no preview</div>'}
  <div><b>${esc(c.name)}</b> <span class="k">${esc(c.kind)}</span>
  ${c.stats.map((s) => `<div class="s">${esc(s)}</div>`).join('')}
  ${c.note ? `<div class="warn">${esc(c.note)}</div>` : ''}
  ${c.evidence ? `<a href="${esc(c.evidence)}" target="_blank" rel="noopener">evidence</a>` : ''}</div>
</label>`).join('');

const page = `<!doctype html><meta charset="utf-8"><title>Review Classic items</title>
<style>body{font:14px system-ui;margin:24px;background:#14161b;color:#e6e6e6}.card{display:flex;gap:12px;align-items:flex-start;padding:10px;margin:6px 0;border:1px solid #333;border-radius:8px;cursor:pointer}
.card img,.noimg{width:48px;height:48px;object-fit:contain;image-rendering:pixelated;flex:none}.noimg{font-size:10px;color:#888;border:1px dashed #555;display:flex;align-items:center;text-align:center}
.k{color:#8aa}.s{color:#aaa;font-size:12px}.warn{color:#e8b64a;font-size:12px}a{color:#7cb7ff}button{margin:12px 0;padding:8px 16px}#st{margin-left:10px;color:#8c8}</style>
<h2>Select the items that are legit</h2><button id="save">Save to data/hollow-picks.json</button><span id="st"></span>${cards}
<script>const C=${JSON.stringify(cands)};
document.getElementById('save').onclick=async()=>{
 const picks=[...document.querySelectorAll('input:checked')].map(e=>Number(e.dataset.i));
 const r=await fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({picks})});
 document.getElementById('st').textContent=r.ok?'saved '+picks.length:'failed '+r.status};</script>`;

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.headers.host !== origin.slice('http://'.length) || (req.headers.origin ?? origin) !== origin || req.headers['content-type'] !== 'application/json') {
      res.writeHead(403).end('forbidden');
      return;
    }
    let data = '';
    req.on('data', (d) => {
      data += d;
      if (data.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        const { picks } = JSON.parse(data) as { picks: unknown };
        if (!Array.isArray(picks) || !picks.every((i) => Number.isInteger(i) && i >= 0 && i < cands.length)) throw new Error('bad picks');
        const chosen = [...new Set(picks as number[])].sort((a, b) => a - b).map((i) => cands[i]);
        writeFileSync(OUT, `${JSON.stringify({ savedAt: new Date().toISOString(), picks: chosen }, null, 2)}\n`);
        res.writeHead(200).end('ok');
      } catch {
        res.writeHead(400).end('bad body');
      }
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
}).listen(0, '127.0.0.1', () => {
  const port = (server.address() as { port: number }).port;
  console.log(`review-hollow: http://127.0.0.1:${port}/  (${cands.length} candidates, picks -> data/hollow-picks.json)`);
  execSync(`open http://127.0.0.1:${port}/`);
});

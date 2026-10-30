/**
 * Human review gate for baked sprites (see scripts/lib/sprite-review.ts).
 *
 *   pnpm check-sprites                 list unreviewed sprites, write review/sprites.html, exit 2 if any
 *   pnpm check-sprites --approve 1702092 1002544   approve those ids at their current art
 *   pnpm check-sprites --approve-all   approve everything listed (after eyeballing the sheet)
 *
 * Open review/sprites.html, compare each baked sprite against the in-game cash shop
 * look. Near-duplicates (>= 90% alike another sprite of the same slot) sort first:
 * that is where same-name / same-art mix-ups hide.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVALS_PATH, ITEMS_DIR, NEAR_DUPLICATE, ROOT, loadApprovals, loadCatalogItems, signature, similarity, spriteHash, unreviewedItems } from './lib/sprite-review';

const args = process.argv.slice(2);
const pending = unreviewedItems();

function save(approved: Record<string, string>) {
  const sorted = Object.fromEntries(Object.entries(approved).sort(([a], [b]) => Number(a) - Number(b)));
  writeFileSync(APPROVALS_PATH, JSON.stringify({ approved: sorted }, null, 2) + '\n');
}

if (args[0] === '--approve' || args[0] === '--approve-all') {
  const ids = args[0] === '--approve-all' ? pending.map((p) => p.id) : args.slice(1);
  if (!ids.length) throw new Error('--approve needs ids (or use --approve-all)');
  const approved = loadApprovals();
  for (const id of ids) {
    const hash = spriteHash(id);
    if (!hash) throw new Error(`no baked sprite for ${id}`);
    approved[id] = hash;
  }
  save(approved);
  console.log(`approved ${ids.length} sprite(s)`);
  process.exit(0);
}

if (!pending.length) {
  console.log('all baked sprites reviewed');
  process.exit(0);
}

const items = loadCatalogItems();
const sigs = new Map<string, Float32Array | null>();
const sig = (id: string) => (sigs.has(id) ? sigs.get(id)! : (sigs.set(id, signature(id)), sigs.get(id)!));

const rows = pending.map((p) => {
  const mine = sig(p.id);
  const twins = mine
    ? Object.entries(items)
        .filter(([id, it]) => id !== p.id && it.sub === p.item.sub)
        .map(([id, it]) => ({ id, name: it.name, score: sig(id) ? similarity(mine, sig(id)!) : 0 }))
        .filter((t) => t.score >= NEAR_DUPLICATE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
    : [];
  return { ...p, twins };
}).sort((a, b) => b.twins.length - a.twins.length || Number(a.id) - Number(b.id));

const img = (id: string) => {
  const frames = JSON.parse(readFileSync(join(ITEMS_DIR, `${id}.json`), 'utf8')).frames as Record<string, Array<{ image: string }>>;
  const key = ['stand1:0', 'default:0'].find((k) => frames[k]) ?? Object.keys(frames)[0]!;
  return `<img src="${frames[key]![0]!.image}" style="image-rendering:pixelated;height:96px">`;
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const card = (r: (typeof rows)[number]) => `<div class="c${r.twins.length ? ' dup' : ''}">
  <div class="art">${img(r.id)}</div>
  <b>${esc(r.item.name)}</b><br>${r.id} · ${esc(r.item.sub)} · src ${r.item.src ?? 'MCW'}${r.item.bannerId ? ` · ${esc(r.item.bannerId)}` : ''}${r.changed ? ' · <em>art changed since approval</em>' : ''}
  ${r.twins.map((t) => `<div class="twin">${img(t.id)}<br>${(t.score * 100).toFixed(0)}% like ${t.id} ${esc(t.name)}</div>`).join('')}
</div>`;
mkdirSync(join(ROOT, 'review'), { recursive: true });
writeFileSync(join(ROOT, 'review', 'sprites.html'), `<!doctype html><meta charset=utf-8><title>Sprite review</title>
<style>body{font:13px system-ui;background:#222;color:#eee;padding:16px}.g{display:flex;flex-wrap:wrap;gap:12px}.c{background:#333;padding:10px;width:230px;border-radius:6px}.dup{outline:2px solid #f90}.art{background:#555;text-align:center;padding:6px;margin-bottom:6px}.twin{margin-top:6px;font-size:11px;background:#444;padding:4px}</style>
<h1>${rows.length} unreviewed sprites (${rows.filter((r) => r.twins.length).length} with near-duplicates)</h1><p>Approve: <code>pnpm check-sprites --approve &lt;id…&gt;</code> or <code>--approve-all</code></p><div class="g">${rows.map(card).join('')}</div>`);

console.log(`${rows.length} sprite(s) need human review (${rows.filter((r) => r.twins.length).length} near-duplicate of another sprite in the same slot):`);
for (const r of rows) console.log(`  ${r.id} ${r.item.name} (${r.item.sub}, src ${r.item.src ?? 'MCW'})${r.twins.length ? `  ~dup: ${r.twins.map((t) => `${t.id} ${(t.score * 100).toFixed(0)}%`).join(', ')}` : ''}`);
console.log('\nOpen review/sprites.html, then pnpm check-sprites --approve <id…> | --approve-all');
process.exit(2);

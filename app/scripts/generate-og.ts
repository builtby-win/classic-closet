/**
 * Bakes public/og-default.png (1200x630) for link unfurls.
 * Fetches the default look at high resize, renders a branded SVG
 * background with rsvg-convert, composites with ImageMagick.
 * Run: npx tsx scripts/generate-og.ts
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_LOOK, renderURL } from '../src/lib/fashion';

const W = 1200;
const H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="32%" cy="42%" r="90%">
      <stop offset="0%" stop-color="#23232f"/>
      <stop offset="55%" stop-color="#181820"/>
      <stop offset="100%" stop-color="#101014"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="905" cy="330" rx="225" ry="285" fill="url(#glow)"/>
  <rect x="76" y="150" width="52" height="6" fill="#e8b64c"/>
  <text x="76" y="208" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="27" letter-spacing="4" fill="#e8b64c">MAPLESTORY CLASSIC WORLD</text>
  <text x="72" y="348" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="104" font-weight="800" fill="#f4f1e8">Classic Closet</text>
  <text x="76" y="418" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="35" fill="#b7b2a6">Classic dress-up preview.</text>
  <text x="76" y="468" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="35" fill="#b7b2a6">Pick hair, face and equips.</text>
  <text x="76" y="560" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="26" fill="#6f6c80">classic-closet.builtby.win</text>
</svg>`;

async function main() {
  const dir = tmpdir();
  const svgPath = join(dir, 'mc-og-bg.svg');
  const bgPath = join(dir, 'mc-og-bg.png');
  const charPath = join(dir, 'mc-og-char.png');
  const outPath = join(dir, 'mc-og-default.png');

  const charUrl = renderURL(DEFAULT_LOOK).replace('resize=1', 'resize=8');
  console.log('fetching character…');
  const res = await fetch(charUrl);
  if (!res.ok) throw new Error(`character fetch -> ${res.status}`);
  writeFileSync(charPath, Buffer.from(await res.arrayBuffer()));
  writeFileSync(svgPath, svg);

  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', bgPath, svgPath]);
  execFileSync('convert', [
    bgPath,
    '(', charPath, '-resize', 'x560', ')',
    '-gravity', 'east', '-geometry', '+70+0', '-composite',
    outPath,
  ]);
  const info = execFileSync('identify', ['-format', '%w %h %B', outPath]).toString().trim();
  console.log('og image:', info, '->', outPath);
  if (!info.startsWith(`${W} ${H} `)) throw new Error(`bad dimensions: ${info}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

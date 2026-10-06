/**
 * Tooling helper to inspect and update banner rotations for MapleStory Classic.
 *
 * Usage:
 *   pnpm update-banners --check <postId>      # Inspect Nexon CMS rate post
 *   pnpm update-banners --archive <bannerId>  # Move active banner to pastRotations
 *   pnpm update-banners --rebuild             # Re-run catalog rebuild
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CMS = 'https://g.nexonstatic.com/maplestory/cms/v1/general-posts';
const rotationsPath = join(ROOT, 'data', 'rotations.json');

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

async function checkPost(postId: string) {
  console.log(`Fetching Nexon post CMS/${postId}...`);
  try {
    const res = await fetch(`${CMS}/${postId}`).then((r) => r.json()) as { body: string };
    const text = res.body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`--- Content Snippet (first 1000 chars) ---`);
    console.log(text.slice(0, 1000));
    console.log(`------------------------------------------`);
  } catch (e) {
    console.error(`Failed to fetch post:`, e);
  }
}

function archiveBanner(bannerId: string) {
  console.log(`Archiving banner ${bannerId}...`);
  const data = JSON.parse(readFileSync(rotationsPath, 'utf8'));
  const current = data.current || [];
  const past = data.past || [];

  const idx = current.findIndex((b: { id: string }) => b.id === bannerId);
  if (idx < 0) {
    console.error(`Banner ${bannerId} not found in current rotations.`);
    return;
  }

  const [removed] = current.splice(idx, 1);
  past.unshift(removed);
  data.current = current;
  data.past = past;

  writeFileSync(rotationsPath, JSON.stringify(data, null, 2));
  console.log(`Moved ${bannerId} to past rotations. Rebuilding catalog...`);
  execSync('pnpm catalog', { cwd: ROOT, stdio: 'inherit' });
}

function rebuild() {
  console.log(`Rebuilding catalog from rotations.json...`);
  execSync('pnpm catalog', { cwd: ROOT, stdio: 'inherit' });
}

if (command === '--check' && target) {
  await checkPost(target);
} else if (command === '--archive' && target) {
  archiveBanner(target);
} else {
  rebuild();
}

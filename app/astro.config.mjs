// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

// Prerendered-only: no SSR routes, no auth/DB. Deploys via Workers Static
// Assets + the src/worker.ts Worker to classic-closet.builtby.win.
// All MapleStory data comes from the baked catalog (src/data/catalog.json)
// + live render/icon images direct from maplestory.io (CORS: *).
export default defineConfig({
  output: 'server', // every page sets `prerender = true`; src/worker.ts is the Worker
  devToolbar: { enabled: false },
  integrations: [react()],
  session: false,
  // The Cloudflare Vite plugin 404s Astro's client virtual modules in dev (islands never hydrate), so dev runs without it.
  adapter: process.argv.includes('dev') ? undefined : cloudflare({ imageService: 'passthrough' }),
});
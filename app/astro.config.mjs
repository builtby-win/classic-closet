// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static-only: no SSR, no API routes, no auth/DB. Deploys to Cloudflare Pages.
// All MapleStory data comes from the baked catalog (src/data/catalog.json)
// + live render/icon images direct from maplestory.io (CORS: *).
export default defineConfig({
  output: 'static',
  integrations: [react()],
});

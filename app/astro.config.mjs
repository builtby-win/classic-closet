// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static-only: no SSR, no API routes, no auth/DB. Deploys via Workers Static
// Assets (src/worker.ts) to classic-closet.builtby.win.
// All MapleStory data comes from the baked catalog (src/data/catalog.json)
// + live render/icon images direct from maplestory.io (CORS: *).
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  integrations: [react()],
});

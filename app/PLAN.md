# Maple Fashion — Classic dress-up preview

Static web app for trying on MapleStory Classic World looks (male + female),
live character rendering, and link sharing with rich iMessage preview.

Live: https://maple-closet.builtby.win

## Flow

```mermaid
flowchart TD
    gate(["First visit: ♂ / ♀ gate (skipped if query param or storage)"]) --> sliders
    sliders["Bottom sheet: section sliders<br/>(Current Banner Hair · Color · Current Banner Face · Crates · Past Rotations)"] --> pick["Tap tile → wear"]
    pick --> preview["Preview swaps (preloaded Image)"]
    sliders --> seeall["see all → per section"]
    seeall --> catpage["Category page: full grid + filter"]
    catpage --> pick
    bar["Top search bar"] --> global["Global results (with attainability tags)"]
    global --> pick
    sexbtn["⚙ settings"] --> resex["Switch sex / pose / skin"]
    share["copy link"] --> query["Look encoded in query param ?look=... + localStorage"]
    query --> og["iMessage / Social preview via Cloudflare Pages middleware"]
```

- **State** (`Look` in `src/lib/fashion.ts`): sex, skin, hair, hairCol, face, anim,
  frame, items. Persisted to URL query parameters (`?look=...`) on every change (`history.replaceState`) +
  saved in `localStorage` (`mf-look`, `mf-sex`). Shared links restore via `decodeLook`.
- **Preview**: `renderURL(look)` → `GET /api/MCW/CBT2/Character/{skin}/{ids}/{anim}/{frame}`.
  PNG, swapped only after offscreen `Image.onload` (no flicker).
- **iMessage / Social Sharing**: Query param `?look=...` is intercepted by Cloudflare Pages
  middleware (`functions/_middleware.ts`) which uses native `HTMLRewriter` to inject
  dynamic `<meta property="og:image">` pointing to the maplestory.io character render.
- **Hair & Face Banner Rotation System**:
  - Hairs and faces in MapleStory Classic are limited-time banner rotations (not permanently available).
  - **Current Banner**: Hairs and faces from the active announcement are placed **UP FRONT** and marked attainable with their end dates.
  - **Past Rotations**: Past styles remain browseable and wearable in the customizer, but are clearly tagged as **Not Attainable**, displaying when they were last attainable (e.g. `Last available: Aug 15 – Sep 15, 2026`).
  - **Unannounced Styles**: Arbitrary unannounced dump styles are not shown as "classic" or "always available".
- **Banner Updates**: Managed via `data/rotations.json` and the repository skill `.agents/skills/update-banners/SKILL.md` (`pnpm update-banners`).

## Data pipeline

```mermaid
flowchart LR
    cms["Nexon Sale & Rate Posts<br/>(CMS 45537, 45538, 45659)"] --> rotations["data/rotations.json<br/>(current + past banners)"]
    rotations --> build["pnpm catalog<br/>(scripts/build-catalog.ts)"]
    msio["maplestory.io CBT2 + GMS fallback"] --> build
    overlay["data/nexon-overlay.json"] --> build
    build --> json["src/data/catalog.json<br/>(Normalized FastCatalog Entity Store: ~17KB)"]
    json --> island["FashionIsland<br/>(O(1) lookups, zero array filtering)"]
```

## App structure

```mermaid
flowchart TD
    subgraph app["projects/maple-closet/app (Astro + React island + Cloudflare Pages)"]
        page["src/pages/index.astro"] --> island["src/components/fashion-island.tsx"]
        island --> lib["src/lib/fashion.ts (URLs, slots, query params, storage)"]
        island --> data["src/data/catalog.json (baked)"]
        island --> css["src/components/fashion.css"]
        layout["src/layouts/base.astro"] --> meta["OpenGraph & Twitter meta tags"]
        middleware["functions/_middleware.ts"] --> ogrewriter["HTMLRewriter dynamic OG previews"]
        rotations["data/rotations.json"] --> scripts["scripts/build-catalog.ts"]
        scripts --> data
    end
```

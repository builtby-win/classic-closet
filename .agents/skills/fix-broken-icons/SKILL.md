---
name: fix-broken-icons
description: Diagnoses and fixes item icons that show as broken-image placeholders in Classic Closet (rotation cards, rails, search, equip toast). Use when a tile's icon fails to load in prod, after a catalog rebuild, or when new cash/equip items land.
---

# Fix Broken Item Icons

Item icons are not baked into the repo. `iconURL(id)` in `app/src/lib/fashion.ts` builds a
`https://maplestory.io/api/<region>/<version>/item/<id>/icon` URL from the item's catalog `src`:

| `src` | Icon URL |
|---|---|
| `MCW` (default), non-cosmetic `OSMS` | `MCW/CBT2` |
| `GMS`, OSMS hair | `GMS/270` |
| OSMS face | baked locally in `public/sprites/faces/` |

Not every region/version ships every icon. A 404 shows as the browser's broken-image glyph.
Known cases: GMS 270 lacks the Aurora cash scepters (1702405, 1702445, 1702468) but GMS 255
has them; MCW CBT2 lacks several OSMS-only hats/earrings that GMS 270 has.

## 1. Find them

```bash
cd app
pnpm check-icons
```

Probes every catalog item through the fallback chain. Exit 2 = at least one icon is broken
on every source. `fallback` lines work in the app but pay a failed request first.

## 2. Fix by case

**Listed as `fallback` only** — nothing is broken. The `<img onError>` in `Tile` and the equip
toast walk `iconFallbackURL` (`ICON_SOURCES` in `fashion.ts`: `MCW/CBT2` → `GMS/270` → `GMS/255`).
Leave it unless many items now share the same fallback, in which case the catalog `src` is
probably wrong (see `update-banners` for pin sources).

**Listed as `BROKEN`** — no source in the chain has the icon:
1. Probe other versions by hand; the id's icon may live in an older or other-region build:
   ```bash
   for r in GMS/255 GMS/240 GMS/214 GMS/83 KMS/367 JMS/419; do
     echo -n "$r "; curl -s -o /dev/null -w "%{http_code}\n" "https://maplestory.io/api/$r/item/<id>/icon"
   done
   ```
2. If a version serves it, append it to `ICON_SOURCES` in `app/src/lib/fashion.ts` (keep newest
   first) and add its case to the `icons fall back…` test in `app/tests/fashion.test.ts`.
3. Same id can be different art per region (GMS 1332001 vs MCW 1332001). For an icon that is
   only a thumbnail this is acceptable; for sprites it is not, so never change `assetSource`
   to fix an icon.
4. If nothing serves it, the item likely has no art anywhere: check `pnpm check-hide` and the
   `hide[]` list in `app/data/nexon-overlay.json`, or let `bake-sprites` prune it if `unreleased`.

**Icon loads but is the wrong item** — a same-id collision between regions. Pin the source in
`app/data/nexon-overlay.json` (see the `update-banners` skill), then `pnpm catalog` and
`pnpm bake-sprites`.

## 3. Verify

```bash
cd app
pnpm check-icons   # exit 0
pnpm test          # fallback chain + cash-weapon tests
pnpm typecheck
```

Then open the closet, expand a rotation card ("Rotation info") and confirm the tiles render.
Icons are fetched client-side, so a fix only reaches prod after `pnpm deploy`.

## Related: cash weapon behavior

Cash weapon skins ship frames per underlying weapon type (`frameBooksPerWeaponType`). `bake-sprites`
writes a catalog `wsub` (Bow, Crossbow, Claw, …) for skins that fit a single family, and
`weaponSubOf()` makes stance, shield removal and play-mode attacks follow it. Re-run
`pnpm bake-sprites` after `pnpm catalog` so new cash weapons get classified; `pnpm catalog`
rewrites `catalog.json` and drops `wsub`.

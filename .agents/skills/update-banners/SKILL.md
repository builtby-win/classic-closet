---
name: update-banners
description: Updates MapleStory Classic banner rotations, face and hair availability, and catalog data from official MapleStory announcements and rate posts.
---

# Update Banners & Cosmetic Rotations

Use this skill when MapleStory Classic announces new Cash Shop banners, Mystery/Signature Style Coupons, seasonal hair/face rotations, equip covers, fashion crates, or when an active rotation ends.

MapleStory Classic does not have permanent "always-available" hair and face salons. Hair and face styles rotate through limited-time banners.
- Items in **active banners** are currently attainable and featured **up front**.
- Items in **past banners** remain in the catalog for theorycrafting and sharing, but are explicitly flagged as **Not Attainable**, showing the date window when they were last available.
- Unannounced styles from full data dumps are never shown as "classic" or "always available".

---

## 1. Extract Facts From Any New Announcement

Every Nexon cash shop cycle follows the same shape. Pull these fields from the sale post + linked CMS rate posts — never carry prices/dates forward from a previous cycle:

1. **Sale window** — start/end dates (note timezone, e.g. `7:59 AM UTC`).
2. **Coupon price split, all four** — Mystery Hair NX, Mystery Face NX, Signature Hair NX, Signature Face NX. Hair and face cost different NX; never collapse to one pair.
3. **Mechanic split** — Mystery = random style (per-style % rates); Signature = pick-your-style (no rate table).
4. **Coupon duration** — how long the resulting style lasts (e.g. 14 days). Distinct from the sale window.
5. **Cover duration** — equip covers have their own expiry (e.g. 10 days) and often a different/longer sale window. UI MUST say e.g. `10-day duration`, never "permanent".
6. **Rate table URLs** — CMS probability posts per coupon/crate type: `https://g.nexonstatic.com/maplestory/cms/v1/general-posts/<postId>`.
7. **Style lists** — names + sex + rate (mystery) or plain name (signature) + style/face ids.

```bash
cd app
pnpm update-banners --check <postId>
```

### Worked Example (Founder's Access, Oct 6 2026 — sale post `45819`)

- Mystery Hair **5,500 NX** · Mystery Face **3,500 NX** — random, 16.67% each (6/sex), style lasts **14 days**, sale Oct 6 → Oct 28. Rates CMS `45537`.
- Signature Hair **7,500 NX** · Signature Face **5,500 NX** — pick-your-style, lasts **14 days**, same sale window.
- 10-Day Equip Covers **700–1,200 NX** — item lasts **10 days**, sale Oct 6 → Nov 18.
- Founder's Mystery Fashion Crate **3,500 NX** (×11 = 35,000 NX) — sale Oct 6 → Oct 28. Rates CMS `45538`.
- Aurora Mystery Fashion Crate **20 stamps** (×10 = 200) — Season 1 Oct 6 → Jan 13. Rates CMS `45659`.

---

## 2. Updating `app/data/rotations.json`

`app/data/rotations.json` is the source of truth for all current and past banner history.

### When a New Banner Starts

Add the new banner into `current` with all four prices split, plus `post` (sale post) and `rates` (CMS drop table) links:

```json
{
  "id": "style-<mon><yy>",
  "type": "style-coupon",
  "label": "Mystery & Signature Style Coupons",
  "start": "<sale-start>",
  "end": "<sale-end>",
  "note": "Mystery Hair <N> NX · Mystery Face <N> NX · Signature Hair <N> NX · Signature Face <N> NX · <D>-day styles",
  "post": "https://www.nexon.com/maplestory/news/sale/<saleId>/...",
  "rates": "https://g.nexonstatic.com/maplestory/cms/v1/general-posts/<postId>",
  "hairs": [
    { "name": "Hairstyle Name", "sex": "m", "rate": "<N>%", "style": 3000 }
  ],
  "faces": [
    { "name": "Face Name", "sex": "m", "rate": "<N>%", "id": 20000 }
  ],
  "signatureHairs": [
    { "name": "Signature Hairstyle Name", "sex": "m", "style": 3001 }
  ],
  "signatureFaces": [
    { "name": "Signature Face Name", "sex": "m", "id": 20001 }
  ]
}
```

Cover-type banners use `type: "covers"` with the item duration in the note (`<N>-day duration`), and their own sale window:

```json
{
  "id": "covers-<N>day-<mon><yy>",
  "type": "covers",
  "label": "<N>-Day Equip Covers",
  "start": "<sale-start>",
  "end": "<sale-end>",
  "note": "<lo>–<hi> NX · <N>-day duration",
  "post": "https://www.nexon.com/maplestory/news/sale/<saleId>/..."
}
```

Banner `post`/`rates` carry through `scripts/build-catalog.ts` into `BannerMeta.post`/`rates` and the baked `catalog.json`. Shop prices for unverified items are `[INFERENCE]` — never invent NX costs.

### When an Active Banner Ends (Roll Over)

1. Run the archive command or manually move the banner from `current` to `past`:
```bash
cd app
pnpm update-banners --archive <bannerId>
```
2. The archived banner is automatically moved to the `past` array in `app/data/rotations.json`.
3. Any items in the expired banner that are not in the new active banner will automatically be marked `attainable: false` and tagged with `lastAttainable` preserving their start and end dates.

---

## 3. Rebuilding the Catalog

After editing `app/data/rotations.json`:
```bash
cd app
pnpm catalog
```

This runs `scripts/build-catalog.ts`, which:
- Refetches official rates and MCW sprites.
- Resolves each rate-table name to an item ID: `nexon-overlay.json` pins first, then OSMS/MCW Classic data, then GMS retail fallback (cash NX preferred; same-name gender splits all resolve).
- Expands hairstyles across all 8 colors (0..7).
- Tags active banner items with `attainable: true`.
- Tags past banner items with `attainable: false` and their `lastAttainable` date range.
- Excludes all unannounced dump items.
- Writes the baked `app/src/data/catalog.json`.

### Resolving names with no exact dataset match

`pnpm catalog` never silently drops a name. A miss prints:

```
crate item not in any dataset, skipped: <Name>
  maybe: <candidate> (id <N>, <Sub>[, GMS cash=true])
  pin the verified id in data/nexon-overlay.json -> pins
```

Candidates are token-overlap suggestions only — never auto-applied. Resolution is the agent's job, per miss:

**1. Gather candidates from every source.** The build log shows top-3 only. Search wider yourself:
- GMS retail dump: `https://maplestory.io/api/GMS/270/item/list?count=<count>` (needs `User-Agent` header — bare `urllib` gets 403; use `curl -A`). Match on exact lowercase name first, then substring/token variants (`Chocolate` → `Choco`, `CHOCO`).
- MCW Classic: `https://maplestory.io/api/MCW/CBT2/item/...` (same).
- OSMS datamine: `https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/<ref>/data/current/items.json`.
- Sale-post body itself (CMS `v1/news/<saleId>` — the page is SPA, curl the API): the set an item appears in hints its slot (e.g. grouped with hats/balloon/watch = Hat).

**2. Disambiguate — known patterns (all seen in Founder's/Aurora):**
- **Cash vs non-cash dupe:** same name, different item. `Bunny Ears` = Hat 1003050 (`isCash`, Equip) vs One-Handed Sword 1302222 (non-cash weapon). Crate cosmetics are NX: pick cash. The builder does this automatically; verify the pick.
- **Gender split:** same name, m + f IDs. `Sailor Outfit` = 1050152 (m) + 1051180 (f). Keep both — one catalog record each.
- **Same-name art variants:** same name/sub/cash, different IDs AND different art (Aurora: White Choco Bunny 1003998/1004094, Pink Bunny Sweater 1042238/1042270, Chocolate Ribbon 1082565/1082581, Cacao Bear Shoes 1072876/1072910). Compare icon bytes (`/api/GMS/270/item/<id>/icon`); if art differs, keep both rows — one is the Classic item, unknown which.
- **Renamed retail item:** no exact name anywhere (`Chocolate Chat Ring`; closest `Choco Chat Ring` 1115061). Treat as guilty-until-proven: verify slot + cash + art against the Nexon post before pinning.

**3. Verify a candidate before pinning.** All four must hold:
1. `overallCategory === 'Equip'` (coupons/Other-category records don't render).
2. `subCategory` fits the item's set context from the sale post.
3. `isCash === true` for NX cosmetics (weapons with `sub: 'Cash'` excepted — they render via stance fallback).
4. Art check: fetch the icon, eyeball it against the post. For variants, confirm it actually bakes: `curl .../item/<id>` must return non-empty `frameBooks` (rings ship zero frames — unbakeable, pin is pointless).

**4. Pin or flag.** Verified → `{ "name": "<Rate-table name>", "id": <N>, "note": "<why>" }` in `app/data/nexon-overlay.json` → `pins`, re-run `pnpm catalog` (bad pin ID = hard throw). Not verifiable (Classic-exclusive, in no dataset) → leave skipped, flag in PR/report. Never invent an ID.

**5. Bake.** `pnpm bake-sprites` retries fetches and throws on real failure (rings warn-only). Confirm zero `unbaked` non-ring IDs before deploy.

---

## 4. Surfacing Prices in the UI

Keep section headers self-describing so users never guess costs or durations:

- Mystery sections: `<Name> · <N> NX random · ends <Mon D>` + sub `Random style per coupon · <rate>% each · coupon lasts <D> days`, with `rates` (drop table) + `news` (sale post) links.
- Signature sections: `<Name> · <N> NX pick · ends <Mon D>` + sub `Choose your style · coupon lasts <D> days`, with `news` link only (no rate table — choice, not random).
- Cover slot sections: `<Slot> · <N>-day · <count>` + sub `<N>-day duration · <price range> · sale ends <date>` with `news` link. Cover tile badges read `<N>-day duration · sale ends <date>`; tile lines show the same.
- Category (`see all`) pages repeat the price in the title with the same sub-line convention, including real `<a>` links to `STYLE_RATES`/`NEWS_POST`.
- The end dates in labels (`ends Oct 28`) are display strings — derive them from the banner `end` via `shortDate()` where practical; when hardcoding, match `rotations.json`.

---

## 5. Verification

Always verify before deploying:
1. Run typecheck and static build:
   ```bash
   cd app
   pnpm typecheck
   pnpm build
   ```
2. Run tests: `pnpm test` (Mystery counts, classic equips, job filtering, randomizer).
3. Check that active banners appear up front in the UI with correct prices, durations, and working `news`/`rates` links.
4. Check that past banner styles show the `[Not Attainable]` badge and their last attainable date.
5. Check that sharing URLs generates query params (`?look=...`) for iMessage dynamic previews.

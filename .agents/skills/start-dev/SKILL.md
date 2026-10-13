---
name: start-dev
description: Starts the classic-closet local dev server (Astro) for local preview and development.
---

# Start Dev

Use this skill when the user says `/start-dev`, start dev, run locally, or wants to preview the app.

Classic-closet is a static Astro app in `app/` (sources, pages, and `package.json` all live there — not at repo root). The dev command is `pnpm dev` (`astro dev`, default `http://localhost:4321/`). No env vars, DB, or auth needed for dev.

---

## 1. Go to `app/`

All commands run from `app/`. Running from repo root produces `Missing pages directory: src/pages` and a broken manifest (see root `.astro/dev.log`) — that log is stale output from a root run, ignore it.

```bash
cd app
```

## 2. Install deps if needed

If `app/node_modules` is missing or `pnpm dev` complains about unresolved modules:

```bash
cd app
pnpm install
```

(`pnpm-lock.yaml` exists — use pnpm, not npm.)

## 3. Reuse an already-running server

Before starting, check `http://localhost:4321/`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/
```

- `200` → server is already up. Tell the user the URL, do not start a second one.
- Anything else → start it.

If the port is taken but not responding, find and kill it (`lsof -ti:4321 | xargs kill`) then start fresh.

## 4. Start the server (background)

Run detached so it survives the command and watches for file changes:

```bash
cd app
pnpm dev
```

Expect:

```
astro  v7.x ready in … ms
┃ Local    http://localhost:4321/
```

## 5. Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/
```

- `200` → done. Report `http://localhost:4321/`.
- Still failing → read the terminal output: missing `node_modules` means step 2; `Missing pages directory` means the server was launched from repo root instead of `app/` — `cd app` and retry.

---

## Notes

- Source of truth: `app/package.json` scripts (`dev`, `build`, `preview`, `typecheck`, `test`).
- Dev serves `app/src/pages/index.astro` + the `FashionIsland` React island with the baked `src/data/catalog.json`; no catalog rebuild needed just to preview.
- Full pipeline (`pnpm catalog`, `pnpm bake-sprites`, banner updates) is out of scope — see the `update-banners` skill.

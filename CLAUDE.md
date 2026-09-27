# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zemda ("MedSchedule SaaS" internally) — multi-tenant SaaS for Brazilian health clinics and solo
practitioners (medicine, dentistry, psychology, physio, speech therapy, occupational therapy,
nutrition, personal training). Monorepo:

- `backend/` — Node/TypeScript/Express, SQLite via the built-in synchronous `node:sqlite` (release
  candidate as of Node 24; the `ExperimentalWarning` in logs is expected on Node 22).
- `frontend/` — React 18 + Vite + Tailwind, TypeScript.
- `android/`, `desktop/` — Capacitor and Electron wrappers around the same frontend build; thin
  clients, no business logic of their own.

## ⚠️ Repo/deploy topology — read before touching git

- **`main` auto-deploys to production** (Railway, project "bountiful-reflection", zemda.com.br) on
  every push. There is no staging environment.
- This repo has **two active developers pushing directly to `main`**: the owner's business partner
  commits there frequently and directly, often several times a day, with no PR review. **Always
  `git fetch origin` and check `git log main..origin/main` before assuming you know the tip of
  `main`** — it moves under you mid-session.
- **Never push to `main` unless the user explicitly asks for that push in this turn.** Do
  substantial work on a local branch (`git switch -c fix/... origin/main`); ask before publishing.
- To integrate several local branches into a `main` that keeps advancing: build in a separate
  `git worktree` from fresh `origin/main`, `git cherry-pick` each branch's commits in order (not
  merge — keeps history linear), resolve conflicts, build+test both `backend/` and `frontend/`,
  re-check `origin/main` hasn't moved again, then push. If it moved, `git rebase origin/main` on
  the integration branch usually resolves cleanly.
- The GitHub CLI (`gh`) may be installed portably outside `PATH` in this environment
  (`%LOCALAPPDATA%\GitHubCLI\bin` on Windows) rather than via the system installer — check before
  assuming it's missing. Pushing anything under `.github/workflows/` needs a token with the
  `workflow` scope (`gh auth refresh -h github.com -s workflow` if a push is rejected for that
  reason).

## Commands

Backend and frontend are independent npm projects; there is no root `package.json`.

```bash
# Backend
cd backend
npm run dev              # ts-node-dev, respawns on change, port 4000 (needs backend/.env — see below)
npm run build             # tsc -> dist/
npm test                  # build + run every backend/test-*.cjs (see Testing below)
node run-tests.cjs         # same, without rebuilding first
node <test-file>.cjs       # run one test directly (after `npm run build`; needs the same env vars run-tests.cjs sets — see below)

# Frontend
cd frontend
npm run dev               # vite, port 5173, proxies /api to localhost:4000
npm run build             # tsc && vite build (typechecks backend/src/seo too — see gotcha below)
```

**Local `.env`**: `backend/.env` is required and gitignored; `backend/.env.example` documents every
variable. The server refuses to start without `JWT_SECRET` and `ZEMDA_FILES_SIGNING_SECRET` (no
insecure fallback — by design, see Security below). Set `SEED_DEMO_DATA=true` and
`R2_MOCK_STORAGE=true` for local dev to get a seeded demo clinic (login `diretoria@viverbem.com` /
`123456`) and mocked file storage.

**Frontend build needs backend deps installed first**: `frontend/tsconfig.json` also typechecks
`../backend/src/seo` (used by `vite.config.ts` for SEO), and one of those files imports `express`.
A clean checkout must run `npm ci` in `backend/` before `npm run build` in `frontend/`, or the
build fails with "Cannot find module 'express'" — this bit CI once already (`.github/workflows/ci.yml`
installs backend deps in the frontend job specifically for this reason).

## Testing

Backend tests are ~40 standalone scripts (`backend/test-*.cjs`), not a test framework — each boots
a real Express app against a temp SQLite file and hits it with `fetch`. `backend/run-tests.cjs` runs
them all in isolated child processes and prints a summary.

- **`KNOWN_FAILING`** at the top of `run-tests.cjs` lists tests that were already broken by schema
  drift, seed-data changes, or business-rule changes on `main` before CI existed — not by your
  change. `run-tests.cjs` exits 0 as long as no failure appears *outside* that list. If your work
  introduces a new failure, fix it; if you run the suite after pulling upstream commits and see a
  *new* unrelated failure, investigate before assuming it's yours — the other developer's commits
  do sometimes introduce real regressions or break a test's literal-string assertion (some tests
  `fs.readFileSync` a frontend source file and `assert(content.includes('exact string'))` — a
  legitimate refactor can break these; fix the assertion, don't revert the refactor).
- When you fix a `KNOWN_FAILING` entry, remove it from the map. When you touch something a test
  depends on and don't intend to fix it, don't add new entries speculatively — only genuinely
  broken-by-drift tests belong there, confirmed by running that one test in isolation first.
- New backend test: follow the existing style (temp `DATABASE_PATH`, `require('./dist/...')` — so
  `npm run build` first — real routes via `app.use('/api', require('./dist/routes').default)`,
  `fetch` with header `Connection: close`). On Windows, end with
  `server.closeAllConnections(); server.close();` and set `process.exitCode = 1` on failure instead
  of calling `process.exit()` — calling it with sockets still open crashes with a libuv assertion.
- Prove a new/fixed test actually detects the bug: stash just the source fix
  (`git stash push -u -m "<unique>"`, since the stash is shared across worktrees/sessions — never
  bare `stash pop`), rebuild, confirm the test fails, then `git stash apply <sha>` + drop it back.
- Frontend has no test suite; verify UI changes by running the dev server and checking behavior
  directly (or the Playwright/browser-driven pattern if available in your environment).

## Architecture notes (the parts that take reading several files to piece together)

- **`node:sqlite` is fully synchronous** (`backend/src/config/database.ts`, class `SafeDatabase`).
  ~1,700 queries across the codebase assume this. `db.transaction(fn)` is `BEGIN IMMEDIATE` → `fn()`
  → `COMMIT`, executed synchronously — **`fn` must never be `async`**: an async callback returns a
  Promise immediately, so the wrapper commits before any of the callback's awaited work runs, and
  everything after the first `await` executes outside the transaction with no rollback (this
  exact bug existed in production in free-trial activation; the wrapper now throws if `fn` returns
  a thenable, but do all async work — hashing, external calls — *before* opening the transaction).
- **Schema evolves through ~250 idempotent `addColIfMissing('table', 'col', 'TYPE')` calls** in
  `initializeDatabase()`, run in order on every boot, not through numbered migration files. There
  is no schema version table. **Order matters**: a column added before its table's `CREATE TABLE`
  statement runs is silently a no-op (`tableColumns()` returns `[]` for a table that doesn't exist
  yet) — this caused patient-consent creation to be broken for the table's entire lifetime,
  undetected, because nothing failed loudly. When adding a column, add the call *after* the
  `CREATE TABLE IF NOT EXISTS` for that table, not just anywhere convenient.
- **Tenant isolation is enforced per-query, not by the database.** Every table holding
  clinic-scoped data has a `tenant_id` column; every read/write in a controller must filter by it
  explicitly (`tenant.middleware.ts` only checks the `X-Tenant-ID` header against the JWT, it
  doesn't scope queries for you). There's no row-level security net — a missing `AND tenant_id = ?`
  is a cross-tenant data leak, not a query error.
- **RBAC is route-level (`requireRole(...)` in `backend/src/routes/index.ts`) plus, for clinical
  data specifically, an additional `hasClinicalAccess(req, patientId)` check inside the controller**
  (`clinical.controller.ts`) that also excludes `superadmin` from clinical content (LGPD sigilo —
  the platform's own admins shouldn't read patient records). When adding a new patient-data
  endpoint, check whether it needs both layers, not just a role check — file attachments were
  missing the second layer entirely for a long time (recepção could download/delete clinical
  exams) before this was caught.
- **Sessions**: JWTs embed both a per-tenant `sessionVersion` (bumped only when the superadmin
  suspends a clinic — invalidates everyone in it) and a per-user `userSessionVersion`
  (`users.session_version`, bumped when that user's own password changes — invalidates only their
  own other sessions). Don't conflate the two; reusing the tenant-level one for a user-level
  invalidation logs out the wrong set of people.
- **Frontend routing is one big `App.tsx` switch, not a router library** — every screen is
  `lazyWithRetry(() => import(...))` (a `React.lazy` wrapper in `utils/lazyWithRetry.ts` that
  recovers from stale-chunk errors after a deploy via `utils/chunkRecovery.ts`). There's a single
  bundled `global.css` (Tailwind), not per-route CSS, so route transitions don't have a CSS-loading
  race — if you're chasing a styling flash, look at server-side HTML injection instead (next point).
- **The backend pre-renders public pages for SEO/crawlers** (`backend/src/seo/preRender.ts`,
  wired into `registerPublicSite()`) by injecting plain unstyled semantic HTML straight into
  `<div id="root">` before serving `index.html`. Because the app mounts with
  `ReactDOM.createRoot` (a full client render, not `hydrateRoot`), that injected markup is real DOM
  content a real browser paints, not just something bots see — it must stay wrapped in the
  visually-hidden container `preRender.ts` uses (off-screen + `clip:rect(0,0,0,0)`), or it flashes
  on screen for every visitor until React replaces it. If you edit that file, keep the wrapper.
- **`docker-compose.yml` / `Dockerfile`** build the frontend and backend into one image; the SPA is
  served by the same Express process that serves the API (`registerPublicSite`), not a separate
  static host.

## Security & compliance posture (don't relitigate — extend)

The backend fails fast (refuses to boot) rather than falling back to an insecure default for
`JWT_SECRET` / `ZEMDA_FILES_SIGNING_SECRET` — this is intentional hardening, not an oversight to
"fix" by adding a default back. `SEED_DEMO_DATA` gates all demo/fixture accounts (password `123456`)
behind an explicit opt-in — never make that the default. See `docs/LGPD-CHECKLIST.md` for the
current, evidence-based (file:line) LGPD compliance status before touching anything that reads or
transmits patient data (especially the AI assistant paths — patient identifiers are deliberately
stripped before anything is sent to Google Gemini, see `backend/src/utils/ai-privacy.ts`).

## Working conventions specific to this project

- Owner communicates in pt-BR; keep commit-adjacent user-facing text (docs, UI strings, code
  comments explaining *why*) in pt-BR to match the existing codebase. Tool/process output back to
  the user can be pt-BR too.
- After pushing to `main` on explicit request, don't keep polling CI/Railway status unless asked —
  "sobe e não precisa monitorar" means push and stop; report back only if asked or if something is
  clearly wrong before you push.
- When a subagent reports a branch as done and tested, **review the actual diff yourself and rerun
  the test suite in that worktree before treating it as accepted** — subagents in this project have
  produced correct-looking work that had real bugs their own tests didn't catch (a backend response
  changed shape and the frontend caller wasn't updated to match; a SQL migration was fixed but a
  sibling query wasn't updated to the new column names). Rerunning the full suite once more after
  integrating multiple branches together (not just per-branch) has also caught interaction bugs a
  single branch's tests couldn't see.

## Where else to look

- `docs/BACKUP.md` — encrypted DB backup to Cloudflare R2, restore procedure.
- `docs/MONITORAMENTO.md` — production error alerting (email via Resend).
- `docs/INCIDENTE.md` — security incident response runbook.
- `docs/INSTALADORES.md` — how Windows/Android installers are published (GitHub Releases, not git).
- `docs/ANALISE-POSTGRES.md` — why this project stays on SQLite for now, and the concrete triggers
  for when to reconsider Postgres.
- `docs/LGPD-CHECKLIST.md` — compliance status per LGPD article, with code evidence and priority.

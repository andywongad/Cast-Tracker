# Cast Tracker

Mobile-first web app for tracking drama/reality show cast members while you watch.
React SPA, local-first, with optional accounts and cross-device sync.

## Stack

- **React 18 + Vite 5 + TypeScript 5** — plain SPA, no framework/router. Screens are
  swapped by state in `src/App.tsx`; sheets are the primary navigation idiom (`Sheet.tsx`).
- **localStorage is the source of truth** (`src/lib/storage.ts`, keys `ct.v2`,
  `ct.settings.v1`, `ct.shares.v1`, `ct.recent.v1`). The app is fully usable with no account.
- **Supabase** — auth (magic link) and the sync backend. `supabase/migrations/`.
- **Vercel** — `api/*.ts` serverless functions, `@vercel/kv` for the enrichment cache,
  daily cron (`vercel.json`) hitting `/api/check-episodes` at 06:00 UTC.
- **TMDb + TVmaze** for show/cast data, `web-push` for episode notifications,
  `@anthropic-ai/sdk` for cast enrichment (`api/_lib/generate.ts`).

## Commands

```bash
npm run dev                              # vite dev server
npm run build                            # tsc -b && vite build  -- typechecks src/ ONLY
npx tsc -p tsconfig.api.json --noEmit    # typechecks api/  -- NOT covered by npm run build
npm test                                 # 4 suites: sync, dupes, share, auth
```

CI (`.github/workflows/ci.yml`) runs all three on Node 24. Run the `api/` typecheck yourself
after touching `api/` — the build will happily pass while a function is broken.

## Conventions that are easy to get wrong

**Tests have no runner.** No Vitest, no Jest. Each `src/lib/*.test.ts` is a standalone script
bundled through esbuild and executed by node, asserting inline and exiting non-zero on failure.
Don't introduce `describe`/`it` — write plain asserts and add the suite to the `test` script.
New suites need `--define:import.meta.env={}` if they transitively pull in a Vite env access.

**Two tsconfigs, two module systems.** `src/` uses `moduleResolution: bundler`. `api/` uses
`NodeNext`, so **every relative import in `api/` needs an explicit `.js` extension** — including
imports reaching into `src/`. Omitting it typechecks under bundler resolution and then 500s at
runtime with `ERR_MODULE_NOT_FOUND`. This already shipped broken once; see the comment in
`tsconfig.api.json`.

**`VITE_` prefix means "public".** Vite inlines those into the client bundle. `TMDB_API_KEY`
exists unprefixed alongside `VITE_TMDB_API_KEY` specifically so the server copy never reaches
the browser. Never put a secret behind a `VITE_` name.

**Two auth modules, on purpose.** `src/lib/auth.ts` is a backend-free seam gated by
`VITE_ENABLE_AUTH_PREVIEW`; `src/lib/authSupabase.ts` is the real implementation. Both are
magic-link shaped — there is deliberately no password field anywhere. Keep that shape.

**Sync conflict rule** is per-record last-write-wins on `editedAt`, and what gets pushed is
filtered by `isDisposable`, *not* `hasUserContent`. The distinction is load-bearing and the
reasoning is in the header comment of `src/lib/sync.ts` — read it before changing either.

## Notes

- The code carries unusually detailed header comments explaining *why* things are the way they
  are. Read the header of a file before changing it; most of the traps are already documented.
- `README.md` is stale in one respect: it describes the app as having "no account or backend",
  which predates Supabase auth, sync, the `api/` functions, and notifications.

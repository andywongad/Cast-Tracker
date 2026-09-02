# Cast Tracker

A mobile-first web app for tracking drama and reality show cast members while you watch — implemented from the `Cast Tracker.dc.html` Claude Design prototype and its chat history.

Local-first: everything works on one device with no account. Signing in is optional and adds cross-device sync.

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL on your phone (same wifi) or shrink your browser window to ~400px wide to preview the mobile layout.

### API keys (none needed locally)

No key has to exist on your machine. Every TMDb call goes through `/api/tmdb`, which holds the key server-side, and `npm run dev` proxies `/api` to the deployed origin (`vite.config.ts`; set `API_PROXY_TARGET` to point it at a preview deployment instead). Show/cast search, photo autofill, name predictions and "add all cast from this episode" therefore work locally with no `.env.local` at all.

The keys live in the Vercel dashboard: `TMDB_API_KEY` — unprefixed, so Vite can never inline it into the client bundle — plus the Supabase, web-push and Anthropic values from `.env.example` behind sync, notifications and character bios. Missing values degrade the app to the no-account experience rather than breaking it.

Copy `.env.example` to `.env.local` only when you need to point local development at your own Supabase project or your own TMDb key: https://www.themoviedb.org/settings/api

### Build

```bash
npm run build                            # typechecks src/ and outputs the client to dist/
npx tsc -p tsconfig.api.json --noEmit    # typechecks api/ — NOT covered by npm run build
npm test                                 # ten suites: sync, duplicates, share links, sign-in,
                                         # recaps, air times, cast value, relationships, tree layout
```

CI runs all three on every push and PR (`.github/workflows/ci.yml`).

The client in `dist/` is static, but `api/` holds Vercel serverless functions and `vercel.json` declares a cron, so a full deploy needs Vercel (or an equivalent that can run both). A static-only host gets the app minus sync, notifications and character bios.

## What's here

Home (show library, search, TMDb add), per-show cast grid (2–3 columns) and detail sheets, add/edit cast with photo upload+crop, character "versions" (young/teen alternates with their own actor/photo), relationships between cast members, a relationship map that is two tools in one — a dating board for reality shows (drag to connect, mutual interest merges into a heart) and a family tree for scripted ones (each link named, "Tidy the tree" stacks each family by generation and moves anyone with no relatives to the bottom) — AI-written "Previously" recaps and character bios, new-episode alerts with a chosen lead time and where-to-watch listings, shareable links, footer currency converter + translator, and light/dark theme with adjustable grid density.

Your library lives in `localStorage` on your device and stays there unless you sign in. With an account (magic link, no passwords) it also syncs across devices, last-write-wins per record, and you can ask to be told before a new episode of a show you follow airs — at the time of the episode, or up to four weeks ahead.

## Differences from the design prototype

The prototype (`project/Cast Tracker.dc.html`) ran inside Claude Design's sandbox, which provided things a real deployed app doesn't have — this build adapts around that:

- **Translate** now calls the free [MyMemory](https://mymemory.translated.net/) translation API (no key needed, ~5k words/day). The prototype used the design sandbox's built-in AI; MyMemory's quality/rate limits are lower — swap in DeepL/Google Translate if you outgrow it.
- **AI features** were originally left out with the sandbox's built-in AI. They came back server-side: character bios are generated through `api/enrichment.ts` and cached in Vercel KV, once per character when its detail sheet opens. Recaps came back the same way: `api/recap.ts` writes a "previously on" paragraph from TMDb's episode overviews for the episodes you have already watched, and stops there — the source is cut at your episode before the model ever sees it, so the recap cannot spoil what you have not reached. Both are cached per key and shared by every reader who lands on the same one, so a generation is paid for once rather than once per user.
- **Currency conversion** uses live rates from the free [open.er-api.com](https://www.open.er-api.com) (no key), falling back to the prototype's static rate table if that's unreachable. Inflation math reuses the prototype's historical US CPI table.
- **Free/Paid plan gating** from the prototype (a mocked-up monetization experiment) isn't in this build — autofill-by-episode is simply always available, since there's no real billing system here.
- **Sharing** started as the prototype's six-character code, which only ever worked in the browser that generated it. It is now a link that carries its own payload, so it works for anyone — only authored fields travel, since auto-loaded cast regenerates from TMDb on the recipient's device.
- The relationship map's node-placement math (grid capacity, drag/snap behavior) is a faithful re-implementation of the described behavior rather than a line-for-line port of the prototype's tuned constants — some spacing may look/feel slightly different at extreme cast sizes. The prototype's gender-split layout survives on the dating board only; scripted shows get generational bands instead, which the prototype had no equivalent for.
- The app renders as a normal responsive mobile web page rather than inside a simulated iOS device frame (status bar, home indicator) — that frame was a prototype-viewing aid, not part of the product.

## Project structure

```
src/
  types.ts             data model (Show, CastMember, CastVersion, MapRelationship, ...)
  lib/                 storage, sync, auth, TMDb/TVmaze clients, share links,
                       currency, translation, notifications, theme, utils
  lib/relationshipEdges.ts  what the map draws: which links merge, which get an arrow
  lib/familyLayout.ts  "Tidy the tree" — families into bands, generations into rows
  lib/recap/           the reader's side of recaps, and the episode window that
                       decides what a recap is allowed to have seen
  lib/*.test.ts        standalone test scripts — no framework, run via npm test
  hooks/useStore.tsx   persisted app data + actions
  hooks/useSync.tsx    cross-device sync lifecycle
  hooks/useAuth.tsx    session state
  hooks/useUI.tsx      ephemeral navigation/sheet state
  components/          one file per screen/sheet
api/
  tmdb.ts, tvmaze.ts   server-side proxies that keep API keys off the client
  _lib/schedule.ts     episode air times, from TVmaze with a TMDb fallback
  enrichment.ts        AI character bios, cached in Vercel KV
  recap.ts             AI "previously on" recaps, keyed on the episode you
                       have reached so one generation serves every reader
  next-episode.ts      when the next episode of a show airs
  check-episodes.ts    cron; sends push at each follower's chosen lead time
  subscribe.ts,
  unsubscribe.ts       push notification subscriptions
  _lib/store-kv.ts     the only file that knows where generated text lives
demo/
  README.md            the manual test script, and the seed to run it against
supabase/
  migrations/          sync tables and grants
  templates/           magic-link + confirmation emails
```

See `CLAUDE.md` for the conventions that are easy to get wrong (the two tsconfigs, the
extensionless-import trap in `api/`, and how the tests are wired).

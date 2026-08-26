# Cast Tracker

A mobile-first web app for tracking drama and reality show cast members while you watch — implemented from the `Cast Tracker.dc.html` Claude Design prototype and its chat history.

Local-first: everything works on one device with no account. Signing in is optional and adds cross-device sync.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste in your TMDb key (optional but recommended)
npm run dev
```

Open the printed local URL on your phone (same wifi) or shrink your browser window to ~400px wide to preview the mobile layout.

### TMDb API key (optional)

Show/cast search, photo autofill, name predictions, and "add all cast from this episode" all require a free personal TMDb API key: https://www.themoviedb.org/settings/api

Put it in `.env.local` as `VITE_TMDB_API_KEY=...`. Without a key, everything still works — you just enter shows/cast manually instead of searching.

The account-backed features (sync, notifications, character bios) additionally need the Supabase, web-push and Anthropic values from `.env.example` set in the Vercel dashboard. Without them the app degrades to the no-account experience rather than breaking.

### Build

```bash
npm run build                            # typechecks src/ and outputs the client to dist/
npx tsc -p tsconfig.api.json --noEmit    # typechecks api/ — NOT covered by npm run build
npm test                                 # merge rules, duplicate shows, share links, sign-in copy
```

CI runs all three on every push and PR (`.github/workflows/ci.yml`).

The client in `dist/` is static, but `api/` holds Vercel serverless functions and `vercel.json` declares a daily cron, so a full deploy needs Vercel (or an equivalent that can run both). A static-only host gets the app minus sync, notifications and character bios.

## What's here

Home (show library, search, TMDb add), per-show cast grid (2–3 columns) and detail sheets, add/edit cast with photo upload+crop, character "versions" (young/teen alternates with their own actor/photo), relationships between cast members, a reality-show relationship map (drag to connect, tap-and-hold to reposition, mutual connections merge into a heart), "Previously" episode/season recaps, AI-written character bios, shareable links, footer currency converter + translator, and light/dark theme with adjustable grid density.

Your library lives in `localStorage` on your device and stays there unless you sign in. With an account (magic link, no passwords) it also syncs across devices, last-write-wins per record, and you can opt into a daily push notification when a show you follow airs a new episode.

## Differences from the design prototype

The prototype (`project/Cast Tracker.dc.html`) ran inside Claude Design's sandbox, which provided things a real deployed app doesn't have — this build adapts around that:

- **Translate** now calls the free [MyMemory](https://mymemory.translated.net/) translation API (no key needed, ~5k words/day). The prototype used the design sandbox's built-in AI; MyMemory's quality/rate limits are lower — swap in DeepL/Google Translate if you outgrow it.
- **AI features** were originally left out with the sandbox's built-in AI. They came back server-side: character bios are generated through `api/enrichment.ts` and cached in Vercel KV, once per character when its detail sheet opens. The recap is TMDb-sourced rather than AI-written — it shows what happened *before* the episode you're on, with the season summary underneath when an overview is too thin to be useful.
- **Currency conversion** uses live rates from the free [open.er-api.com](https://www.open.er-api.com) (no key), falling back to the prototype's static rate table if that's unreachable. Inflation math reuses the prototype's historical US CPI table.
- **Free/Paid plan gating** from the prototype (a mocked-up monetization experiment) isn't in this build — autofill-by-episode is just available whenever a TMDb key is set, since there's no real billing system here.
- **Sharing** started as the prototype's six-character code, which only ever worked in the browser that generated it. It is now a link that carries its own payload, so it works for anyone — only authored fields travel, since auto-loaded cast regenerates from TMDb on the recipient's device.
- The relationship map's node-placement math (grid capacity, gender-split default layout, drag/snap behavior) is a faithful re-implementation of the described behavior rather than a line-for-line port of the prototype's tuned constants — some spacing may look/feel slightly different at extreme cast sizes.
- The app renders as a normal responsive mobile web page rather than inside a simulated iOS device frame (status bar, home indicator) — that frame was a prototype-viewing aid, not part of the product.

## Project structure

```
src/
  types.ts             data model (Show, CastMember, CastVersion, Relationship, ...)
  lib/                 storage, sync, auth, TMDb/TVmaze clients, share links,
                       currency, translation, notifications, theme, utils
  lib/*.test.ts        standalone test scripts — no framework, run via npm test
  hooks/useStore.tsx   persisted app data + actions
  hooks/useSync.tsx    cross-device sync lifecycle
  hooks/useAuth.tsx    session state
  hooks/useUI.tsx      ephemeral navigation/sheet state
  components/          one file per screen/sheet
api/
  tmdb.ts, tvmaze.ts   server-side proxies that keep API keys off the client
  enrichment.ts        AI character bios, cached in Vercel KV
  check-episodes.ts    daily cron; sends push for new episodes
  subscribe.ts,
  unsubscribe.ts       push notification subscriptions
supabase/
  migrations/          sync tables and grants
  templates/           magic-link + confirmation emails
```

See `CLAUDE.md` for the conventions that are easy to get wrong (the two tsconfigs, the
extensionless-import trap in `api/`, and how the tests are wired).

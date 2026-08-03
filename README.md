# Cast Tracker

A mobile-first web app for tracking drama and reality show cast members while you watch — implemented from the `Cast Tracker.dc.html` Claude Design prototype and its chat history.

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

### Build

```bash
npm run build   # outputs to dist/, deploy anywhere static (Vercel, Netlify, Cloudflare Pages, etc.)
```

## What's here

Home (show library, search, TMDb add), per-show cast grid (2–3 columns) and detail sheets, add/edit cast with photo upload+crop, character "versions" (young/teen alternates with their own actor/photo), relationships between cast members, a reality-show relationship map (drag to connect, tap-and-hold to reposition, mutual connections merge into a heart), share/redeem codes, footer currency converter + translator, and light/dark theme with adjustable grid density — all persisted to `localStorage` on your device, no account or backend.

## Differences from the design prototype

The prototype (`project/Cast Tracker.dc.html`) ran inside Claude Design's sandbox, which provided things a real deployed app doesn't have — this build adapts around that:

- **Translate** now calls the free [MyMemory](https://mymemory.translated.net/) translation API (no key needed, ~5k words/day). The prototype used the design sandbox's built-in AI; MyMemory's quality/rate limits are lower — swap in DeepL/Google Translate if you outgrow it.
- **"Who am I so far?"** (the AI character recap) is left out entirely, per your instruction — it also depended on the sandbox's AI and was already hidden in the source you handed off.
- **Currency conversion** uses live rates from the free [open.er-api.com](https://www.open.er-api.com) (no key), falling back to the prototype's static rate table if that's unreachable. Inflation math reuses the prototype's historical US CPI table.
- **Free/Paid plan gating** from the prototype (a mocked-up monetization experiment) isn't in this build — autofill-by-episode is just available whenever a TMDb key is set, since there's no real billing system here.
- **Sharing** generates a code and QR like the prototype, but redemption only works within the same browser's storage — the prototype's "share to another device" flow was already a local simulation (noted explicitly in your chats), and making it real needs a backend, which you said you'd stand up separately.
- The relationship map's node-placement math (grid capacity, gender-split default layout, drag/snap behavior) is a faithful re-implementation of the described behavior rather than a line-for-line port of the prototype's tuned constants — some spacing may look/feel slightly different at extreme cast sizes.
- The app renders as a normal responsive mobile web page rather than inside a simulated iOS device frame (status bar, home indicator) — that frame was a prototype-viewing aid, not part of the product.

## Project structure

```
src/
  types.ts            data model (Show, CastMember, CastVersion, Relationship, ...)
  lib/                 storage, TMDb client, currency, translation, theme, utils
  hooks/useStore.tsx    persisted app data + actions
  hooks/useUI.tsx       ephemeral navigation/sheet state
  components/           one file per screen/sheet
```

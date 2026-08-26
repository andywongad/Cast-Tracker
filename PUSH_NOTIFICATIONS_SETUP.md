# Push Notifications Setup

When a show you follow airs a new episode, a daily job pushes a notification to the browsers
that asked about that show.

There is **no Firebase here.** This is standard Web Push: VAPID keys, the `web-push` library,
and whatever push service the visitor's browser already uses. Nothing to sign up for.

## How it works

1. Beside a show's title, an orange bell — struck through when off, ringing when on. It appears
   only for shows that can still deliver an episode: TMDb must have a `next_episode_to_air` or a
   production status of `Returning Series` / `In Production` / `Planned`. A finished show gets no
   bell, because the control could only ever do nothing.
2. Tapping it opens a card that asks how far ahead to be told — at the time of the episode, 30
   minutes, an hour, a day, or a custom number of minutes/hours/days up to four weeks. Turning it
   on asks the browser for permission and registers `public/service-worker.js`.
3. `POST /api/subscribe` records the `PushSubscription` against that show's TMDb id **and the
   chosen lead time**, in Vercel KV (`api/_lib/subscriptions.ts`). Both directions are stored —
   subscriber→shows and show→subscribers — because unsubscribing walks one way and the cron walks
   the other. The lead lives at `lead:{endpoint}:{tmdbId}`, per person per show: the useful warning
   for a weekly drama and a live final are different numbers.
4. `GET /api/check-episodes` runs **every fifteen minutes** (`vercel.json`). For each followed show
   it resolves the air times of the next and previous episodes through TVmaze, whose `airstamp` is
   a real timestamp with an offset (`api/_lib/schedule.ts`).
5. The send decision is **per recipient**, not per show: an episode is due for someone when
   `now >= airsAt - lead` and `now <= airsAt + 2 days`. Two people following the same show at
   different lead times get told at different moments, from the same pair of episodes.
6. `web-push` sends it. The wording follows the clock — "Reacher airs in 30 minutes" before,
   "New episode of Reacher" after. The service worker tags by show id so a second notification for
   the same show replaces the first rather than stacking.

### Where the times come from

TVmaze is the source, and the id chain to reach it is TMDb external ids → TVmaze lookup
(`api/_lib/tvmaze-id.ts`, shared with the cast route so the fallback's guard can't drift). The
resolved id is cached in KV for 30 days; a show TVmaze doesn't have is remembered as a miss for a
day rather than re-resolved every run.

Shows TVmaze doesn't carry fall back to TMDb's `air_date` — a date, read as midnight UTC, marked
inexact so nothing claims a precision it doesn't have. Those get day-level wording ("airs today")
instead of a countdown.

### On cron frequency

Nothing in the job assumes fifteen minutes. A run sends everything whose moment has passed and has
not been sent, so a coarser schedule makes notifications **late rather than wrong**. That matters
because **Vercel's Hobby plan fires cron once a day** whatever the expression says — on Hobby this
degrades to roughly the behaviour it replaced. Accuracy is bounded by the interval; correctness is
not.

## Setup

### 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Keep both. The public key is used twice — the browser needs it to subscribe, and the server needs
it to sign what it sends.

### 2. Set environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | client | Lets the browser subscribe. **Unset = the whole feature stays hidden** (`PUSH_CONFIGURED` in `src/lib/notifications.ts`). |
| `VAPID_PUBLIC_KEY` | server | Same value, unprefixed so it isn't inlined into the bundle. |
| `VAPID_PRIVATE_KEY` | server | Signs the push. Never expose this one. |
| `VAPID_SUBJECT` | server | Optional contact URL. Defaults to `mailto:hello@casttracker.app`. |
| `CRON_SECRET` | server | Bearer token guarding `/api/check-episodes`. |
| `TMDB_API_KEY` | server | Used to look up the latest episode. |

Locally these go in `.env.local`; in production, Vercel dashboard → Settings → Environment Variables.
Vercel sends `CRON_SECRET` as the bearer token on its own cron invocations automatically.

`CRON_SECRET` unset means the endpoint returns 401 to everyone, including Vercel — it fails closed
rather than open. Missing TMDb or VAPID config returns 503 with a line in the function log.

### 3. Enable Vercel KV

Vercel dashboard → Storage → Create → KV. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
itself; you don't set those by hand. The same KV instance also holds the character-bio cache.

Dependencies (`web-push`, `@vercel/kv`, `@vercel/node`) are already in `package.json` — nothing to
install.

## Testing locally

Subscribing works locally: service workers are allowed on `localhost` without HTTPS. The cron does
not run locally, but you can invoke it directly:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/check-episodes
```

It replies with a tally — `{ shows, withNewEpisode, sent, skipped, gone, failed }` — which is the
fastest way to tell "nothing aired" apart from "nothing was delivered".

Note that `npm run dev` is Vite only and does not serve `api/`. Use `vercel dev` to exercise the
functions locally.

## Troubleshooting

**The notification toggle isn't there at all** — `VITE_VAPID_PUBLIC_KEY` is unset at *build* time.
It's a client variable, so setting it in Vercel requires a redeploy, not just a save.

**401 from `/api/check-episodes`** — `CRON_SECRET` is unset, or the value in the request doesn't
match the deployment's.

**503 "Push is not configured"** — `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is missing on the
server. The client-side `VITE_` copy alone isn't enough.

**Tally shows `sent` but nothing arrives** — the push reached the browser's push service and it
decided what to do. Check the OS-level notification permission, and that the browser isn't in a
focus mode.

**Tally shows `gone`** — those subscriptions returned 404/410 and were dropped. Normal; browsers
expire them. The subscriber just re-enables the toggle.

**Everything is `skipped`** — already delivered. Idempotency is per recipient per episode
(`sent:{tmdbId}:{epId}`, 14-day TTL), so re-running the job never re-notifies.

## Customizing

- **Schedule** — `vercel.json`. Currently `*/15 * * * *`, with `maxDuration: 300`. See the note on
  cron frequency above before changing it.
- **How long after airing an episode is still worth mentioning** — `GRACE_MS` in
  `api/check-episodes.ts`. Two days. It has to be wider than the gap between runs, or a missed
  moment is missed forever; being generous is safe because delivery is recorded per recipient.
- **The lead-time presets** — `LEAD_PRESETS` in `src/lib/episodeAlerts.ts`, with `MAX_LEAD_MINUTES`
  bounding the custom field. The server clamps to the same range in `api/subscribe.ts`.
- **How many shows are checked at once** — `CONCURRENCY` in `api/check-episodes.ts`. TVmaze's
  ~20 calls / 10s is the binding limit, not TMDb's.
- **Notification text** — `notifyOne()` and `whenWords()` in `api/check-episodes.ts`. The payload is
  deliberately flat: `title`, `body`, `showId`, `url`, which is the shape
  `public/service-worker.js` reads. Nesting it under `data` leaves `tag` undefined and
  notifications stop replacing each other.
- **Icon and badge** — `/cast-tracker-icon.png` and `/cast-tracker-badge.png` in `public/`.

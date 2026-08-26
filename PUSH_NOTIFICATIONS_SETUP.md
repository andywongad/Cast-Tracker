# Push Notifications Setup

When a show you follow airs a new episode, a daily job pushes a notification to the browsers
that asked about that show.

There is **no Firebase here.** This is standard Web Push: VAPID keys, the `web-push` library,
and whatever push service the visitor's browser already uses. Nothing to sign up for.

## How it works

1. In a show's menu, "Notify me about new episodes" asks the browser for permission and
   registers `public/service-worker.js`.
2. `POST /api/subscribe` records the `PushSubscription` against that show's TMDb id, in Vercel KV
   (`api/_lib/subscriptions.ts`). Both directions are stored — subscriber→shows and show→subscribers —
   because unsubscribing walks one way and the cron walks the other.
3. `GET /api/check-episodes` runs daily at 06:00 UTC (`vercel.json`). For each followed show it
   makes one TMDb request and looks at `last_episode_to_air`.
4. An episode counts if it aired in the **last two days**, not "today" — TMDb's `air_date` is the
   broadcaster's local date, so a UTC "today" would miss last night in LA and this evening in Seoul.
   Widening the window is safe because delivery is recorded per recipient, so nobody gets told twice.
5. `web-push` sends the notification. The service worker shows it, tagged by show id so a second
   notification for the same show replaces the first rather than stacking.

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

- **Schedule** — `vercel.json`. Currently `0 6 * * *`, with `maxDuration: 300`.
- **What counts as recent** — `RECENT_DAYS` in `api/check-episodes.ts`.
- **How many shows are checked at once** — `CONCURRENCY`, same file.
- **Notification text** — `notifyOne()` in `api/check-episodes.ts`. The payload is deliberately
  flat: `title`, `body`, `showId`, `url`, which is the shape `public/service-worker.js` reads.
  Nesting it under `data` leaves `tag` undefined and notifications stop replacing each other.
- **Icon and badge** — `/cast-tracker-icon.png` and `/cast-tracker-badge.png` in `public/`.

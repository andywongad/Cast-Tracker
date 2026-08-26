# Demo library and manual test script

Two things live here: a known-good library to load before a testing session, and the script to run
against it. Both exist so a session starts from the same place every time — a tester dropped into
an empty app spends the first ten minutes building a library instead of using one, and no two
sessions are comparable afterwards.

## The seed

`cast-tracker-demo-library.json` — a Cast Tracker backup file, importable through Settings.

| Show | Type | Section | Records |
|---|---|---|---|
| Single's Inferno | Reality | Currently watching | 8 contestants, gendered, no relationships yet |
| The Bear | Drama | Currently watching | 6 characters with nicknames, notes and relationships |
| BEEF | Drama | Completed | 2 characters |

16 records, all of them "kept" (none are auto-loaded throwaways), so the backup nudge and the
record counts behave as they would for a real user. Names, photos and TMDb ids are real, pulled
from TMDb, so photos load and the ids match what the app would fetch on its own.

Two deliberate omissions: the relationship map starts empty, because drawing a link is a test step;
and the notes on the reality show say nothing about the people in it beyond the role TMDb credits
them in.

### Loading it

Settings (gear, top right) → **Import**, pick the file. You will be asked to confirm twice — once
offering a backup of what's already there (only if the device holds records), once to confirm the
replacement. Import **replaces** the library; it does not merge.

To get back to a blank device: Settings → **Reset to blank state**. Note that while signed in,
reset is followed by sync pulling the server's copy straight back — sign out first if you want the
device to stay empty.

## Manual test script

Runs in about 15 minutes. Do it on the deployed site — **https://casttracker.app** — not a local
dev server, unless you are
specifically testing a change. `npm run dev` proxies `/api/*` to production, so TMDb search does
work locally, but nothing else about local matches what a tester sees.

**Before each session:** reset to blank, import the seed, and confirm the home screen shows two
shows under Currently watching and one under Completed.

### 1. The library
1. Home screen — Currently watching holds Single's Inferno and The Bear; Completed holds BEEF.
2. Tap The Bear. The cast grid shows 6 people with photos.
3. Switch the grid density (the control in the top bar). Cards reflow, photos stay framed.

### 2. A character
4. Open Carmy. Expect the nickname, the "who they are" line, notes, and three relationships.
5. Edit the notes, close the sheet, reopen it. The edit is there.
6. Reload the page. The edit is still there. *(This is the localStorage write path — if an edit
   ever disappears here, stop and capture the console.)*
7. Reframe a photo: tap the image, drag and zoom, save. Reopen the cropper — it resumes where you
   left it rather than resetting.

### 3. The relationship map
8. Open Single's Inferno → the map. Eight people, laid out women on one side and men on the other
   (that split comes from the `gender` field being set on every seeded record).
9. Drag from one person to another to create a link. Drag a person to move them.
10. Switch to the next episode. The previous episode's links carry forward as a starting point;
    changing them there does not change the earlier episode.
11. Hide someone from the map, then bring them back from the bottom of the sheet.

### 4. Episodes and auto-loading
12. On The Bear, pick a season and episode from the strip. Cast credited on that episode load in.
13. Show menu (⋯) → "Clear N auto-loaded characters". The seeded six stay; the loaded ones go.
14. Reopen the same episode — they come back. Nothing was lost.

### 5. Status and sharing
15. Show menu → "Mark as completed". The show moves to Completed on the home screen.
16. From Completed, "Move back to Currently watching". It returns.
17. Show menu → "Share this show" generates a code. Redeeming it on another device or browser
    should reproduce the show and its cast.

### 6. Offline
21. Open the app, then turn on airplane mode.
22. Reload. It should open normally, with your library and cast photos intact — everything is on
    the device and the app shell is cached.
23. Search for a new show. It should fail: TMDb is a live call and the app doesn't pretend
    otherwise. Everything already in your library keeps working.
24. Turn airplane mode off. Nothing to do — the next reload picks up any new deploy.

### 7. Backup
25. Settings → Export. A `cast-tracker-backup-<date>.json` file downloads.
26. Settings → Reset to blank state. The library empties.
27. Import the file you just exported. Everything returns, including the notes and relationships.

### 8. Sync across two devices
Working as of 2026-08-25. Sign-in goes through Resend from `noreply@casttracker.app`, at 30 emails
an hour rather than the built-in mailer's two, and the email carries a six-digit code above the
link. **Use the code, not the link** — a link is single-use, so a mail scanner that fetches the
message first spends it, and it only works in the browser that asked for it. The code has neither
constraint, which is what makes this work on a phone.

28. Sign in on device A. The library uploads.
29. Sign in as the same account on device B. The library arrives.
30. Edit the same character's notes differently on each device, B last. Both converge on B's text.
31. Take device A offline, edit there, come back online. A's newer edit wins over the older remote.
32. Delete a character on A. It disappears on B rather than coming back.

### Known gaps to mention to a tester before they find them
- **Notifications work, with one catch on iPhone.** The follow control is in a show's ⋯ menu. On
  iOS, Safari only permits web push for apps added to the Home Screen — tapping the toggle in a
  normal Safari tab fails no matter what the server is doing. Add Cast Tracker to the Home Screen
  first, open it from that icon, then follow a show. Android and desktop have no such rule.
  The nightly job runs at 06:00 UTC and only sends for episodes that aired in the previous two
  days, so a follow won't produce anything until a show you follow actually airs.
- **Sign-in is a code, not just a link.** Tell testers to type the six digits rather than tapping
  the link: a link only works in the browser that requested it, and only once.

## Regenerating the seed

The file is hand-authored and checked in; there is no generator to run. If you edit it, keep the
top-level shape (`app`, `version`, `data.shows`, `settings`, `shares`, `recent`) — `importBackup`
rejects anything whose `app` is not `cast-tracker` or whose `data.shows` is not an array, and
`loadData` silently drops any show it cannot understand rather than failing loudly.

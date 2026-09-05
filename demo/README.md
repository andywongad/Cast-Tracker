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
| Succession | Drama | Currently watching | 11 characters, family already drawn on the map |
| BEEF | Drama | Completed | 2 characters |

27 records, all of them "kept" (none are auto-loaded throwaways), so the backup nudge and the
record counts behave as they would for a real user. Names, photos and TMDb ids are real, pulled
from TMDb, so photos load and the ids match what the app would fetch on its own.

Succession is the exception to the rule below, and the only show that arrives with its map drawn:
two generations of Roys, two people who married or attached themselves in, a relative with no
precise word for it, and two colleagues who are nobody's family. It exists so "Tidy the tree" has
something real to arrange — the button only appears once a board has lines on it, and hand-drawing
a family that size is ten minutes a tester should not spend. Its people are deliberately scattered
across the board in the file, so the tidy has visible work to do.

Two deliberate omissions elsewhere: the relationship map starts empty on every other show, because
drawing a link is a test step; and the notes on the reality show say nothing about the people in it
beyond the role TMDb credits them in.

### Loading it

Settings (gear, top right) → **Import**, pick the file. You will be asked to confirm twice — once
offering a backup of what's already there (only if the device holds records), once to confirm the
replacement. Import **replaces** the library; it does not merge.

To get back to a blank device: Settings → **Reset to blank state**. Note that while signed in,
reset is followed by sync pulling the server's copy straight back — sign out first if you want the
device to stay empty.

## Manual test script

Runs in about 25 minutes. Do it on the deployed site — **https://casttracker.app** — not a local
dev server, unless you are specifically testing a change. `npm run dev` proxies `/api/*` to
production, so TMDb search, bios and recaps work locally, but the service worker, sign-in and
notifications do not match what a tester sees. A preview deployment is no substitute either: the
Supabase and VAPID variables are set on Production only, so a preview URL has no sign-in and no
notification control.

**Before each session:** reset to blank, import the seed, and confirm the home screen shows three
shows under Currently watching and one under Completed.

### 1. The library
1. Home screen — Currently watching holds Single's Inferno and The Bear; Completed holds BEEF.
2. Tap The Bear. The cast grid shows 6 people with photos.
3. Switch the grid density (the control in the top bar). Cards reflow, photos stay framed.

### 2. A character
4. Open Carmy. Expect the nickname, the "who they are" line, notes, and three relationships.
5. Edit the notes. There is no save button: the sheet writes as you type, and the line beside the
   ↶ reads **✓ Saved**. Close it immediately after typing and reopen — the edit is there, because
   closing flushes whatever the two-second timer was still holding.
6. Reload the page. The edit is still there. *(This is the localStorage write path — if an edit
   ever disappears here, stop and capture the console.)*
7. Edit the notes again, then press **↶**. It puts them back as they were when you opened the
   sheet — not as they were one auto-save ago — and then greys itself out. This is the only way
   back from an edit, since there is nothing to cancel any more.
8. Reframe a photo: tap the image, drag and zoom, save. Reopen the cropper — it resumes where you
   left it rather than resetting.

### 3. Bios and recaps
9. Still in Carmy's sheet, find the bio paragraph with **"AI summary of its Wikipedia page"** under
   it. The first open takes a few seconds — it is written server-side from the character's
   Wikipedia page — and every open after that is instant, because the result is cached. "Show
   more" appears only when the text is actually clipped.
10. Tap that source line. Wikipedia opens in the in-app browser rather than throwing you out of the
   app. *(If the bio says "Couldn't generate a bio right now", tap Try again once; a persistent
   failure is worth reporting with the character's name — it means the endpoint, the cache or the
   daily cap, and the three look identical from here.)*
11. Back on the show, pick season 2, episode 3 from the episode strip, then tap **Previously** on
    the "Everyone credited on Ep 3" heading. The recap covers what happened *before* that episode,
    not the episode itself. Double-tapping an episode chip opens the same sheet.
    *(The button is absent on the very first episode of a show — there is nothing previous.)*

### 4. The relationship map, on a reality show
The map is two different tools wearing one face, and which one you get is decided by the show's
type. A reality show gets the dating board: one kind of link, drawn from whoever is interested.

12. Open Single's Inferno → the map. Eight people, laid out women on one side and men on the other
    (that split comes from the `gender` field being set on every seeded record).
13. Drag from one person to another to create a link — it appears immediately, with an arrow at the
    person on the receiving end. Drag a person to move them.
14. Drag the other way between the same two people. The two arrows collapse into a single line with
    a heart: that is the board saying the interest is mutual.
15. Switch to the next episode. The previous episode's links carry forward as a starting point;
    changing them there does not change the earlier episode.
16. Hide someone from the map, then bring them back from the bottom of the sheet.

### 5. The family tree, on a scripted show
A scripted show gets kinship instead, and the heading changes to say so. Here a link has to be
named, because "related" is not one thing.

17. Open The Bear → the map. The heading reads **Who's related to who**, and there is no
    women-on-one-side split — that layout is for the dating board only.
18. Drag from one character to another. A small panel asks how they are related, phrased as a
    sentence: *[first name] is [other first name]'s…*. Pick from the dropdown — the family options
    name the other person out loud ("parent of Sydney", "child of Sydney") because those two are
    the only ones where direction matters, and getting them the wrong way round is the easiest
    mistake to make.
19. Draw another and pick **something else…**. It asks for your own words instead — "half-sister",
    "raised him" — which is the escape hatch for every family a dropdown cannot name.
20. Tap a line's label to reword or remove it. A parent link keeps its arrow, pointing from the
    parent down to the child; everything else is a plain line, because those read the same in both
    directions.

### 6. Tidying the tree
21. Open Succession → the map. It arrives deliberately messy: eleven people scattered across the
    board with lines crossing over each other. This is the state a real board reaches after ten
    minutes of drawing.
22. Press **Tidy the tree**. Everything rearranges into bands, and a line under the toolbar says
    what happened. Expect, reading down: Logan, Marcia and Greg on top; the four Roy children with
    Rava and Tom beside them on the next band; and Frank Vernon and Lawrence Yee alone at the
    bottom, set further apart than the families are from each other.
23. Check the three things the arrangement is claiming. Parents sit above their children with a
    clear row between them for the "Parent of" labels. Spouses and partners sit side by side —
    Rava is there because she married Kendall, Tom because he is engaged to Shiv, and neither is a
    blood Roy. Anyone with no family at all is pushed below everyone who has one.
24. Press it again. Nothing moves — the arrangement is the same every time, so it is safe to press
    when you are not sure whether you already did.
25. Drag someone somewhere else, then press it again. They go back. Tidy is not a suggestion the
    board remembers; it recomputes from the lines every time, and your own placements are what it
    overwrites. That is the one action on this screen that moves people who were already placed.

### 7. Episodes and auto-loading
26. On The Bear, pick a season and episode from the strip. Cast credited on that episode load in.
27. Show menu (⋯) → "Clear N auto-loaded characters". The seeded six stay; the loaded ones go.
28. Reopen the same episode — they come back. Nothing was lost.

### 8. Status
29. Show menu → "Mark as completed". The show moves to Completed on the home screen.
30. From Completed, "Move back to Currently watching". It returns.

### 9. Sharing
Sharing is a **link**, not a code. The payload rides in the URL fragment, which browsers never
send to a server, so the notes travel only to the person you sent them to — and no messaging app
can render a preview of one. Test it across two browsers (or a phone and a laptop); a link opened
in the browser that made it still works, but proves less.

31. Show menu → **"Share this show"**. The sheet shows the link itself, a **Copy** button, and on a
    phone **"Send link…"**, which hands it to the operating system's own share sheet.
32. Open that link somewhere else. A preview sheet names the show and how many characters it
    carries, and **nothing is written until you accept** — dismissing it leaves the library
    untouched. Accept, and the show lands with the characters someone wrote. Cast that came from
    TMDb is not in the link; it reloads from TMDb on the new device.
33. Open Carmy and tap the share icon in the top-right corner of the sheet. That link carries one
    character.
34. Open the character link on the other device. Because a character needs a show to live in, the
    sheet **asks where it should go**: it offers The Bear if that show is already in the library,
    offers to create it if not, and lists everything else underneath. Each destination says whether
    it already holds this character. Pick one and the character lands there.
35. Try sharing a show you have written a great deal into. Past the link limit the sheet refuses
    outright and points at Settings → Export instead, rather than producing a link that messaging
    apps silently truncate.

### 10. Duplicate shows
36. With The Bear already in the library, add it again from the home screen search. Write a note on
    a character inside the *new* copy, so both copies hold something you typed.
37. A bar appears on the home screen: "You have two copies of The Bear, both with characters you
    wrote", with **Resolve**. The sheet — "Two copies of the same show" — offers to merge them or
    keep one, and says what each side holds. *(A duplicate with nothing of yours in it never
    reaches this screen; it is removed silently, which is the intended behaviour, not a miss.)*

### 11. New episode alerts
38. Open a show that is still running — Reacher, not The Bear. An orange **bell** captioned
    *Episode alerts* sits next to the title. On a finished show there is no bell at all: nothing
    more is coming, so there is nothing to be told about. A struck-through bell means alerts are
    off, a filled one ringing means on — the caption stays the same either way, since it names the
    button rather than reporting its state.
39. Tap it. The card says which show it is about and offers **At time of episode / 30 minutes /
    1 hour / 1 day before / Custom**. Pick one and **Turn on**; the browser asks permission, and
    the bell fills.
40. Reopen the card. It comes back on the lead time you chose, and following one show does not
    turn the others on. **Turn off notifications** at the bottom clears it and the bell goes back
    to struck-through.
41. In the same card, **WHERE TO WATCH** names the services carrying the show in your country. A
    show JustWatch has no listing for falls back to the channel it airs on, credited to TVmaze
    rather than JustWatch — the line changes to "Streams on…" or "Airs on…", which is a claim
    about the show rather than about your country.
    *(Delivery itself is hard to test to order — see the known gaps.)*

### 12. Footer tools
42. **Translate** in the footer: type a phrase, pick a language, get a translation back. It calls a
    free public API, so expect modest quality and an occasional failure rather than an error page.
43. **Convert**: type an amount and switch currencies. Rates are live, with a static table as a
    fallback, so a number always appears.

### 13. Offline
44. Open the app, then turn on airplane mode.
45. Reload. It should open normally, with your library and cast photos intact — everything is on
    the device and the app shell is cached.
46. Search for a new show. It should fail: TMDb is a live call and the app doesn't pretend
    otherwise. Everything already in your library keeps working.
47. Turn airplane mode off. Nothing to do — the next reload picks up any new deploy.

### 14. Backup
48. Settings → Export. A `cast-tracker-backup-<date>.json` file downloads.
49. Settings → Reset to blank state. The library empties.
50. Import the file you just exported. Everything returns, including the notes and relationships.
51. Now the case the file exists for, and it needs a second device. Signed in on both: ruin
    something on A — clear a character's notes — and let it reach B. Import an export taken before
    the damage on A, then force a sync on both. The restored notes stay restored and reach B; the
    damage does not come back. *(A restore is stamped as of the moment you make it, so it wins the
    merge against the newer damage sitting on the server. Before that it lost, and the recovery
    silently reverted on the next pull.)*

### 15. Sync across two devices
Working as of 2026-08-25. Sign-in goes through Resend from `noreply@casttracker.app`, at 30 emails
an hour rather than the built-in mailer's two, and the email carries a six-digit code above the
link. **Use the code, not the link** — a link is single-use, so a mail scanner that fetches the
message first spends it, and it only works in the browser that asked for it. The code has neither
constraint, which is what makes this work on a phone.

52. Sign in on device A. The library uploads.
53. Sign in as the same account on device B. The library arrives.
54. On device A, edit a character's notes and **leave immediately** — switch apps, or lock the
    screen — without waiting. Bring device B to the front. The edit is there. *(A push waits three
    seconds after your last edit, so leaving faster than that used to strand the edit on device A
    until it was next opened. Leaving now sends it. Closing the tab outright is the weaker case —
    the request goes out, but a browser may cancel it mid-flight, so a change that fails to arrive
    after a hard tab close is a known limit rather than a bug worth chasing.)*
55. Nothing arrives on a device that is sitting open and untouched. Bring it to the front — or
    reload — and it syncs. There is no polling and no live connection, by design.
56. Edit the same character's notes differently on each device, B last. Both converge on B's text.
57. Take device A offline, edit there, come back online. A's newer edit wins over the older remote.
58. Delete a character on A. It disappears on B rather than coming back.

### Known gaps to mention to a tester before they find them
- **Ask a signed-in tester what they think the Export button is for.** "Sync" reads as "backed up",
  which makes a second save button look redundant, and the honest answer is that they protect
  against different things: sync is a mirror and shows the damage too, a file is a moment a later
  mistake cannot reach. The Settings copy now says so; whether it lands is worth hearing from
  someone who has not been told.
- **The character sheet has no save button, and that is new.** It used to have ✓ / ✕ / ↶ and a
  setting to turn them off; the setting is gone and the sheet now writes as you type, like the rest
  of the app. Anyone who used the old build will look for the tick. ↶ is what replaced it, and it
  reaches back to however the record looked when the sheet opened.
- **"Tidy the tree" moves people the tester placed, and that is the point.** Everywhere else on the
  map a person keeps the cell they were given — that rule is what stops the board reshuffling under
  someone mid-edit. Tidy is the one exception, and it recomputes from scratch every time, so a
  careful manual arrangement is lost to a stray press. There is no undo. Say so before they try it.
- **Greg Hirsch sits with Logan and Marcia, not with the Roy children.** He is recorded as a
  "Relative", which is the map's word for family with no precise term — cousins, in-laws, the aunt
  who turns up at Christmas. Cousins are the same generation and aunts are not, so the tidy refuses
  to guess and leaves anyone joined that way on the top row of their family. Recording him as a
  child of someone would place him; that is the tester's call, not the app's.
- **A generation wider than the board wraps onto a second row.** The grid is six columns, so a
  family with seven siblings puts the last one underneath the first six rather than off the edge.
  It reads as two rows of one generation, which is the least bad option available at that width.
- **Notifications work, with one catch on iPhone and iPad.** The bell is beside the show title. On
  iOS, Safari only permits web push for apps added to the Home Screen — tapping it in a normal
  Safari tab fails no matter what the server is doing. The app now says so and gives the steps for
  the device it is running on, so a tester who hits it is not stuck:
  - **iPhone:** ⋯ at the bottom right → Share → "Add to Home Screen" (behind "View More" if it
    isn't visible).
  - **iPad:** the Share button in the toolbar at the top → scroll to "Add to Home Screen".
  - Then open Cast Tracker from that new icon and turn alerts on *there* — the tab and the
    installed app are the same origin but only the installed one is allowed to subscribe.

  The exact route to Share moves between iOS versions and if the address bar is set to the top;
  what has not moved is that "Add to Home Screen" is in the Share sheet, below the row of apps.
  Android and desktop have no such rule.
- **A lead time cannot be tested to order.** The job runs every fifteen minutes and sends when the
  moment you chose arrives, so nothing happens until an episode of a show you follow is genuinely
  that close. Setting the alert and waiting is the only honest end-to-end test. To check the
  machinery rather than the timing, hit the endpoint directly:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://casttracker.app/api/check-episodes` —
  it answers with a tally (`shows`, `withNewEpisode`, `sent`, `skipped`, `gone`, `failed`) rather
  than a notification.
- **Lead times are only as precise as the schedule.** Air times come from TVmaze; a show TVmaze
  doesn't carry falls back to TMDb's air *date*, read as midnight UTC, and those get day-level
  wording ("airs today") instead of a countdown. Vercel's Hobby plan also fires cron once a day
  whatever `vercel.json` says, which makes alerts late rather than wrong.
- **The follow control is missing on preview deployments.** `VITE_VAPID_PUBLIC_KEY` is read at
  build time and set on Production only, so its absence on a preview URL is configuration, not a
  bug. Sign-in is absent there for the same reason.
- **Sign-in is a code, not just a link.** Tell testers to type the six digits rather than tapping
  the link: a link only works in the browser that requested it, and only once.
- **A share link cannot be previewed by the app that carries it.** No thumbnail, no title — that
  is the fragment doing its job, since a preview would mean uploading the sender's notes to render
  one.

## Regenerating the seed

The file is hand-authored and checked in; there is no generator to run. If you edit it, keep the
top-level shape (`app`, `version`, `data.shows`, `settings`, `shares`, `recent`) — `importBackup`
rejects anything whose `app` is not `cast-tracker` or whose `data.shows` is not an array, and
`loadData` silently drops any show it cannot understand rather than failing loudly.

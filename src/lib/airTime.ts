/**
 * When an episode airs, worded for the person reading it.
 *
 * THE CANONICAL COPY. public/service-worker.js carries a byte-identical `airWords` inline, because
 * a service worker is served verbatim and cannot import from the bundle — the header of that file
 * is explicit that nothing in it may need a build step. src/lib/airTime.test.ts runs both through
 * the same table and fails if they ever disagree, so the duplication cannot drift silently.
 * Change one, change the other.
 *
 * Everything is formatted against the reader's own clock, which is the only reason this is on the
 * client at all: the cron composes one notification per episode for followers in every timezone,
 * and the alert card is read wherever the person happens to be.
 *
 * Two rules the format has to respect:
 *
 *   - An inexact `airsAt` is a *date* that api/_lib/schedule.ts read as midnight UTC, because the
 *     upstream had no time. So it is rendered in UTC and with no clock time. Rendered locally it
 *     would slide: midnight UTC is the previous evening anywhere west of Greenwich, and it would
 *     name the wrong day with total confidence.
 *   - Anything it cannot state honestly comes back as '', and every caller shows nothing at all
 *     rather than a placeholder.
 */
export function airWords(airsAt: unknown, exact: unknown, now: number): string {
  if (typeof airsAt !== 'number' || !isFinite(airsAt)) return '';
  const date = new Date(airsAt);
  if (isNaN(date.getTime())) return '';
  if (airsAt <= now) return '';

  if (!exact) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  }

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Compared on calendar date rather than on elapsed hours: an episode at 11pm tonight and one at
  // 1am tomorrow are two hours apart and are not the same answer to "what day".
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return time;

  // A weekday name is only unambiguous inside a week of today; past that it needs a date.
  const withinTheWeek = airsAt - now < 6 * 86400000;
  const day = date.toLocaleDateString(
    undefined,
    withinTheWeek ? { weekday: 'short' } : { weekday: 'short', month: 'short', day: 'numeric' },
  );
  return `${day} ${time}`;
}

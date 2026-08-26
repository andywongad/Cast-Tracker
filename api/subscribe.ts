import type { VercelRequest, VercelResponse } from '@vercel/node';
import { follow, followsShow, isValidSubscription } from './_lib/subscriptions.js';

/**
 * Follow a show's new episodes from this browser, and check whether it already does.
 *
 * The show is the part that was missing. This used to store a subscription with no record of what
 * it was for, which is why the cron had nothing to iterate — and why the toggle in the UI was
 * per-show in appearance and per-browser in fact.
 *
 * GET  ?showId=&endpoint=   -> { following: boolean }
 * POST { subscription, showTmdbId, leadMinutes? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const showId = Number(req.query.showId);
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
    if (!Number.isFinite(showId) || showId <= 0 || !endpoint) {
      return res.status(400).json({ error: 'showId and endpoint are required' });
    }
    try {
      return res.status(200).json({ following: await followsShow(endpoint, showId) });
    } catch (error) {
      console.error('Subscription status error:', error);
      return res.status(500).json({ error: 'Failed to read subscription' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscription, showTmdbId, leadMinutes } = (req.body || {}) as {
      subscription?: unknown;
      showTmdbId?: unknown;
      leadMinutes?: unknown;
    };

    // Validated properly rather than checking that `endpoint` is truthy: this writes to shared
    // storage from an unauthenticated route, so a malformed body should bounce here and not
    // become a follower record the cron trips over months later.
    if (!isValidSubscription(subscription)) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    const tmdbId = Number(showTmdbId);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return res.status(400).json({ error: 'A numeric showTmdbId is required' });
    }

    /**
     * Clamped rather than rejected. This is an unauthenticated route, and a lead time is a
     * preference, not an instruction — a nonsensical one should land on a sane number instead of
     * failing a subscription the person did ask for. 0 to four weeks, matching the client's own
     * bounds in src/lib/episodeAlerts.ts.
     */
    const lead = Number(leadMinutes);
    const safeLead = Number.isFinite(lead) ? Math.min(40_320, Math.max(0, Math.round(lead))) : 0;

    await follow(subscription, tmdbId, safeLead);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
}

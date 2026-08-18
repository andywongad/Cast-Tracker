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
 * POST { subscription, showTmdbId }
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
    const { subscription, showTmdbId } = (req.body || {}) as { subscription?: unknown; showTmdbId?: unknown };

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

    await follow(subscription, tmdbId);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
}

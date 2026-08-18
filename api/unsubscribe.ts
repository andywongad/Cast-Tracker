import type { VercelRequest, VercelResponse } from '@vercel/node';
import { unfollow, forget } from './_lib/subscriptions.js';

/**
 * Stop following one show, or drop this browser entirely.
 *
 * `showTmdbId` omitted means "forget me everywhere", which is what a browser should send when the
 * user revokes notification permission — otherwise its endpoint stays in every show's follower set
 * and the cron keeps trying to reach something that no longer accepts pushes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { endpoint, showTmdbId } = (req.body || {}) as { endpoint?: unknown; showTmdbId?: unknown };
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'endpoint is required' });
    }

    if (showTmdbId === undefined || showTmdbId === null) {
      await forget(endpoint);
    } else {
      const tmdbId = Number(showTmdbId);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
        return res.status(400).json({ error: 'showTmdbId must be numeric when given' });
      }
      await unfollow(endpoint, tmdbId);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
}

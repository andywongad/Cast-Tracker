import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY;
const FIREBASE_SERVER_KEY = process.env.FIREBASE_SERVER_KEY;

async function sendPushNotification(subscription: any, title: string, body: string, showId: string) {
  if (!FIREBASE_SERVER_KEY) {
    console.warn('Firebase server key not configured');
    return;
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FIREBASE_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: subscription.keys.p256dh,
        notification: { title, body },
        data: { showId, url: '/' },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}

async function checkShowForNewEpisodes(showId: number, subscription: any) {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${showId}/season/latest?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) return;

    const data = await response.json();
    const today = new Date().toISOString().split('T')[0];

    for (const episode of data.episodes || []) {
      if (episode.air_date === today) {
        await sendPushNotification(
          subscription,
          `New Episode: ${data.name}`,
          `Season ${episode.season_number}, Episode ${episode.episode_number} airs today!`,
          showId.toString()
        );
      }
    }
  } catch (error) {
    console.error(`Error checking show ${showId}:`, error);
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.header('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const keys = await kv.keys('subscription:*');

    for (const key of keys) {
      const subscriptionData = await kv.get(key);
      if (!subscriptionData) continue;

      const subscription = JSON.parse(subscriptionData as string);

      const showKeys = await kv.keys('show:*');
      for (const showKey of showKeys) {
        const showData = await kv.get(showKey);
        if (!showData) continue;

        const show = JSON.parse(showData as string);
        await checkShowForNewEpisodes(show.tmdbId, subscription);
      }
    }

    res.status(200).json({ success: true, message: 'Episode check completed' });
  } catch (error) {
    console.error('Check episodes error:', error);
    res.status(500).json({ error: 'Failed to check episodes' });
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    const subscriptionId = subscription.endpoint;

    await kv.set(`subscription:${subscriptionId}`, JSON.stringify(subscription), {
      ex: 60 * 60 * 24 * 365,
    });

    res.status(200).json({ success: true, message: 'Subscribed to notifications' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
}

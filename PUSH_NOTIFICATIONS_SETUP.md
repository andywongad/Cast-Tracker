# Push Notifications Setup Guide

Your push notifications feature is now integrated! Follow these steps to complete the setup:

## **Step 1: Set Up Firebase Cloud Messaging**

1. Go to https://console.firebase.google.com
2. Click **Create Project**
3. Name it: `Cast Tracker`
4. Disable Google Analytics (optional)
5. Click **Create**
6. Click the settings gear → **Project Settings**
7. Go to **Cloud Messaging** tab
8. Copy your **Server API Key** (keep this safe!)
9. Copy your **Sender ID**

## **Step 2: Generate VAPID Keys**

1. Open terminal and run:
```bash
npm install -g web-push
web-push generate-vapid-keys
```

2. Copy both keys (save them in a secure location)

## **Step 3: Add Environment Variables**

Add these to your `.env.local` (local testing):

```bash
VITE_VAPID_PUBLIC_KEY=<your-vapid-public-key-from-step-2>
CRON_SECRET=<generate-random-secret-string>
FIREBASE_SERVER_KEY=<your-firebase-server-key-from-step-1>
```

## **Step 4: Deploy to Vercel**

1. Push your code to GitHub
2. Go to Vercel dashboard
3. Click your project → **Settings** → **Environment Variables**
4. Add:
   - `VITE_VAPID_PUBLIC_KEY` = your-vapid-public-key
   - `FIREBASE_SERVER_KEY` = your-firebase-server-key  
   - `CRON_SECRET` = your-random-secret (same as .env.local)
   - `KV_REST_API_TOKEN` = (Vercel will auto-generate with KV)
   - `KV_REST_API_URL` = (Vercel will auto-generate with KV)

## **Step 5: Enable Vercel KV**

1. Go to Vercel dashboard → your project
2. Click **Storage**
3. Click **Create** → **KV Database**
4. Name it: `cast-tracker-kv`
5. Vercel auto-adds the env vars
6. Redeploy your project

## **Step 6: Install Node Packages**

Run in your project:
```bash
npm install @vercel/kv @vercel/node
```

Then commit and push to GitHub.

## **How It Works**

✅ **User clicks** "Enable Notifications" button on a show  
✅ **Browser requests** notification permission  
✅ **Subscription stored** in Vercel KV database  
✅ **Cron job runs** every 6 hours to check TMDB for new episodes  
✅ **Push notification sent** when new episode airs today  
✅ **User clicks** notification to open the app  

## **Testing Locally**

1. Make sure `.env.local` has all the keys
2. Run `npm run dev`
3. Open app → Click Settings → "Enable Notifications"
4. Browser will ask for permission
5. Accept and you're subscribed!

(Cron job only works in production, but subscriptions work locally)

## **Troubleshooting**

**"Push notifications not supported"**
- Ensure HTTPS (Vercel provides this)
- Service Worker needs HTTPS to work

**"Failed to subscribe"**
- Check VITE_VAPID_PUBLIC_KEY is correct
- Check notification permission is granted

**No notifications appearing**
- Verify cron job is running: Vercel dashboard → Function Logs
- Check Firebase Server Key is correct
- Verify Vercel KV is connected

## **Customization**

You can customize:
- **Cron schedule** in `vercel.json` (currently `0 */6 * * *` = every 6 hours)
- **Notification message** in `api/check-episodes.ts`
- **Notification icon** by adding images to `public/`

---

Once everything is configured, your friends will get notifications when new episodes of shows they track air! 🔔

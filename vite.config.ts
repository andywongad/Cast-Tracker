import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `npm run dev` runs Vite alone, which never executes anything in api/ — and worse, it will
 * happily transpile those files and serve them as JavaScript, so /api/* returns source with a
 * 200 instead of a 404. Proxying to a deployed origin gives local development the real
 * serverless routes, and means no API key needs to exist on this machine at all.
 *
 * Dev-only: `server.proxy` is not part of the production build.
 * Override the target with API_PROXY_TARGET when working against a preview deployment.
 */
/**
 * The canonical host, not the deployment one.
 *
 * This pointed at cast-tracker-m8g3.vercel.app, which vercel.json 308-redirects to casttracker.app
 * so the two do not compete in search. A browser follows that redirect to a different origin, the
 * request becomes cross-origin, and fetch fails with "Failed to fetch" — so every /api/* call in
 * local dev broke: TMDb search, bios, recaps, all of it. curl hid it, because -L follows the
 * redirect that a page cannot.
 */
const API_TARGET = process.env.API_PROXY_TARGET || 'https://casttracker.app';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});

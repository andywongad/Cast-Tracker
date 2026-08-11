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
const API_TARGET = process.env.API_PROXY_TARGET || 'https://cast-tracker-m8g3.vercel.app';

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

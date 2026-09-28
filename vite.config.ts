import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { powerApps } from '@microsoft/power-apps-vite'

/**
 * `npm run dev` starts Vite AND prints a "Local Play" URL (from the Power Apps plugin).
 * Open THAT url, not localhost: only inside the Power Apps host do the connectors work,
 * with your own sign-in. No tokens, no secrets.
 *
 * Lessons copied from the Data Hub example (src/datahub/vite.config.ts):
 *  - base './'  -> the Power Apps host serves the app under its own path; absolute /assets/
 *                  paths make the published app stay white.
 *  - a fixed, uncommon port with strictPort -> Vite must not silently pick another port,
 *                  because power.config.json's localAppUrl points at this one.
 */
export default defineConfig({
  plugins: [react(), powerApps()],
  base: './',
  server: {
    port: 5181,
    strictPort: true,
  },
})

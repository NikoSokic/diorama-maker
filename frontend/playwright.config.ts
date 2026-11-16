import { defineConfig } from '@playwright/test'

const PORT = 4173

// Smoke test of the production build (npm run smoke). The backend is never called: every /api request is
// answered inside the tests, so this needs no keys, no database and spends nothing.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  reporter: 'list',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    // WebGL in a headless browser on a machine without a display.
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

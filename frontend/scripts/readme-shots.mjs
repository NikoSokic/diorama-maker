// Takes the three screenshots used in the README (home page, waiting screen, player) into docs/screenshots.
// Needs the dev server (npm run dev); the backend is not called, its answers are given here.
//   node scripts/readme-shots.mjs

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('../docs/screenshots')
const SLUG = 'lisica123'

const waiting = {
  slug: SLUG,
  status: 'GENERATING_MODELS',
  progress: 55,
  lang: 'hr',
  title: 'Lisica Iskra i izgubljeni robot',
  text: 'Mala lisica Iskra pronašla je izgubljenog robota u šumi. Zajedno su zapalili krijesnice i otplesali do jutra.',
  characters: [
    { key: 'iskra', displayName: 'Iskra', kind: 'quadruped', status: 'READY', progress: 100 },
    { key: 'robot', displayName: 'Robot', kind: 'biped', status: 'RIGGING', progress: 70 },
    { key: 'krijesnica', displayName: 'Krijesnica', kind: 'creature', status: 'GENERATING', progress: 35 },
  ],
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
// Matched on the path: a '**/api/**' glob would also swallow the dev server's own /src/api/*.ts modules.
await page.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) =>
    new URL(route.request().url()).pathname === `/api/stories/${SLUG}`
      ? route.fulfill(json(waiting))
      : route.fulfill(json({ code: 'UNAVAILABLE', message: 'offline' }, 503)),
)

await page.goto(`${BASE}/?lang=hr`)
await page.locator('canvas').waitFor({ timeout: 30_000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: path.join(OUT, 'home.jpg'), type: 'jpeg', quality: 82 })

await page.goto(`${BASE}/s/${SLUG}?lang=hr`)
await page.getByRole('progressbar').first().waitFor()
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(OUT, 'progress.jpg'), type: 'jpeg', quality: 82 })

// The player in the middle of the bundled sample story (same recipe as scripts/shots.mjs).
await page.goto(`${BASE}/dev/player?story=mock-robot&scene=1&t=5.2&quality=high&muted=1`)
await page.waitForFunction(() => Boolean(window.__player), null, { timeout: 30_000 })
await page.waitForLoadState('networkidle')
await page.waitForTimeout(2200)
await page.evaluate(() => window.__player.setState({ playing: true }))
await page.waitForTimeout(1400)
await page.mouse.move(200, 200)
await page.screenshot({ path: path.join(OUT, 'player.jpg'), type: 'jpeg', quality: 82 })

await browser.close()
console.log('saved home.jpg, progress.jpg and player.jpg to', OUT)

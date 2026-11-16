// Visual check of the player: screenshots of every environment, a few story moments and the cards.
// Needs the dev server (npm run dev). Usage:
//   node scripts/shots.mjs                 all shots + contact sheets
//   node scripts/shots.mjs desert title    only the shots whose name contains one of the words
// Output: test-results/shots/*.png and sheet-*.png (git-ignored).

import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('test-results/shots')
const DESKTOP = { width: 1280, height: 720 }
const PHONE = { width: 390, height: 780 }

const env = (name, time, weather, extra = '') => ({
  name: `env-${name}`,
  query: `env=${name}&time=${time}&weather=${weather}&scene=0&t=6.2${extra}`,
})

const SHOTS = [
  env('meadow', 'day', 'clear'),
  env('forest', 'morning', 'fog'),
  env('beach', 'day', 'clear'),
  env('sea', 'sunset', 'clear'),
  env('castle', 'sunset', 'clear'),
  env('village', 'night', 'stars'),
  env('snowy_mountain', 'day', 'snow'),
  env('space', 'night', 'stars'),
  env('underwater', 'day', 'clear'),
  env('cave', 'night', 'fireflies'),
  env('desert', 'sunset', 'clear'),
  env('city_park', 'day', 'rain'),
  { name: 'story-title', query: 'story=mock-robot' },
  { name: 'story-mid', query: 'story=mock-robot&scene=1&t=5.2', play: 1400 },
  { name: 'story-forest', query: 'story=mock-robot&scene=2&t=6.4' },
  { name: 'story-cave', query: 'story=mock-robot&scene=3&t=6.6' },
  { name: 'story-finale', query: 'story=mock-robot&scene=4&t=6', play: 1200 },
  { name: 'story-end', query: 'story=mock-robot&scene=4&t=9.5', end: true },
  { name: 'star-closeup', query: 'story=mock-star&scene=2&t=7' },
  { name: 'star-space', query: 'story=mock-star&scene=4&t=6.5' },
  { name: 'phone-title', query: 'story=mock-star', viewport: PHONE },
  { name: 'phone-mid', query: 'story=mock-star&scene=1&t=5', viewport: PHONE, play: 1200 },
  { name: 'phone-landscape', query: 'story=mock-robot&scene=0&t=5', viewport: { width: 780, height: 390 }, play: 1200 },
  { name: 'medium-quality', query: 'env=village&time=sunset&weather=clear&scene=0&t=6.2', quality: 'medium' },
  { name: 'low-quality', query: 'env=village&time=sunset&weather=clear&scene=0&t=6.2', quality: 'low' },
]

const filters = process.argv.slice(2)
const wanted = filters.length ? SHOTS.filter((s) => filters.some((f) => s.name.includes(f))) : SHOTS

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
})
const problems = []

for (const shot of wanted) {
  const context = await browser.newContext({ viewport: shot.viewport ?? DESKTOP, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${shot.name}: ${message.text().slice(0, 300)}`)
  })
  page.on('pageerror', (error) => problems.push(`${shot.name}: ${String(error).slice(0, 300)}`))

  await page.goto(`${BASE}/dev/player?${shot.query}&quality=${shot.quality ?? 'high'}&muted=1`)
  await page.waitForFunction(() => Boolean(window.__player), null, { timeout: 30000 })
  // Models are fetched lazily; give them and the first frames time to arrive.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2200)
  if (shot.play) {
    // Let the story run for a moment so the shot shows motion, subtitles and the controls.
    await page.evaluate(() => window.__player.setState({ playing: true }))
    await page.waitForTimeout(shot.play)
    await page.mouse.move(200, 200)
  }
  if (shot.end) {
    await page.evaluate(() => window.__player.setState({ phase: 'ended', playing: false }))
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) })
  await context.close()
  console.log('shot', shot.name)
}

// Contact sheets: four shots on one picture, easier to compare side by side.
const sheetContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const sheet = await sheetContext.newPage()
for (let i = 0; i < wanted.length; i += 4) {
  const group = wanted.slice(i, i + 4)
  const cells = await Promise.all(
    group.map(async (s) => {
      const data = (await readFile(path.join(OUT, `${s.name}.png`))).toString('base64')
      return `<figure><img src="data:image/png;base64,${data}"><figcaption>${s.name}</figcaption></figure>`
    }),
  )
  await sheet.setContent(`<style>
    body{margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:100vh}
    figure{margin:0;position:relative;display:grid;place-items:center;overflow:hidden}
    figure{min-height:0;min-width:0}img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0}
    figcaption{position:absolute;left:6px;top:4px;color:#fff;font:14px sans-serif;background:#0009;padding:2px 6px}
  </style>${cells.join('')}`)
  await sheet.screenshot({ path: path.join(OUT, `sheet-${String(i / 4 + 1).padStart(2, '0')}.png`) })
}

await browser.close()
if (problems.length) {
  console.log(`\n${problems.length} console problem(s):`)
  for (const p of [...new Set(problems)].slice(0, 20)) console.log(' -', p)
  process.exitCode = 1
}

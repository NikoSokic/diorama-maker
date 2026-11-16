// Creates a story through the home page (so this browser holds the upload token), plays it, and checks that the
// gallery picture arrives. Needs the dev server and the backend.
//   node scripts/thumbnail-check.mjs "Story text"
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('test-results/shots')
const text = process.argv[2] ?? 'A little fox flies a red kite over the meadow, and a girl claps when it reaches the clouds.'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(BASE + '/?lang=en')
await page.locator('textarea').fill(text)
await page.locator('form button[type=submit]').click()
await page.waitForURL(/\/s\/[a-z0-9]+/, { timeout: 30000 })
const slug = page.url().split('/s/')[1].split(/[?#]/)[0]
const token = await page.evaluate((s) => JSON.parse(localStorage.getItem('dm.myStories') ?? '[]').find((x) => x.slug === s)?.uploadToken, slug)
console.log('story', slug, 'token in this browser:', token ? 'yes' : 'no')

await page.waitForFunction(() => typeof window.__dioramaAudio === 'function', null, { timeout: 180000 })
await page.keyboard.press('Space')
let thumb = null
for (let i = 0; i < 30 && !thumb; i++) {
  await page.waitForTimeout(1000)
  thumb = (await (await fetch(`${BASE}/api/stories/${slug}`)).json()).thumbnailUrl ?? null
}
console.log('thumbnailUrl', thumb ?? 'none after 30 s')
const spent = await page.evaluate((s) => JSON.parse(localStorage.getItem('dm.myStories') ?? '[]').find((x) => x.slug === s)?.uploadToken, slug)
console.log('token after upload:', spent ? 'still there' : 'spent')

if (thumb) {
  const img = await fetch(BASE + thumb)
  console.log('picture', img.status, img.headers.get('content-type'), (await img.arrayBuffer()).byteLength, 'bytes')
  await page.goto(BASE + '/gallery?lang=en')
  const card = page.locator(`a[href="/s/${slug}"] img`).first()
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await page
    .waitForFunction((s) => { const i = document.querySelector(`a[href="/s/${s}"] img`); return !!i && i.complete && i.naturalWidth > 0 }, slug, { timeout: 15000 })
    .then(() => console.log('gallery card shows the picture'))
    .catch(() => console.log('card image not loaded in the gallery'))
  await page.screenshot({ path: path.join(OUT, `gallery-${slug}.png`) })
  console.log('screenshot', path.join(OUT, `gallery-${slug}.png`))
}
await browser.close()

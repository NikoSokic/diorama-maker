// Opens a finished story, skips to its end card and asks for the same story at night in the snow (a tweak).
// Checks that a new story opens with the new plan and the same characters. Needs the dev server and the backend.
//   node scripts/tweak-check.mjs <slug>
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('test-results/shots')
const slug = process.argv[2]
if (!slug) throw new Error('usage: node scripts/tweak-check.mjs <slug>')
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${BASE}/s/${slug}?lang=en`)
await page.waitForFunction(() => typeof window.__dioramaAudio === 'function', null, { timeout: 120000 })
await page.keyboard.press('Space')
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(900)
  await page.keyboard.press('ArrowRight')
}
await page.getByRole('heading', { name: 'Try it another way' }).waitFor({ timeout: 20000 })
await page.getByLabel('Time of day').selectOption('night')
await page.getByLabel('Weather').selectOption('snow')
await page.screenshot({ path: path.join(OUT, `tweak-panel-${slug}.png`) })
await page.getByRole('button', { name: 'Show it' }).click()
await page.waitForURL((url) => !url.pathname.endsWith(slug), { timeout: 20000 })
const next = page.url().split('/s/')[1].split(/[?#]/)[0]
let story
for (let i = 0; i < 60; i++) {
  story = await (await fetch(`${BASE}/api/stories/${next}`)).json()
  if (story.status === 'READY' || story.status === 'FAILED') break
  await page.waitForTimeout(1000)
}
const parent = await (await fetch(`${BASE}/api/stories/${slug}`)).json()
const scenes = story.plan.scenes.map((s) => `${s.environment}/${s.timeOfDay}/${s.weather}`)
console.log('new story', next, story.status, scenes.join(' | '))
console.log('same characters:', JSON.stringify(story.plan.characters) === JSON.stringify(parent.plan.characters))
console.log('same models:', story.characters.every((c, i) => c.model?.glbUrl === parent.characters[i].model?.glbUrl))
await page.waitForFunction(() => typeof window.__dioramaAudio === 'function', null, { timeout: 120000 })
await page.keyboard.press('Space')
await page.waitForTimeout(4000)
await page.screenshot({ path: path.join(OUT, `tweak-result-${next}.png`) })
console.log('screenshots in', OUT)
await browser.close()

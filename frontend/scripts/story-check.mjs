// Opens real stories from the backend in the player and checks that their models load and they play.
// Needs the dev server and the backend (TRIPO_MODE=mock is enough).
//   node scripts/story-check.mjs <slug> [<slug> ...]      existing stories
//   node scripts/story-check.mjs --new "Story text" [hr|en]   create one first (one planner call)

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('test-results/shots')
const args = process.argv.slice(2)
let slugs = args

if (args[0] === '--new') {
  const response = await fetch(`${BASE}/api/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: args[1], lang: args[2] ?? 'en' }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`POST /api/stories: ${response.status} ${body.code}`)
  console.log('created', body.slug)
  slugs = [body.slug]
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
})
let failed = false

for (const slug of slugs) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  const problems = []
  const models = new Set()
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text().slice(0, 200)))
  page.on('pageerror', (e) => problems.push(String(e).slice(0, 200)))
  page.on('response', (r) => {
    if (/\.glb(\?|$)/.test(r.url())) {
      models.add(`${r.status()} ${new URL(r.url()).pathname.split('/').slice(-1)[0]}`)
      if (r.status() >= 400) problems.push(`model ${r.status()}: ${r.url()}`)
    }
  })

  await page.goto(`${BASE}/s/${slug}`)
  // The waiting screen polls until the story is ready, then the title card appears.
  const play = page.getByRole('button', { name: /Pokreni|Play the story/ })
  await play.waitFor({ timeout: 120_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, `backend-${slug}-title.png`) })
  await play.click()
  await page.waitForTimeout(6500)
  await page.screenshot({ path: path.join(OUT, `backend-${slug}-scene.png`) })
  const subtitle = await page.locator('.dm-subtitles p').innerText().catch(() => '')

  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${slug}: models [${[...models].join(', ')}], subtitle "${subtitle.slice(0, 50)}…"`)
  for (const p of [...new Set(problems)].slice(0, 8)) console.log('   -', p)
  failed ||= problems.length > 0 || subtitle.length < 5
  await page.close()
}

await browser.close()
if (failed) process.exitCode = 1

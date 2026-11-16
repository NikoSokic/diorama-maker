// Plays a bundled story from the title card to "The End" in a real browser and checks that every scene
// came up, nothing was logged as an error and the buttons work. Needs the dev server (npm run dev).
//   node scripts/playthrough.mjs [slug]

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const slug = process.argv[2] ?? 'mock-robot'

const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(m.text().slice(0, 300)))
page.on('pageerror', (e) => problems.push(String(e).slice(0, 300)))

const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what)
  if (!ok) problems.push(what)
}
const state = () =>
  page.evaluate(() => {
    const s = window.__player.getState()
    return { phase: s.phase, playing: s.playing, scene: s.sceneIndex, time: s.clock.sceneTime, count: s.scenes.length, muted: s.muted }
  })

await page.goto(`${BASE}/dev/player?story=${slug}&muted=1`)
await page.waitForFunction(() => Boolean(window.__player))
check((await state()).phase === 'title', 'opens on the title card')

await page.getByRole('button', { name: /Pokreni|Play the story/ }).click()
await page.waitForTimeout(1500)
let s = await state()
check(s.phase === 'playing' && s.playing && s.time > 0.3, 'play button starts the story')
check((await page.locator('.dm-subtitles p').innerText()).length > 10, 'subtitles are shown')

await page.keyboard.press('Space')
await page.waitForTimeout(300)
const paused = await state()
await page.waitForTimeout(700)
check(!(await state()).playing && Math.abs((await state()).time - paused.time) < 0.05, 'space pauses and time stands still')
await page.keyboard.press('Space')

const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0
      const start = performance.now()
      const tick = () => (performance.now() - start < 2000 ? (n++, requestAnimationFrame(tick)) : resolve(n / 2))
      requestAnimationFrame(tick)
    }),
)
console.log('     frame rate while playing:', Math.round(frames), 'fps')

// Let the whole story run in real time and note every scene that comes up.
const seen = new Set()
const started = Date.now()
while (Date.now() - started < 150_000) {
  s = await state()
  seen.add(s.scene)
  if (s.phase === 'ended') break
  await page.waitForTimeout(400)
}
check(s.phase === 'ended', `story reaches the end by itself (${Math.round((Date.now() - started) / 1000)} s)`)
check(seen.size === s.count, `all ${s.count} scenes were shown (${[...seen].join(', ')})`)
check(await page.getByRole('button', { name: /Pogledaj ponovno|Watch again/ }).isVisible(), 'end card offers a replay')

await page.getByRole('button', { name: /Kopiraj|Copy link/ }).click()
const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
await page.getByRole('button', { name: /Spremi sliku|Save picture/ }).click()
const file = await download
check(Boolean(file) && file.suggestedFilename().endsWith('.png'), 'save picture downloads a PNG')

await page.getByRole('button', { name: /Pogledaj ponovno|Watch again/ }).click()
await page.waitForTimeout(1200)
s = await state()
check(s.phase === 'playing' && s.scene === 0, 'replay starts again from the first scene')

await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1600)
check((await state()).scene === 1, 'right arrow goes to the next scene')

await browser.close()
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const p of [...new Set(problems)].slice(0, 15)) console.log(' -', p)
  process.exitCode = 1
} else console.log('\nPlaythrough passed.')

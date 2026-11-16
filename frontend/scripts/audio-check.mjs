// Plays a story in a real browser and prints the player's audio state over time (audio itself cannot be heard
// in an automated check). Needs the dev server.
//   node scripts/audio-check.mjs [path]    default: /dev/player?story=mock-star
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const target = process.argv[2] ?? '/dev/player?story=mock-star'
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } })
await page.goto(BASE + target)
await page.waitForFunction(() => typeof window.__dioramaAudio === 'function', null, { timeout: 30000 })
const snap = () => page.evaluate(() => window.__dioramaAudio())
const show = (label, s) =>
  console.log(label.padEnd(16), s.state.padEnd(9), (s.scene ?? '-').padEnd(34), `master=${s.levels.master} bed=${s.levels.bed.toFixed(2)} sfx=${s.levels.sfx}`,
    s.voice ? `voice=${s.voice.playing ? 'playing' : 'idle'}@${s.voice.time.toFixed(1)}s` : 'voice=browser',
    JSON.stringify(s.played))

show('before Play', await snap())
await page.keyboard.press('Space')
let elapsed = 0
for (const t of [1, 3, 6, 10, 16]) {
  await page.waitForTimeout((t - elapsed) * 1000)
  elapsed = t
  show(`after ${t}s`, await snap())
}
await page.keyboard.press('m')
await page.waitForTimeout(300)
show('muted', await snap())
await page.keyboard.press('m')
await page.keyboard.press('Space')
await page.waitForTimeout(300)
show('paused', await snap())
await browser.close()

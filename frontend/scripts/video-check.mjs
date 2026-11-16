// Records a story with the end card's "Download video" button and checks the file: not empty, has a duration,
// plays, has picture and sound tracks. Needs the dev server and the backend.
//   node scripts/video-check.mjs <slug> [hr|en]
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = path.resolve('test-results/shots')
const [slug, lang = 'en'] = process.argv.slice(2)
if (!slug) throw new Error('usage: node scripts/video-check.mjs <slug> [hr|en]')
const label = lang === 'hr' ? 'Preuzmi video' : 'Download video'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true })
await page.goto(`${BASE}/s/${slug}?lang=${lang}`)
await page.waitForFunction(() => typeof window.__dioramaAudio === 'function', null, { timeout: 120000 })
await page.keyboard.press('Space')
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(700)
  await page.keyboard.press('ArrowRight')
}
await page.getByRole('button', { name: label }).waitFor({ timeout: 20000 })
const started = Date.now()
const download = page.waitForEvent('download', { timeout: 240000 })
await page.getByRole('button', { name: label }).click()
await page.waitForTimeout(3000)
await page.screenshot({ path: path.join(OUT, `video-recording-${slug}.png`) })
const snap = await page.evaluate(() => window.__dioramaAudio?.())
console.log('while recording: audio', snap?.state, 'voice', snap?.voice ? (snap.voice.playing ? 'playing' : 'idle') : 'browser')
const file = await download
const target = path.join(OUT, file.suggestedFilename())
await file.saveAs(target)
const { size } = await stat(target)
console.log('saved', file.suggestedFilename(), size, 'bytes after', Math.round((Date.now() - started) / 1000), 's')

// Play the file back in the browser.
const bytes = await readFile(target)
const type = target.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
const check = await page.evaluate(
  async ({ b64, type }) => {
    const blob = await (await fetch(`data:${type};base64,${b64}`)).blob()
    const video = document.createElement('video')
    video.muted = true
    video.src = URL.createObjectURL(blob)
    document.body.replaceChildren(video)
    video.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;background:#000'
    await new Promise((ok, fail) => {
      video.onloadedmetadata = ok
      video.onerror = () => fail(new Error('cannot decode: ' + (video.error?.message ?? video.error?.code)))
    })
    // webm from MediaRecorder has no duration in its header: seeking far makes the browser find it
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e6
      await new Promise((ok) => (video.ontimeupdate = ok))
      video.currentTime = 0
    }
    const duration = video.duration
    await video.play()
    await new Promise((ok) => setTimeout(ok, 1500))
    const moved = video.currentTime
    video.pause()
    video.currentTime = Math.min(duration / 3, 6)
    await new Promise((ok) => (video.onseeked = ok))
    const audioTracks = video.mozHasAudio ?? video.webkitAudioDecodedByteCount ?? null
    return { duration, moved, width: video.videoWidth, height: video.videoHeight, audioBytes: audioTracks }
  },
  { b64: bytes.toString('base64'), type },
)
console.log('playback', JSON.stringify(check))
await page.screenshot({ path: path.join(OUT, `video-frame-${slug}.png`) })
await browser.close()

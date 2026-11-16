import { chromium } from 'playwright'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const jobs = [
  ['home-390', '/?lang=en', { width: 390, height: 844 }],
  ['home-desktop', '/?lang=hr', { width: 1280, height: 800 }],
  ['player-390', '/s/mock-robot', { width: 390, height: 844 }],
  ['player-desktop', '/s/mock-star', { width: 1280, height: 800 }],
]
for (const [name, path, viewport] of jobs) {
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:5173' + path, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `test-results/p4-${name}.png`, fullPage: false })
  console.log(name, errors.length ? errors.slice(0, 2) : 'ok')
  await page.close()
}
await browser.close()

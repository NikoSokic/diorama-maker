import { expect, test, type Page } from '@playwright/test'
import { MOCK_STORIES } from '../src/mock/stories'

const SLUG = 'smoke1234'
const PLAY = /Pokreni|Play the story/

/** Uncaught exceptions on the page; every test ends with none. */
let crashes: string[] = []

test.beforeEach(async ({ page }) => {
  crashes = []
  page.on('pageerror', (error) => crashes.push(String(error)))
  // Nothing may reach a real backend. Tests that need an answer register their own route after this one.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'UNAVAILABLE', message: 'smoke test' }) }),
  )
})

test.afterEach(() => {
  expect(crashes).toEqual([])
})

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function startStory(page: Page) {
  await page.getByRole('button', { name: PLAY }).click()
  const subtitle = page.locator('.dm-subtitles p')
  await expect(subtitle).not.toBeEmpty({ timeout: 15_000 })
  await expect(page.locator('.dm-stage canvas')).toBeVisible()
  return subtitle
}

test('home page shows the form and refuses an empty story', async ({ page }) => {
  await page.goto('/?lang=hr')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Napiši priču. Gledaj kako oživi.')
  await page.getByRole('button', { name: 'Stvori moju priču' }).click()
  await expect(page.getByText('Najprije napiši priču')).toBeVisible()
  await expect(page).toHaveURL(/\/\?lang=hr$/)
})

test('navigation and language toggle', async ({ page }) => {
  await page.goto('/?lang=hr')
  await page.getByRole('link', { name: 'Galerija' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Galerija priča')
  // The backend is down in this test: the gallery falls back to the bundled samples.
  await expect(page.locator('a[href="/s/mock-robot"]').first()).toBeVisible()

  await page.getByRole('link', { name: 'Kako radi' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kako priča postane predstava')

  await page.getByRole('group', { name: 'Jezik' }).getByRole('button', { pressed: false }).click()
  await page.getByRole('link', { name: 'Gallery' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Story gallery')
})

test('a new story goes from the form through the waiting screen into the player', async ({ page }) => {
  const ready = { ...MOCK_STORIES[0], slug: SLUG }
  const waiting = { slug: SLUG, lang: ready.lang, text: ready.text, characters: [] }
  let posted: { text?: string; lang?: string } = {}
  let polls = 0

  await page.route('**/api/stories', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    posted = route.request().postDataJSON() as typeof posted
    return route.fulfill(json({ slug: SLUG, status: 'ANALYZING' }, 202))
  })
  await page.route(`**/api/stories/${SLUG}`, (route) => {
    polls += 1
    if (polls === 1) return route.fulfill(json({ ...waiting, status: 'ANALYZING', progress: 10 }))
    if (polls === 2) return route.fulfill(json({ ...waiting, status: 'GENERATING_MODELS', progress: 55, title: ready.title }))
    return route.fulfill(json(ready))
  })

  await page.goto('/?lang=hr')
  await page.getByRole('textbox').first().fill('Mali robot pronašao je zvijezdu i odnio je kući.')
  await page.getByRole('button', { name: 'Stvori moju priču' }).click()

  await expect(page).toHaveURL(new RegExp(`/s/${SLUG}$`))
  await expect(page.getByText('Tvoja priča nastaje')).toBeVisible()
  await expect(page.getByRole('progressbar').first()).toBeVisible()
  expect(posted.text).toContain('Mali robot')
  expect(posted.lang).toBe('hr')

  await expect(page.getByRole('button', { name: PLAY })).toBeVisible({ timeout: 20_000 })
  expect(polls).toBeGreaterThanOrEqual(3)
  await startStory(page)
})

test('a bundled story plays and moves on to the next scene', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/s/mock-robot')
  const subtitle = await startStory(page)
  const first = await subtitle.innerText()

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await subtitle.innerText().catch(() => first)) !== first, { timeout: 20_000 }).toBe(true)
  expect(errors).toEqual([])
})

test('missing story and unknown address have friendly pages', async ({ page }) => {
  await page.route('**/api/stories/nema-je', (route) => route.fulfill(json({ code: 'NOT_FOUND', message: 'No such story.' }, 404)))
  await page.goto('/s/nema-je?lang=hr')
  await expect(page.getByRole('heading', { name: 'Te priče nema' })).toBeVisible()

  await page.goto('/ovo/ne/postoji?lang=hr')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nova priča' }).first()).toBeVisible()
})

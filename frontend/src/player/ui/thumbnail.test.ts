import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_STORIES } from '../../mock/stories'
import { createPlayerStore, REVEAL_MS } from '../engine/store'
import { readyForThumbnail, SETTLE_SECONDS } from './thumbnail'

function run(store: ReturnType<typeof createPlayerStore>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    store.getState().tick(1 / 60)
    vi.advanceTimersByTime(1000 / 60)
  }
}

describe('thumbnail capture gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits for Play, the open curtain, loaded models and a settled scene', () => {
    const store = createPlayerStore(MOCK_STORIES[0], { muted: true })
    expect(readyForThumbnail(store, false)).toBe(false) // title card

    store.getState().start()
    run(store, REVEAL_MS / 1000 + 0.2)
    expect(readyForThumbnail(store, false)).toBe(false) // scene not settled yet

    run(store, SETTLE_SECONDS)
    expect(readyForThumbnail(store, true)).toBe(false) // models still loading
    expect(readyForThumbnail(store, false)).toBe(true)

    store.getState().pause()
    expect(readyForThumbnail(store, false)).toBe(false)
  })
})

describe('upload token bookkeeping', () => {
  const memory = new Map<string, string>()
  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the token when the story is remembered again and drops it once spent', async () => {
    const { rememberStory, spendUploadToken, uploadTokenFor } = await import('../../lib/myStories')
    rememberStory({ slug: 'abc', title: 'A fox', lang: 'en', uploadToken: 't0k3n' })
    rememberStory({ slug: 'abc', title: 'A fox and a kite', lang: 'en' }) // the story page refreshes the title
    expect(uploadTokenFor('abc')).toBe('t0k3n')
    spendUploadToken('abc')
    expect(uploadTokenFor('abc')).toBeUndefined()
  })
})

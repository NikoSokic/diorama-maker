import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_STORIES } from '../../mock/stories'
import { COVER_MS, createPlayerStore, readingTime, REVEAL_MS } from './store'

const story = MOCK_STORIES[0]

/** Runs the clock like the render loop would: 60 frames per second, timers included. */
function run(store: ReturnType<typeof createPlayerStore>, seconds: number) {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) {
    store.getState().tick(1 / 60)
    vi.advanceTimersByTime(1000 / 60)
  }
}

describe('player store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits on the title card until started', () => {
    const store = createPlayerStore(story)
    run(store, 3)
    const s = store.getState()
    expect(s.phase).toBe('title')
    expect(s.clock.sceneTime).toBe(0)
    // Idle life (breathing, wind) runs even behind the title card.
    expect(s.clock.animTime).toBeGreaterThan(2.9)
  })

  it('plays every scene in order and ends', () => {
    const store = createPlayerStore(story, { muted: true })
    const seen: number[] = []
    store.subscribe((s) => {
      if (seen[seen.length - 1] !== s.sceneIndex) seen.push(s.sceneIndex)
    })
    store.getState().start()
    run(store, 80)
    expect(store.getState().phase).toBe('ended')
    expect(store.getState().playing).toBe(false)
    expect(seen).toEqual([0, 1, 2, 3, 4])
  })

  it('gives every scene at least the time needed to read its subtitle', () => {
    const short = { ...story, plan: { ...story.plan!, scenes: story.plan!.scenes.map((s) => ({ ...s, durationSec: 5 })) } }
    const store = createPlayerStore(short, { muted: true })
    const need = readingTime(short.plan.scenes[0].narration)
    expect(need).toBeGreaterThan(5)
    store.getState().start()
    run(store, need - 0.3)
    expect(store.getState().sceneIndex).toBe(0)
    run(store, 0.4 + (COVER_MS + 50) / 1000)
    expect(store.getState().sceneIndex).toBe(1)
  })

  it('waits for the narrator, but not forever', () => {
    const store = createPlayerStore(story)
    store.getState().start()
    store.getState().clock.speaking = true
    const duration = store.getState().scenes[0].duration
    run(store, duration + 4)
    expect(store.getState().sceneIndex).toBe(0)
    run(store, 6.5)
    expect(store.getState().sceneIndex).toBe(1)
  })

  it('stops the story clock while paused and resumes where it was', () => {
    const store = createPlayerStore(story, { muted: true })
    store.getState().start()
    run(store, 2)
    store.getState().toggle()
    const at = store.getState().clock.sceneTime
    const anim = store.getState().clock.animTime
    run(store, 3)
    expect(store.getState().clock.sceneTime).toBe(at)
    expect(store.getState().clock.animTime).toBe(anim)
    store.getState().toggle()
    run(store, 1)
    expect(store.getState().clock.sceneTime).toBeCloseTo(at + 1, 1)
  })

  it('changes scene behind a curtain: iris for a new place, fade for the same one', () => {
    const store = createPlayerStore(story, { muted: true })
    store.getState().start()
    run(store, 1)
    store.getState().next()
    // Scenes 0 and 1 are both in the meadow.
    expect(store.getState().curtain).toEqual({ kind: 'fade', stage: 'cover' })
    expect(store.getState().sceneIndex).toBe(0)
    const cut = store.getState().clock.cut
    run(store, (COVER_MS + 30) / 1000)
    expect(store.getState().sceneIndex).toBe(1)
    expect(store.getState().clock.cut).toBeGreaterThan(cut)
    expect(store.getState().curtain?.stage).toBe('reveal')
    run(store, (REVEAL_MS + 30) / 1000)
    expect(store.getState().curtain).toBeNull()
    store.getState().next()
    expect(store.getState().curtain?.kind).toBe('iris')
  })

  it('goes back like a music player', () => {
    const store = createPlayerStore(story, { muted: true })
    store.getState().start()
    store.getState().goTo(2)
    run(store, 1.5)
    expect(store.getState().sceneIndex).toBe(2)
    // Early in the scene: previous scene.
    store.getState().previous()
    run(store, 1)
    expect(store.getState().sceneIndex).toBe(1)
    // Later in the scene: restart the same scene.
    run(store, 3)
    const run1 = store.getState().sceneRun
    store.getState().previous()
    run(store, 1)
    expect(store.getState().sceneIndex).toBe(1)
    expect(store.getState().sceneRun).toBeGreaterThan(run1)
    expect(store.getState().clock.sceneTime).toBeLessThan(1)
  })

  it('ends from the last scene on "next" and replays from the start', () => {
    const store = createPlayerStore(story, { muted: true })
    store.getState().seek(4, 2)
    expect(store.getState().playing).toBe(false)
    expect(store.getState().sceneIndex).toBe(4)
    store.getState().next()
    expect(store.getState().phase).toBe('ended')
    store.getState().restart()
    expect(store.getState().phase).toBe('playing')
    expect(store.getState().sceneIndex).toBe(0)
    expect(store.getState().clock.sceneTime).toBe(0)
  })

  it('ignores out-of-range scene numbers', () => {
    const store = createPlayerStore(story)
    store.getState().start()
    store.getState().goTo(99)
    store.getState().goTo(-1)
    expect(store.getState().curtain?.stage).toBe('reveal')
    store.getState().seek(99, 999)
    expect(store.getState().sceneIndex).toBe(4)
    expect(store.getState().clock.sceneTime).toBe(store.getState().scenes[4].duration)
  })

  it('refuses a story without a plan', () => {
    expect(() => createPlayerStore({ ...story, plan: undefined })).toThrow()
  })
})

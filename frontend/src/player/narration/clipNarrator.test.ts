import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipNarrator, STALL_GRACE_MS, WATCHDOG_MS } from './clipNarrator'

/** Just enough of an <audio> element: play() resolves, the test moves currentTime and fires events. */
class FakeAudio {
  src = ''
  currentTime = 0
  paused = true
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
  })
}

const okFetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['wav']) }))

function setup(fetcher: typeof fetch = okFetch as never) {
  const audio = new FakeAudio()
  const route = vi.fn(() => true)
  const narrator = new ClipNarrator({ route }, fetcher, () => audio as unknown as HTMLAudioElement)
  const handlers = { onStart: vi.fn(), onEnd: vi.fn(), onFail: vi.fn() }
  return { audio, route, narrator, handlers }
}

describe('clip narrator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    okFetch.mockClear()
  })

  it('plays a clip through the shared audio graph and reports start and end', async () => {
    const { audio, route, narrator, handlers } = setup()
    narrator.speak('/api/files/narration/a.wav', handlers)
    await vi.advanceTimersByTimeAsync(0)

    expect(route).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe('blob:clip')
    expect(handlers.onStart).toHaveBeenCalled()
    audio.currentTime = 1.2
    await vi.advanceTimersByTimeAsync(300)
    audio.onended?.()
    expect(handlers.onEnd).toHaveBeenCalledTimes(1)
    expect(handlers.onFail).not.toHaveBeenCalled()
  })

  it('falls back when the file cannot be fetched', async () => {
    const { narrator, handlers } = setup((async () => ({ ok: false, status: 404 })) as never)
    narrator.speak('/api/files/narration/missing.wav', handlers)
    await vi.advanceTimersByTimeAsync(0)

    expect(handlers.onFail).toHaveBeenCalledTimes(1)
    expect(handlers.onStart).not.toHaveBeenCalled()
    expect(handlers.onEnd).not.toHaveBeenCalled()
  })

  it('falls back when the audio never starts moving, but not while the viewer has paused', async () => {
    const { audio, narrator, handlers } = setup()
    narrator.speak('/a.wav', handlers)
    await vi.advanceTimersByTimeAsync(0)
    narrator.pause()
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 3)
    expect(handlers.onFail).not.toHaveBeenCalled()

    narrator.resume()
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 300)
    expect(handlers.onFail).toHaveBeenCalledTimes(1)
    expect(handlers.onEnd).toHaveBeenCalledTimes(1) // it had started: speaking must be switched off again
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('ends a clip that stops moving without an ended event', async () => {
    const { audio, narrator, handlers } = setup()
    narrator.speak('/a.wav', handlers)
    await vi.advanceTimersByTimeAsync(0)
    audio.currentTime = 2
    await vi.advanceTimersByTimeAsync(STALL_GRACE_MS + 500)
    expect(handlers.onEnd).toHaveBeenCalledTimes(1)
    expect(handlers.onFail).not.toHaveBeenCalled()
  })

  it('downloads each clip once and forgets a cancelled one', async () => {
    const { narrator, handlers } = setup()
    await narrator.preload('/b.wav')
    narrator.speak('/b.wav', handlers)
    narrator.cancel()
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 2)
    expect(okFetch).toHaveBeenCalledTimes(1)
    expect(handlers.onStart).not.toHaveBeenCalled()
    expect(handlers.onFail).not.toHaveBeenCalled()
  })
})

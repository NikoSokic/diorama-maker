// Plays the generated narrator voice (one WAV per scene). Each clip is fetched into a blob URL first, so a missing
// file fails loudly (instead of an <audio> element that silently plays nothing) and the next scene can be
// preloaded. One element is reused for every clip and, when Web Audio is unlocked, routed once through the sound
// engine, so mute and a video recording include the voice.

import type { SpeakHandlers } from './speech'

export interface ClipHandlers extends SpeakHandlers {
  /** The clip could not be played; the caller reads the scene with the browser's voice instead. */
  onFail?: () => void
}

/** Audio has to start moving within this time after play(), or the clip counts as failed. */
export const WATCHDOG_MS = 1500
/** Grace after the clip's own length before a missing `ended` event is assumed. */
export const STALL_GRACE_MS = 3000
const POLL_MS = 250

export interface VoiceRouter {
  /** Connects the element into the shared audio graph; false when Web Audio is not available yet. */
  route(element: HTMLAudioElement): boolean
}

export class ClipNarrator {
  private element: HTMLAudioElement | null = null
  private routed = false
  private readonly blobs = new Map<string, Promise<string>>()
  private token = 0
  private timers: ReturnType<typeof setInterval>[] = []
  private finish: (() => void) | null = null
  private readonly router: VoiceRouter | null
  private readonly fetcher: typeof fetch
  private readonly createAudio: () => HTMLAudioElement

  constructor(
    router: VoiceRouter | null = null,
    fetcher: typeof fetch = (...args) => fetch(...args),
    createAudio: () => HTMLAudioElement = () => new Audio(),
  ) {
    this.router = router
    this.fetcher = fetcher
    this.createAudio = createAudio
  }

  /** Starts downloading a clip so it plays without a gap when its scene comes. */
  preload(url: string): Promise<string> {
    let blob = this.blobs.get(url)
    if (!blob) {
      blob = this.fetcher(url).then(async (res) => {
        if (!res.ok) throw new Error(`narration clip: HTTP ${res.status}`)
        return URL.createObjectURL(await res.blob())
      })
      blob.catch(() => this.blobs.delete(url))
      this.blobs.set(url, blob)
    }
    return blob
  }

  speak(url: string, handlers: ClipHandlers = {}) {
    this.cancel()
    const token = ++this.token
    let started = false
    let done = false
    const end = () => {
      if (done || token !== this.token) return
      done = true
      this.clearTimers()
      this.finish = null
      handlers.onEnd?.()
    }
    const fail = () => {
      if (done || token !== this.token) return
      done = true
      this.clearTimers()
      this.finish = null
      if (started) handlers.onEnd?.()
      handlers.onFail?.()
    }
    this.finish = end
    this.preload(url)
      .then((src) => {
        if (token !== this.token) return
        const el = this.audio()
        el.onended = end
        el.onerror = fail
        el.src = src
        el.currentTime = 0
        return el.play().then(() => {
          if (token !== this.token) return
          started = true
          handlers.onStart?.()
          // Watch the playhead (time paused by the viewer does not count): a clip that never moves failed (blocked
          // autoplay, broken decoder); one that stops moving before its end lost its "ended" event.
          let last = -1
          let still = 0
          const poll = setInterval(() => {
            if (el.paused) return
            if (el.currentTime !== last) {
              last = el.currentTime
              still = 0
              return
            }
            still += POLL_MS
            if (last <= 0 && still >= WATCHDOG_MS) fail()
            else if (last > 0 && still >= STALL_GRACE_MS) end()
          }, POLL_MS)
          this.timers.push(poll)
        })
      })
      .catch(fail)
  }

  pause() {
    this.element?.pause()
  }

  resume() {
    if (this.finish && this.element?.paused && this.element.src) void this.element.play().catch(() => {})
  }

  cancel() {
    this.token++
    this.clearTimers()
    this.finish = null
    if (this.element) {
      this.element.onended = null
      this.element.onerror = null
      this.element.pause()
    }
  }

  dispose() {
    this.cancel()
    for (const blob of this.blobs.values()) void blob.then((u) => URL.revokeObjectURL(u)).catch(() => {})
    this.blobs.clear()
  }

  private audio(): HTMLAudioElement {
    if (!this.element) this.element = this.createAudio()
    // Route once, as soon as the shared graph exists (an element can be wrapped only one time).
    if (!this.routed && this.router) this.routed = this.router.route(this.element)
    return this.element
  }

  private clearTimers() {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }
}

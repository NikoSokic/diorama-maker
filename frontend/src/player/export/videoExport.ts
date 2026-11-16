// One video recording per player: started from the end card, driven by the render loop, finished when the story
// ends. The pure parts (what the overlay shows at a given moment) are exported for tests.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { soundEngineFor } from '../audio/useSoundscape'
import { COVER_MS, readingTime, REVEAL_MS, usePlayerStore, type PlayerState, type PlayerStore } from '../engine/store'
import { totalDuration } from '../engine/timeline'
import { downloadBlob, recordingSupport, StoryRecorder, SUBTITLE_FONT, type Overlay } from './recorder'

export type VideoResult = 'saved' | 'unsupported' | 'failed' | 'cancelled' | 'hidden'

interface Session {
  recorder: StoryRecorder
  finish: (result: VideoResult) => void
  curtainSince: number
  curtain: PlayerState['curtain']
}

const canvases = new WeakMap<PlayerStore, HTMLCanvasElement>()
const sessions = new WeakMap<PlayerStore, Session>()
/** A little of the end card after the last scene, so the video does not stop mid-word. */
const TAIL_MS = 800

/** The words of the subtitle shown `sceneTime` seconds into a scene (same pace as the player's subtitles). */
export function subtitleAt(text: string, sceneTime: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const perWord = Math.min(0.32, (readingTime(text) * 0.62) / words.length)
  const shown = Math.floor((sceneTime - 0.35) / perWord) + 1
  return words.slice(0, Math.max(0, Math.min(words.length, shown))).join(' ')
}

/** How much the curtain covers the stage, `elapsedMs` after it reached its current stage. */
export function curtainAt(curtain: PlayerState['curtain'], elapsedMs: number): number {
  if (!curtain) return 0
  if (curtain.stage === 'cover') return Math.min(1, elapsedMs / COVER_MS)
  return Math.max(0, 1 - elapsedMs / REVEAL_MS)
}

function overlay(state: PlayerState, session: Session, now: number): Overlay {
  if (state.curtain !== session.curtain) {
    session.curtain = state.curtain
    session.curtainSince = now
  }
  const text = state.phase === 'playing' ? state.scenes[state.sceneIndex].scene.narration : ''
  return { subtitle: subtitleAt(text, state.clock.sceneTime), curtain: curtainAt(state.curtain, now - session.curtainSince) }
}

export function isRecording(store: PlayerStore): boolean {
  return sessions.has(store)
}

/**
 * Plays the story from the start and records it. Resolves when the file was handed to the browser, or with why
 * not. Must be called from a click (it resumes the audio context and starts playback).
 */
export async function recordVideo(store: PlayerStore, fileName: string): Promise<VideoResult> {
  const support = recordingSupport()
  const canvas = canvases.get(store)
  if (!support || !canvas) return 'unsupported'
  if (sessions.has(store)) return 'failed'

  const engine = soundEngineFor(store)
  engine.unlock()
  try {
    await (engine.context as AudioContext | null)?.resume?.()
    // the subtitle face must be loaded before the first frame is drawn with it
    // (with Croatian letters, so the latin-ext part of the font is fetched too)
    await document.fonts?.load(`500 32px ${SUBTITLE_FONT}`, 'Aa čćđšž ČĆĐŠŽ')
    await document.fonts?.ready
  } catch {
    // no audio is still a video
  }
  let recorder: StoryRecorder
  try {
    recorder = new StoryRecorder(canvas, engine.captureStream(), support.mimeType)
  } catch {
    return 'failed'
  }

  const wasMuted = store.getState().muted
  return new Promise<VideoResult>((resolve) => {
    let finished = false
    const cleanups: (() => void)[] = []
    const finish = (result: VideoResult) => {
      if (finished) return
      finished = true
      cleanups.forEach((c) => c())
      sessions.delete(store)
      store.getState().setRecording(false)
      store.getState().setMuted(wasMuted)
      store.getState().setVideoResult(result)
      if (result === 'saved') {
        recorder
          .stop()
          .then((blob) => {
            if (blob.size === 0) return resolve('failed')
            downloadBlob(blob, `${fileName}.${recorder.extension}`)
            resolve('saved')
          })
          .catch(() => resolve('failed'))
      } else {
        recorder.cancel()
        resolve(result)
      }
    }
    sessions.set(store, { recorder, finish, curtainSince: performance.now(), curtain: null })

    // A hidden tab stops drawing frames while the recorder keeps the clock: the file would freeze. Stop instead.
    const onHidden = () => document.visibilityState === 'hidden' && finish('hidden')
    document.addEventListener('visibilitychange', onHidden)
    cleanups.push(() => document.removeEventListener('visibilitychange', onHidden))

    // Ends with the story (after a short tail), or after a hard limit should the story never end.
    // (only after the replay has really started: the store is still on the old end card while we set it up)
    let tail: ReturnType<typeof setTimeout> | undefined
    let replaying = false
    cleanups.push(store.subscribe((s) => {
      if (s.phase === 'playing') replaying = true
      if (replaying && s.phase === 'ended' && !tail) tail = setTimeout(() => finish('saved'), TAIL_MS)
    }))
    cleanups.push(() => clearTimeout(tail))
    const limit = setTimeout(() => finish('failed'), (totalDuration(store.getState().scenes) + 60) * 1000)
    cleanups.push(() => clearTimeout(limit))

    const s = store.getState()
    s.setMuted(false) // the narrator only speaks when not muted; the setting comes back afterwards
    s.setRecording(true)
    s.restart()
  })
}

export function cancelVideo(store: PlayerStore) {
  sessions.get(store)?.finish('cancelled')
}

/** Inside the Canvas: remembers the canvas and copies each rendered frame while a recording runs. */
export function RecordFrames() {
  const store = usePlayerStore()
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    canvases.set(store, gl.domElement)
    return () => {
      sessions.get(store)?.finish('cancelled')
      canvases.delete(store)
    }
  }, [store, gl])
  // After the composer (1) and the picture capture (2): the frame is complete and still in the drawing buffer.
  useFrame(() => {
    const session = sessions.get(store)
    if (!session) return
    session.recorder.draw(gl.domElement, overlay(store.getState(), session, performance.now()))
  }, 3)
  return null
}

// Playback state of one player instance. Discrete state lives in a zustand store (React re-renders on it);
// per-frame values (times, poses) live in the mutable `clock` object that only the render loop touches.

import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { StoryPlan, StoryView } from '../../api/types'
import { compileStory, sampleScene, type ActorPose, type CompiledScene } from './timeline'

export type Phase = 'title' | 'playing' | 'ended'
export type Quality = 'low' | 'medium' | 'high'
export type CurtainKind = 'iris' | 'fade'

export const COVER_MS = 520
export const REVEAL_MS = 700
/** A scene never waits longer than this for the narrator to finish. */
const MAX_NARRATION_OVERTIME = 9

export interface Clock {
  /** Seconds inside the current scene. */
  sceneTime: number
  /** Continuous time for idle life (breathing, wind, particles); stops only on user pause. */
  animTime: number
  /** Incremented on every hard cut so the camera snaps instead of flying. */
  cut: number
  /** True while the speech synthesiser is reading the current scene. */
  speaking: boolean
  poses: Record<string, ActorPose>
  /** Set by the UI, taken by the render loop right after a frame is drawn. */
  captureRequest: ((dataUrl: string) => void) | null
}

export interface PlayerState {
  story: StoryView
  plan: StoryPlan
  scenes: CompiledScene[]
  phase: Phase
  playing: boolean
  sceneIndex: number
  curtain: { kind: CurtainKind; stage: 'cover' | 'reveal' } | null
  muted: boolean
  quality: Quality
  /** Bumped whenever the current scene restarts, so narration and subtitles start again. */
  sceneRun: number
  clock: Clock

  start(): void
  toggle(): void
  pause(): void
  resume(): void
  next(): void
  previous(): void
  restart(): void
  goTo(index: number, kind?: CurtainKind): void
  seek(index: number, time: number): void
  setMuted(muted: boolean): void
  setQuality(quality: Quality): void
  tick(dt: number): void
  dispose(): void
}

/** Rough time needed to read a subtitle; used when nobody is speaking it. */
export function readingTime(text: string) {
  return 1.2 + text.length * 0.055
}

export function createPlayerStore(story: StoryView, options?: { muted?: boolean; quality?: Quality }) {
  const plan = story.plan
  if (!plan) throw new Error('Story has no plan')
  const scenes = compileStory(plan)
  let timers: ReturnType<typeof setTimeout>[] = []
  const later = (fn: () => void, ms: number) => {
    timers.push(setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers = []
  }

  return createStore<PlayerState>()((set, get) => {
    const clock: Clock = {
      sceneTime: 0,
      animTime: 0,
      cut: 0,
      speaking: false,
      poses: sampleScene(scenes[0], 0),
      captureRequest: null,
    }

    const jump = (index: number, time: number) => {
      clock.sceneTime = time
      clock.speaking = false
      clock.cut++
      clock.poses = sampleScene(scenes[index], time)
      set((s) => ({ sceneIndex: index, sceneRun: s.sceneRun + 1 }))
    }

    return {
      story,
      plan,
      scenes,
      phase: 'title',
      playing: false,
      sceneIndex: 0,
      curtain: null,
      muted: options?.muted ?? false,
      quality: options?.quality ?? 'high',
      sceneRun: 0,
      clock,

      start() {
        clearTimers()
        jump(0, 0)
        set({ phase: 'playing', playing: true, curtain: { kind: 'iris', stage: 'reveal' } })
        later(() => set({ curtain: null }), REVEAL_MS)
      },
      toggle() {
        const s = get()
        if (s.phase === 'title' || s.phase === 'ended') s.start()
        else set({ playing: !s.playing })
      },
      pause: () => set({ playing: false }),
      resume: () => get().phase === 'playing' && set({ playing: true }),
      next() {
        const s = get()
        if (s.phase !== 'playing') return
        if (s.sceneIndex + 1 < scenes.length) s.goTo(s.sceneIndex + 1)
        else {
          clock.sceneTime = scenes[s.sceneIndex].duration
          set({ phase: 'ended', playing: false })
        }
      },
      previous() {
        const s = get()
        if (s.phase === 'ended') {
          set({ phase: 'playing', playing: true })
          s.goTo(scenes.length - 1)
          return
        }
        if (s.phase !== 'playing') return
        // Like a music player: early in a scene go back one, later just restart the scene.
        const target = clock.sceneTime > 2.5 || s.sceneIndex === 0 ? s.sceneIndex : s.sceneIndex - 1
        s.goTo(target)
      },
      restart: () => get().start(),
      goTo(index, kind) {
        const s = get()
        if (index < 0 || index >= scenes.length) return
        const changesPlace = scenes[index].scene.environment !== scenes[s.sceneIndex].scene.environment
        clearTimers()
        set({ curtain: { kind: kind ?? (changesPlace ? 'iris' : 'fade'), stage: 'cover' } })
        later(() => {
          jump(index, 0)
          set((cur) => ({ curtain: cur.curtain && { ...cur.curtain, stage: 'reveal' } }))
          later(() => set({ curtain: null }), REVEAL_MS)
        }, COVER_MS)
      },
      seek(index, time) {
        clearTimers()
        const i = Math.min(Math.max(0, index), scenes.length - 1)
        jump(i, Math.min(Math.max(0, time), scenes[i].duration))
        clock.animTime = time
        set({ phase: 'playing', playing: false, curtain: null })
      },
      setMuted: (muted) => set({ muted }),
      setQuality: (quality) => set({ quality }),

      tick(dt) {
        const s = get()
        const step = Math.min(dt, 0.1)
        if (s.playing || s.phase !== 'playing') clock.animTime += step
        const scene = scenes[s.sceneIndex]
        if (s.phase === 'playing' && s.playing && s.curtain?.stage !== 'cover') {
          clock.sceneTime += step
          const read = s.muted || !clock.speaking ? readingTime(scene.scene.narration) : 0
          const waiting = clock.speaking && clock.sceneTime < scene.duration + MAX_NARRATION_OVERTIME
          if (clock.sceneTime >= Math.max(scene.duration, read) && !waiting && !s.curtain) {
            if (s.sceneIndex + 1 < scenes.length) s.goTo(s.sceneIndex + 1)
            else set({ phase: 'ended', playing: false })
          }
        }
        clock.poses = sampleScene(scene, Math.min(clock.sceneTime, scene.duration))
      },
      dispose: clearTimers,
    }
  })
}

export type PlayerStore = StoreApi<PlayerState>

export const PlayerContext = createContext<PlayerStore | null>(null)

export function usePlayerStore(): PlayerStore {
  const store = useContext(PlayerContext)
  if (!store) throw new Error('Player components must be rendered inside <Player>')
  return store
}

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  return useStore(usePlayerStore(), selector)
}

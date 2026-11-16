import { useEffect } from 'react'
import { usePlayer, usePlayerStore, type PlayerStore } from '../engine/store'
import { SoundEngine, type AudioSnapshot } from './engine'
import { mixLevels } from './mix'
import { cuesBetween, soundscapeFor, stepInterval } from './soundscape'

const engines = new WeakMap<PlayerStore, SoundEngine>()

/** The sound engine of one player (created lazily; it makes no sound until unlocked by Play). */
export function soundEngineFor(store: PlayerStore): SoundEngine {
  let engine = engines.get(store)
  if (!engine) {
    engine = new SoundEngine()
    engines.set(store, engine)
  }
  return engine
}

declare global {
  interface Window {
    /** Read-only view of the player's audio state, for automated checks (audio cannot be listened to there). */
    __dioramaAudio?: () => AudioSnapshot
  }
}

const TICK_MS = 80

/** Ambience, weather and action sounds, in step with play / pause / mute / narrator / scene changes. */
export function useSoundscape() {
  const store = usePlayerStore()
  const sceneIndex = usePlayer((s) => s.sceneIndex)

  useEffect(() => {
    const engine = soundEngineFor(store)
    // Unlock inside the Play gesture itself: the store changes synchronously in the click handler.
    const unlockOnPlay = (phase: string) => {
      if (phase === 'playing' && !engine.unlocked) engine.unlock()
    }
    unlockOnPlay(store.getState().phase)
    const unsubscribe = store.subscribe((s) => unlockOnPlay(s.phase))
    window.__dioramaAudio = () => engine.snapshot()
    return () => {
      unsubscribe()
      engine.dispose()
      engines.delete(store)
      if (window.__dioramaAudio) delete window.__dioramaAudio
    }
  }, [store])

  useEffect(() => {
    const state = store.getState()
    soundEngineFor(store).setScene(soundscapeFor(state.scenes[sceneIndex].scene, state.plan.mood))
  }, [store, sceneIndex])

  useEffect(() => {
    const engine = soundEngineFor(store)
    let last = { index: -1, run: -1, time: 0 }
    const lastStep: Record<string, number> = {}
    const timer = setInterval(() => {
      const state = store.getState()
      const { clock } = state
      engine.setLevels(
        mixLevels({
          muted: state.muted,
          playing: state.playing,
          phase: state.phase,
          speaking: clock.speaking,
          covering: state.curtain?.stage === 'cover',
        }),
      )
      if (state.phase !== 'playing' || !state.playing || state.muted) return

      const compiled = state.scenes[state.sceneIndex]
      const spec = soundscapeFor(compiled.scene, state.plan.mood)
      const magical = state.plan.mood === 'magical'
      const time = clock.sceneTime
      const fresh = last.index !== state.sceneIndex || last.run !== state.sceneRun || time < last.time
      if (!fresh) {
        for (const cue of cuesBetween(compiled, last.time, time)) engine.cue(cue.kind, spec.surface, magical)
      }
      last = { index: state.sceneIndex, run: state.sceneRun, time }

      for (const [key, pose] of Object.entries(clock.poses)) {
        const interval = pose.visible ? stepInterval(pose.motion, pose.speed) : null
        if (interval === null || pose.lift > 0.05) continue
        if (clock.animTime - (lastStep[key] ?? -Infinity) >= interval) {
          lastStep[key] = clock.animTime
          engine.cue('step', spec.surface)
        }
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [store])
}

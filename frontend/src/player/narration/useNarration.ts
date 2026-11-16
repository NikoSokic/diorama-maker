import { useEffect, useMemo, useRef } from 'react'
import { usePlayer, usePlayerStore } from '../engine/store'
import { Narrator } from './speech'

/** Wait for the curtain to open before the narrator starts. */
const SPEAK_DELAY_MS = 420

/** Reads each scene aloud once, in step with play / pause / mute. */
export function useNarration() {
  const store = usePlayerStore()
  const narrator = useMemo(() => new Narrator(), [])
  const phase = usePlayer((s) => s.phase)
  const playing = usePlayer((s) => s.playing)
  const muted = usePlayer((s) => s.muted)
  const sceneRun = usePlayer((s) => s.sceneRun)
  const spoken = useRef(-1)

  // Start: once per scene run, and only while the story is actually running.
  useEffect(() => {
    if (phase !== 'playing' || muted || !playing || spoken.current === sceneRun) return
    const timer = setTimeout(() => {
      const state = store.getState()
      const { clock } = state
      spoken.current = sceneRun
      narrator.speak(state.scenes[state.sceneIndex].scene.narration, state.plan.language, {
        onStart: () => {
          clock.speaking = true
        },
        onEnd: () => {
          clock.speaking = false
        },
      })
    }, SPEAK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [store, narrator, phase, muted, playing, sceneRun])

  // Stop: when the scene changes, the story ends or the sound is switched off.
  useEffect(
    () => () => {
      narrator.cancel()
      store.getState().clock.speaking = false
    },
    [store, narrator, phase, muted, sceneRun],
  )

  useEffect(() => {
    if (playing) narrator.resume()
    else narrator.pause()
  }, [narrator, playing])
}

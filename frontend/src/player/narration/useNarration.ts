import { useEffect, useMemo, useRef } from 'react'
import { soundEngineFor } from '../audio/useSoundscape'
import { usePlayer, usePlayerStore } from '../engine/store'
import { ClipNarrator } from './clipNarrator'
import { Narrator, type SpeakHandlers } from './speech'

/** Wait for the curtain to open before the narrator starts. */
const SPEAK_DELAY_MS = 420

/**
 * Reads each scene aloud once, in step with play / pause / mute: with the story's generated voice when it has one,
 * otherwise (or when a clip cannot play) with the browser's voice. Either way `clock.speaking` is what the
 * subtitles, the scene timing and the ambience ducking follow.
 */
export function useNarration() {
  const store = usePlayerStore()
  const narrator = useMemo(() => new Narrator(), [])
  const clips = useMemo(() => new ClipNarrator({ route: (el) => soundEngineFor(store).route(el) }), [store])
  const phase = usePlayer((s) => s.phase)
  const playing = usePlayer((s) => s.playing)
  const muted = usePlayer((s) => s.muted)
  const sceneRun = usePlayer((s) => s.sceneRun)
  const spoken = useRef(-1)

  useEffect(() => {
    // The first scene's clip is fetched while the title card is still up.
    const first = store.getState().story.narration?.[0]
    if (first?.url) clips.preload(first.url).catch(() => {})
    return () => clips.dispose()
  }, [store, clips])

  // Start: once per scene run, and only while the story is actually running.
  useEffect(() => {
    if (phase !== 'playing' || muted || !playing || spoken.current === sceneRun) return
    const timer = setTimeout(() => {
      const state = store.getState()
      const { clock, sceneIndex } = state
      spoken.current = sceneRun
      const handlers: SpeakHandlers = {
        onStart: () => {
          clock.speaking = true
        },
        onEnd: () => {
          clock.speaking = false
        },
      }
      const text = state.scenes[sceneIndex].scene.narration
      const readAloud = () => narrator.speak(text, state.plan.language, handlers)
      const clip = state.story.narration?.[sceneIndex]
      if (clip?.url) {
        clips.speak(clip.url, {
          ...handlers,
          // Only if this scene is still the one on stage.
          onFail: () => {
            const now = store.getState()
            if (now.sceneRun === sceneRun && now.sceneIndex === sceneIndex && !now.muted) readAloud()
          },
        })
      } else {
        readAloud()
      }
      const next = state.story.narration?.[sceneIndex + 1]
      if (next?.url) clips.preload(next.url).catch(() => {})
    }, SPEAK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [store, narrator, clips, phase, muted, playing, sceneRun])

  // Stop: when the scene changes, the story ends or the sound is switched off.
  useEffect(
    () => () => {
      narrator.cancel()
      clips.cancel()
      store.getState().clock.speaking = false
    },
    [store, narrator, clips, phase, muted, sceneRun],
  )

  useEffect(() => {
    if (playing) {
      narrator.resume()
      clips.resume()
    } else {
      narrator.pause()
      clips.pause()
    }
  }, [narrator, clips, playing])
}

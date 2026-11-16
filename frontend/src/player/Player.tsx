import './player.css'

import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { NoToneMapping } from 'three'
import type { Lang, StoryView } from '../api/types'
import { createPlayerStore, PlayerContext, usePlayer, type PlayerStore, type Quality } from './engine/store'
import { useSoundscape } from './audio/useSoundscape'
import { useNarration } from './narration/useNarration'
import { Stage } from './Stage'
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary'
import { Controls, Curtain, EndCard, NoStage, Subtitles, TitleCard } from './ui/Overlay'
import { PLAYER_STRINGS } from './ui/strings'

export interface PlayerProps {
  story: StoryView
  /** Language of the buttons; defaults to the language of the story. */
  uiLang?: Lang
  /** Pins the render quality; without it the player starts from a guess and adapts to the frame rate. */
  quality?: Quality
  /** Link offered by the share buttons; defaults to the current address. */
  shareUrl?: string
  muted?: boolean
  /** Open paused at this moment instead of on the title card (previews, screenshots). */
  initial?: { scene: number; time: number }
  /** Hide all buttons and cards (the home page uses the player as a moving backdrop). */
  bare?: boolean
  /** Called with the store once it exists; lets tests and tools drive the player. */
  onStore?: (store: PlayerStore) => void
}

const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 1.75] }
const LOWER: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' }

function guessQuality(): Quality {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 8
  return coarse || cores <= 4 ? 'medium' : 'high'
}

function Narration() {
  useNarration()
  return null
}

function Soundscape() {
  useSoundscape()
  return null
}

function Shell({ store, fixedQuality, uiLang, shareUrl, bare }: { store: PlayerStore; fixedQuality: boolean; uiLang?: Lang; shareUrl?: string; bare?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const quality = usePlayer((s) => s.quality)
  const lang = usePlayer((s) => s.plan.language)
  const playing = usePlayer((s) => s.playing)
  const phase = usePlayer((s) => s.phase)
  const t =PLAYER_STRINGS[uiLang ?? lang] ?? PLAYER_STRINGS.hr
  const [active, setActive] = useState(true)
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const press = useRef<{ x: number; y: number; at: number } | null>(null)

  const wake = useCallback(() => {
    setActive(true)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setActive(false), 3200)
  }, [])

  useEffect(() => {
    // The buttons start visible; only the countdown to hiding them has to be started.
    idle.current = setTimeout(() => setActive(false), 3200)
    return () => clearTimeout(idle.current)
  }, [])

  // Nothing is drawn while the player is scrolled out of view (the home page backdrop, mostly).
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // As a backdrop the story simply starts over when it ends.
  useEffect(() => {
    if (bare && phase === 'ended') store.getState().start()
  }, [store, bare, phase])

  // Nobody touches the screen during a story: keep a phone from dimming while it plays.
  useEffect(() => {
    if (bare || !playing || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (released) void sentinel.release()
        else lock = sentinel
      })
      .catch(() => undefined)
    return () => {
      released = true
      void lock?.release().catch(() => undefined)
    }
  }, [bare, playing])

  const fullscreen = useCallback(() => {
    const el = root.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => undefined)
  }, [])
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled

  useEffect(() => {
    if (bare) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && event.key === ' ') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const s = store.getState()
      switch (event.key) {
        case ' ':
        case 'k':
          s.toggle()
          break
        case 'ArrowRight':
          s.next()
          break
        case 'ArrowLeft':
          s.previous()
          break
        case 'm':
          s.setMuted(!s.muted)
          break
        case 'r':
          s.restart()
          break
        case 'f':
          fullscreen()
          break
        default:
          return
      }
      event.preventDefault()
      wake()
    }
    // A hidden tab stops rendering; stop the story (and the narrator) with it.
    const onVisibility = () => {
      if (document.hidden) store.getState().pause()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [store, bare, fullscreen, wake])

  // A tap on the picture toggles play / pause; a drag (orbiting while paused) does not.
  const onPointerDown = (event: PointerEvent) => {
    press.current = { x: event.clientX, y: event.clientY, at: event.timeStamp }
  }
  const onPointerUp = (event: PointerEvent) => {
    const start = press.current
    press.current = null
    if (!start || bare) return
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved < 8 && event.timeStamp - start.at < 350 && store.getState().phase === 'playing') store.getState().toggle()
  }

  return (
    <div ref={root} className={`dm-player ${playing && !active ? 'dm-quiet' : ''}`} onPointerMove={wake} onPointerDownCapture={wake}>
      <div className="dm-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <CanvasErrorBoundary fallback={<NoStage t={t} />}>
        <Canvas
          flat
          frameloop={inView ? 'always' : 'never'}
          shadows={quality === 'low' ? false : 'soft'}
          dpr={DPR[quality]}
          gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
          camera={{ fov: 34, near: 0.5, far: 400, position: [0, 7, 18] }}
        >
          <PlayerContext.Provider value={store}>
            {!fixedQuality && (
              <PerformanceMonitor onDecline={() => store.getState().setQuality(LOWER[store.getState().quality])} flipflops={3} />
            )}
            <Stage />
          </PlayerContext.Provider>
        </Canvas>
        </CanvasErrorBoundary>
      </div>
      {!bare && (
        <>
          <Narration />
          <Soundscape />
          <Subtitles />
          <Controls t={t} visible={active} onFullscreen={canFullscreen ? fullscreen : undefined} />
          <TitleCard t={t} />
          <EndCard t={t} shareUrl={shareUrl ?? (typeof window !== 'undefined' ? window.location.href : '')} />
        </>
      )}
      <Curtain />
    </div>
  )
}

export default function Player({ story, uiLang, quality, shareUrl, muted, initial, bare, onStore }: PlayerProps) {
  const store = useMemo(
    () => createPlayerStore(story, { muted: muted ?? bare, quality: quality ?? guessQuality() }),
    // The store belongs to one story; option changes after mount go through the store itself.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [story],
  )

  useEffect(() => {
    onStore?.(store)
    if (initial) store.getState().seek(initial.scene, initial.time)
    else if (bare) store.getState().start()
    return () => store.getState().dispose()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  return (
    <PlayerContext.Provider value={store}>
      <Shell store={store} fixedQuality={quality !== undefined} uiLang={uiLang} shareUrl={shareUrl} bare={bare} />
    </PlayerContext.Provider>
  )
}

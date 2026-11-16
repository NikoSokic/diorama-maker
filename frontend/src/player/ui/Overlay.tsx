import { useProgress } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { COVER_MS, readingTime, REVEAL_MS, usePlayer, usePlayerStore } from '../engine/store'
import {
  CameraIcon,
  FullscreenIcon,
  LinkIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RestartIcon,
  ShareIcon,
  SoundOffIcon,
  SoundOnIcon,
} from './icons'
import { canWebShare, copyText, saveScreenshot, webShare } from './share'
import type { PlayerStrings } from './strings'

/** Iris wipe (new place) or fade (same place) between scenes. */
export function Curtain() {
  const curtain = usePlayer((s) => s.curtain)
  if (!curtain) return null
  const ms = curtain.stage === 'cover' ? COVER_MS : REVEAL_MS
  return <div className={`dm-curtain dm-curtain-${curtain.kind} dm-curtain-${curtain.stage}`} style={{ animationDuration: `${ms}ms` }} />
}

/** Large subtitles; the words arrive one by one at reading speed and stop with the story. */
export function Subtitles() {
  const phase = usePlayer((s) => s.phase)
  const playing = usePlayer((s) => s.playing)
  const sceneRun = usePlayer((s) => s.sceneRun)
  const text = usePlayer((s) => s.scenes[s.sceneIndex].scene.narration)
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  if (phase !== 'playing' || words.length === 0) return null
  const perWord = Math.min(0.32, (readingTime(text) * 0.62) / words.length)
  return (
    <div className="dm-subtitles" aria-live="polite">
      <p key={sceneRun} className={playing ? '' : 'dm-paused'}>
        {words.map((word, i) => (
          <span key={i} style={{ animationDelay: `${0.35 + i * perWord}s` }}>
            {word}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  children,
  primary,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
}) {
  return (
    <button type="button" className={`dm-round ${primary ? 'dm-round-primary' : ''}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

/** One segment per scene; the current one fills as the scene plays. */
function ProgressBar({ label }: { label: string }) {
  const store = usePlayerStore()
  const scenes = usePlayer((s) => s.scenes)
  const sceneIndex = usePlayer((s) => s.sceneIndex)
  const ended = usePlayer((s) => s.phase === 'ended')
  const fill = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      const state = store.getState()
      const scene = state.scenes[state.sceneIndex]
      const total = Math.max(scene.duration, state.muted ? readingTime(scene.scene.narration) : scene.duration)
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, state.clock.sceneTime / total)})`
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [store])

  return (
    <div className="dm-progress">
      {scenes.map((scene, i) => (
        <button
          key={i}
          type="button"
          style={{ flexGrow: scene.duration }}
          aria-label={`${label} ${i + 1}`}
          aria-current={i === sceneIndex ? 'step' : undefined}
          onClick={() => store.getState().goTo(i)}
        >
          {(i < sceneIndex || ended) && <span className="dm-progress-done" />}
          {i === sceneIndex && !ended && <span ref={fill} className="dm-progress-fill" />}
        </button>
      ))}
    </div>
  )
}

export function Controls({ t, visible, onFullscreen }: { t: PlayerStrings; visible: boolean; onFullscreen?: () => void }) {
  const store = usePlayerStore()
  const phase = usePlayer((s) => s.phase)
  const playing = usePlayer((s) => s.playing)
  const muted = usePlayer((s) => s.muted)
  const sceneIndex = usePlayer((s) => s.sceneIndex)
  const count = usePlayer((s) => s.scenes.length)
  const title = usePlayer((s) => s.plan.title)
  if (phase !== 'playing') return null
  const actions = store.getState()

  return (
    <div className={`dm-controls ${visible || !playing ? '' : 'dm-hidden'}`}>
      {!playing && <div className="dm-hint">{t.pausedHint}</div>}
      <ProgressBar label={t.scene} />
      <div className="dm-buttons">
        <div className="dm-group">
          <RoundButton label={t.restart} onClick={actions.restart}>
            <RestartIcon />
          </RoundButton>
          <span className="dm-counter">
            {sceneIndex + 1} / {count}
          </span>
        </div>
        <div className="dm-group">
          <RoundButton label={t.previous} onClick={actions.previous}>
            <PreviousIcon />
          </RoundButton>
          <RoundButton label={playing ? t.pause : t.resume} onClick={actions.toggle} primary>
            {playing ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
          </RoundButton>
          <RoundButton label={t.next} onClick={actions.next}>
            <NextIcon />
          </RoundButton>
        </div>
        <div className="dm-group">
          <RoundButton label={muted ? t.unmute : t.mute} onClick={() => actions.setMuted(!muted)}>
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </RoundButton>
          <RoundButton label={t.savePicture} onClick={() => void saveScreenshot(store, title)}>
            <CameraIcon />
          </RoundButton>
          {onFullscreen && (
            <RoundButton label={t.fullscreen} onClick={onFullscreen}>
              <FullscreenIcon />
            </RoundButton>
          )}
        </div>
      </div>
    </div>
  )
}

/** Longest the Play button waits for models; after that the story may start with stand-ins. */
const MAX_LOADING_MS = 8000

export function TitleCard({ t }: { t: PlayerStrings }) {
  const store = usePlayerStore()
  const phase = usePlayer((s) => s.phase)
  const plan = usePlayer((s) => s.plan)
  const { active, progress } = useProgress()
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), MAX_LOADING_MS)
    return () => clearTimeout(timer)
  }, [])
  const loading = active && !waited
  if (phase !== 'title') return null
  return (
    <div className="dm-card-layer dm-title-layer">
      <div className="dm-title">
        <span className="dm-eyebrow">{t.storyLabel}</span>
        <h1>{plan.title}</h1>
        <ul className="dm-cast">
          {plan.characters.map((c, i) => (
            <li key={c.key} style={{ background: plan.palette[i % Math.max(1, plan.palette.length)] }}>
              {c.displayName}
            </li>
          ))}
        </ul>
        {loading ? (
          <button type="button" className="dm-big-button dm-loading" disabled>
            <span className="dm-spinner" />
            {t.loading} {Math.round(progress)} %
          </button>
        ) : (
          <button type="button" className="dm-big-button dm-pulse" onClick={() => store.getState().start()}>
            <PlayIcon size={30} />
            {t.play}
          </button>
        )}
      </div>
    </div>
  )
}

/** Shown instead of the stage when the browser cannot give us WebGL: the story is still there to read. */
export function NoStage({ t }: { t: PlayerStrings }) {
  const plan = usePlayer((s) => s.plan)
  return (
    <div className="dm-nostage">
      <div>
        <h1>{plan.title}</h1>
        <p className="dm-nostage-note">{t.noWebgl}</p>
        {plan.scenes.map((scene, i) => (
          <p key={i}>{scene.narration}</p>
        ))}
      </div>
    </div>
  )
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    on,
    () => {
      setOn(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setOn(false), 1800)
    },
  ]
}

export function EndCard({ t, shareUrl }: { t: PlayerStrings; shareUrl: string }) {
  const store = usePlayerStore()
  const phase = usePlayer((s) => s.phase)
  const title = usePlayer((s) => s.plan.title)
  const [copied, flashCopied] = useFlash()
  const [saved, flashSaved] = useFlash()
  if (phase !== 'ended') return null

  return (
    <div className="dm-card-layer dm-end-layer">
      <div className="dm-end">
        <h2>{t.theEnd}</h2>
        <p>{title}</p>
        <button type="button" className="dm-big-button" onClick={() => store.getState().restart()}>
          <RestartIcon />
          {t.replay}
        </button>
        <div className="dm-share">
          {canWebShare() && (
            <button type="button" className="dm-pill" onClick={() => void webShare({ title, text: t.shareText, url: shareUrl })}>
              <ShareIcon />
              {t.share}
            </button>
          )}
          <button
            type="button"
            className="dm-pill"
            onClick={() => void copyText(shareUrl).then((ok) => ok && flashCopied())}
          >
            <LinkIcon />
            {copied ? t.copied : t.copyLink}
          </button>
          <button
            type="button"
            className="dm-pill"
            onClick={() => void saveScreenshot(store, title).then((ok) => ok && flashSaved())}
          >
            <CameraIcon />
            {saved ? t.saved : t.savePicture}
          </button>
        </div>
      </div>
    </div>
  )
}

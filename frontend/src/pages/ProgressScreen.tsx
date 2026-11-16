import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { StoryCharacter, StoryView } from '../api/types'
import { BTN_GHOST } from '../components/Layout'
import { useI18n, useTitle } from '../i18n/I18n'

const KIND_EMOJI: Record<string, string> = { biped: '🧍', quadruped: '🐾', creature: '🐙', object: '📦' }
const KIND_FACE = ['🦊', '🐉', '🤖', '🐧', '🦄', '🐙']

/** Which of the four pipeline steps is running, from what the backend has reported so far. */
export function currentStep(story: StoryView | undefined): number {
  if (!story) return 0
  if (story.status === 'ANALYZING') return story.plan ? 1 : 0
  const chars = story.characters
  const done = chars.length > 0 && chars.every((c) => c.status === 'READY' || c.status === 'PLACEHOLDER')
  return done ? 3 : 2
}

function CharacterCard({ character, index }: { character: StoryCharacter; index: number }) {
  const { t } = useI18n()
  const [wiggle, setWiggle] = useState(0)
  const ready = character.status === 'READY' || character.status === 'PLACEHOLDER'
  const pct = ready ? 100 : Math.max(0, Math.min(99, Math.round(character.progress)))
  return (
    <li>
      <button
        type="button"
        aria-label={`${t.progress.poke}: ${character.displayName}`}
        onClick={() => setWiggle((n) => n + 1)}
        className="w-full rounded-3xl bg-white p-4 text-left text-[#3a2a4d] shadow-[0_5px_0_#e6d6b8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffcb52]"
      >
        <div key={wiggle} className={`flex items-center gap-3 ${wiggle ? 'dm-wiggle' : ''}`}>
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#fff0cf] text-3xl ${ready ? '' : 'dm-bob'}`} style={{ animationDelay: `${index * 0.2}s` }} aria-hidden="true">
            {ready ? KIND_FACE[index % KIND_FACE.length] : (KIND_EMOJI[character.kind] ?? '✨')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-lg font-semibold">{character.displayName}</span>
              <span className="font-display font-bold tabular-nums">{pct}%</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#3a2a4d]/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={character.displayName}>
              <div className="h-full rounded-full bg-[#ff7a59] transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-sm font-bold opacity-70">{t.progress.character[character.status]}</p>
          </div>
        </div>
      </button>
    </li>
  )
}

function Facts() {
  const { t } = useI18n()
  const [i, setI] = useState(() => Math.floor(Math.random() * t.facts.length))
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 7000)
    return () => clearInterval(id)
  }, [])
  const fact = t.facts[i % t.facts.length]
  return (
    <div className="rounded-3xl bg-[#ffcb52] p-4 text-[#3a2a4d] shadow-[0_5px_0_#d9a62f]" aria-live="off">
      <p className="font-display text-sm font-bold uppercase tracking-wide">💡 {t.progress.factLabel}</p>
      <p key={i} className="dm-fact mt-1 min-h-[3.5rem] text-lg font-bold leading-snug">
        {fact}
      </p>
    </div>
  )
}

/** The playful waiting screen: pipeline steps, one card per character, rotating fun facts. */
export function ProgressScreen({ story, lost }: { story?: StoryView; lost?: boolean }) {
  const { t } = useI18n()
  const title = story?.title ?? story?.plan?.title
  useTitle(title ?? t.progress.title)
  const step = currentStep(story)
  const keys = ['reading', 'cast', 'models', 'stage'] as const
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
  }
  const overall = Math.max(0, Math.min(100, Math.round(story?.progress ?? 0)))
  return (
    <main className="min-h-full bg-[#1d1533] px-4 py-6 text-[#fff7e8] sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <Link to="/" className="self-start text-sm font-bold opacity-80 hover:opacity-100">
          ← {t.appName}
        </Link>
        <header>
          <p className="font-display text-sm font-bold uppercase tracking-widest text-[#ffcb52]">{t.progress.title}</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{title ?? t.progress.untitled}</h1>
          {story?.text && <p className="mt-2 line-clamp-3 text-base font-semibold opacity-75">„{story.text}“</p>}
        </header>

        <div>
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span>{t.progress.overall}</span>
            <span className="tabular-nums">{overall}%</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={overall} aria-valuemin={0} aria-valuemax={100} aria-label={t.progress.overall}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#ffcb52] to-[#ff7a59] transition-[width] duration-700" style={{ width: `${overall}%` }} />
          </div>
        </div>

        <ol className="grid gap-2 sm:grid-cols-4" aria-label={t.progress.stepOf(step + 1, keys.length)}>
          {keys.map((key, i) => (
            <li
              key={key}
              aria-current={i === step ? 'step' : undefined}
              className={`rounded-2xl p-3 transition-colors ${i < step ? 'bg-white/10 opacity-80' : i === step ? 'bg-[#fff7e8] text-[#3a2a4d] shadow-[0_5px_0_#ffcb52]' : 'bg-white/5 opacity-50'}`}
            >
              <p className="font-display text-lg font-semibold">
                <span aria-hidden="true">{i < step ? '✓ ' : `${i + 1}. `}</span>
                {t.progress.steps[key].title}
              </p>
              <p className="text-sm font-semibold opacity-80">{t.progress.steps[key].text}</p>
            </li>
          ))}
        </ol>

        <section aria-labelledby="cast-title">
          <h2 id="cast-title" className="mb-2 font-display text-xl font-semibold">
            {t.progress.castTitle}
          </h2>
          {story && story.characters.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {story.characters.map((c, i) => (
                <CharacterCard key={c.key} character={c} index={i} />
              ))}
            </ul>
          ) : (
            <p className="rounded-3xl bg-white/10 p-4 font-semibold">{t.progress.castWaiting}</p>
          )}
        </section>

        <Facts />

        {story?.plan?.source === 'offline' && <p className="rounded-2xl bg-white/10 p-3 text-sm font-bold">{t.progress.simple}</p>}
        {lost && <p role="status" className="rounded-2xl bg-[#ff7a59]/25 p-3 text-sm font-bold">{t.progress.lost}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void copy()} className={BTN_GHOST}>
            {copied ? `✓ ${t.progress.copied}` : `🔗 ${t.progress.copyLink}`}
          </button>
          <p className="min-w-0 flex-1 text-sm font-semibold opacity-70">{t.progress.patience}</p>
        </div>
      </div>
    </main>
  )
}

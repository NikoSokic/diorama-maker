// What a scene should sound like, as plain data. The audio engine turns this into Web Audio nodes; keeping the
// decisions here makes them testable without an AudioContext. All sounds are synthesised in code (own work, CC0).

import type { EnvironmentId as Environment, Mood, PlanScene } from '../../api/types'
import type { CompiledScene } from '../engine/timeline'

/** Filtered noise that never stops: wind, surf, a hall's hum. `swell` slowly moves its volume (waves, gusts). */
export interface Bed {
  filter: 'lowpass' | 'bandpass'
  freq: number
  q: number
  level: number
  swell: { rate: number; depth: number }
}

export type Critter = 'birds' | 'crickets' | 'gulls' | 'bubbles' | 'drips' | 'none'
export type Surface = 'grass' | 'stone' | 'soft'

export interface Soundscape {
  /** Stable identity: the engine only crossfades when this changes. */
  id: string
  bed: Bed
  critters: Critter
  /** 0..1 */
  rain: number
  /** 0..1, gusty wind on top of the bed */
  wind: number
  thunder: boolean
  /** Soft chord under everything, MIDI note numbers. */
  pad: { notes: number[]; level: number }
  surface: Surface
}

const bed = (filter: Bed['filter'], freq: number, level: number, rate = 0.06, depth = 0.4, q = 0.7): Bed => ({
  filter,
  freq,
  q,
  level,
  swell: { rate, depth },
})

const BEDS: Record<Environment, Bed> = {
  meadow: bed('bandpass', 500, 0.05, 0.08, 0.5, 0.6),
  forest: bed('lowpass', 700, 0.06, 0.06, 0.45),
  beach: bed('lowpass', 900, 0.12, 0.12, 0.9),
  sea: bed('lowpass', 700, 0.12, 0.09, 0.8),
  castle: bed('lowpass', 300, 0.04, 0.03, 0.3),
  village: bed('lowpass', 600, 0.04, 0.05, 0.3),
  snowy_mountain: bed('bandpass', 800, 0.07, 0.1, 0.7, 1.5),
  space: bed('lowpass', 120, 0.05, 0.02, 0.3),
  underwater: bed('lowpass', 250, 0.12, 0.07, 0.4),
  cave: bed('lowpass', 200, 0.05, 0.03, 0.3),
  desert: bed('bandpass', 1200, 0.05, 0.12, 0.6, 0.8),
  city_park: bed('lowpass', 450, 0.06, 0.04, 0.25),
}

const OUTDOOR: ReadonlySet<Environment> = new Set(['meadow', 'forest', 'village', 'city_park', 'castle', 'desert', 'snowy_mountain'])
const STONE: ReadonlySet<Environment> = new Set(['castle', 'village', 'cave', 'city_park', 'space'])
const SOFT: ReadonlySet<Environment> = new Set(['beach', 'desert', 'snowy_mountain', 'underwater', 'sea'])

/** Chords per mood (MIDI); low and quiet, a bed for the story rather than a tune. */
const PADS: Record<Mood, number[]> = {
  cozy: [48, 55, 64], // C, G, E
  funny: [53, 60, 69], // F, C, A
  adventurous: [50, 57, 62, 66], // D, A, D, F#
  mysterious: [45, 52, 60], // A minor
  magical: [50, 57, 61, 64], // D maj7 colour
}

function critters(env: Environment, scene: PlanScene): Critter {
  if (env === 'underwater') return 'bubbles'
  if (env === 'cave') return 'drips'
  if (env === 'space') return 'none'
  if (scene.weather === 'rain') return 'none'
  const night = scene.timeOfDay === 'night'
  if (env === 'beach' || env === 'sea') return night ? 'none' : 'gulls'
  if (env === 'snowy_mountain' || env === 'desert') return night ? 'crickets' : 'none'
  if (OUTDOOR.has(env)) return night ? 'crickets' : 'birds'
  return 'none'
}

export function soundscapeFor(scene: PlanScene, mood: Mood): Soundscape {
  const env = scene.environment
  const indoorish = env === 'space' || env === 'underwater' || env === 'cave'
  const rain = scene.weather === 'rain' && !indoorish ? 1 : 0
  const baseWind = env === 'snowy_mountain' ? 0.5 : env === 'desert' ? 0.25 : 0
  const weatherWind = indoorish ? 0 : scene.weather === 'snow' ? 0.6 : scene.weather === 'fog' ? 0.3 : rain ? 0.35 : 0
  const wind = Math.max(baseWind, weatherWind)
  // The plan has no storm weather: rain at night or in a tense story gets distant thunder.
  const thunder = rain > 0 && (scene.timeOfDay === 'night' || mood === 'mysterious' || mood === 'adventurous')
  const surface: Surface = SOFT.has(env) ? 'soft' : STONE.has(env) ? 'stone' : 'grass'
  const notes = PADS[mood] ?? PADS.cozy
  const padLevel = env === 'space' ? 0.04 : mood === 'magical' || mood === 'mysterious' ? 0.028 : 0.02
  const critter = critters(env, scene)
  return {
    id: [env, scene.timeOfDay, scene.weather, mood].join('/'),
    bed: BEDS[env] ?? BEDS.meadow,
    critters: critter,
    rain,
    wind,
    thunder,
    pad: { notes, level: padLevel },
    surface,
  }
}

export type CueKind = 'hop' | 'pop' | 'chime' | 'whoosh'

export interface Cue {
  kind: CueKind
  character: string
  at: number
}

const CUES: Partial<Record<string, CueKind>> = {
  jump: 'hop',
  appear: 'pop',
  hide: 'pop',
  grow: 'chime',
  shrink: 'chime',
  spin: 'whoosh',
  celebrate: 'chime',
  dance: 'chime',
}

/** Action sounds whose start lies in (from, to]: the frame that crosses an action's start plays its sound. */
export function cuesBetween(scene: CompiledScene, from: number, to: number): Cue[] {
  if (to <= from) return []
  const out: Cue[] = []
  for (const track of Object.values(scene.tracks)) {
    for (const segment of track.segments) {
      const kind = CUES[segment.type]
      if (!kind) continue
      // A jump hops `count` times: one boing per hop.
      const hops = segment.type === 'jump' ? Math.max(1, segment.count) : 1
      for (let h = 0; h < hops; h++) {
        const at = segment.start + ((segment.end - segment.start) * h) / hops
        if (at > from && at <= to) out.push({ kind, character: track.key, at })
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Seconds between footsteps for a walking or running character, or null when it is not stepping. */
export function stepInterval(motion: string, speed: number): number | null {
  if (speed < 0.15) return null
  if (motion === 'run') return 0.26
  if (motion === 'walk') return 0.4
  return null
}

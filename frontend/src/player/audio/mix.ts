// Target volumes of the three buses, from the player's state. Pure, so the rules are testable.

import type { Phase } from '../engine/store'

export interface MixInput {
  muted: boolean
  playing: boolean
  phase: Phase
  /** The narrator (speech or generated audio) is talking. */
  speaking: boolean
  /** The curtain is closing between scenes. */
  covering: boolean
}

export interface MixLevels {
  master: number
  /** Ambience: bed, weather, critters, pad. */
  bed: number
  /** Footsteps, hops, chimes. */
  sfx: number
}

/** Ambience under the narrator: quiet enough that every word is clear. */
export const DUCK = 0.3
/** Ambience while the curtain changes the scene: the old scene fades out before the new one fades in. */
export const BETWEEN_SCENES = 0.25
const SFX_UNDER_VOICE = 0.7

export const SILENT: MixLevels = { master: 0, bed: 0, sfx: 0 }

export function mixLevels(input: MixInput): MixLevels {
  if (input.muted || input.phase !== 'playing' || !input.playing) return SILENT
  const bed = (input.speaking ? DUCK : 1) * (input.covering ? BETWEEN_SCENES : 1)
  return { master: 1, bed, sfx: input.speaking ? SFX_UNDER_VOICE : 1 }
}

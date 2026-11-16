// Procedural body animation: turns the engine's pose (what the character is doing) into squash, stretch,
// hops, leans and shakes. Pure and stateless, so any moment of the story can be rendered directly.

import type { Emotion } from '../../api/types'
import { clamp01, smoothstep } from '../engine/easing'
import type { ActorPose } from '../engine/timeline'

export interface BodyOffset {
  /** Height above the ground in units of the character's own height. */
  y: number
  /** Sideways shake in units of the character's own height. */
  x: number
  /** Scale along the body axis (y) and across it (x/z); volume is roughly preserved. */
  stretch: number
  squash: number
  /** Lean forward (+) / back (-), radians. */
  pitch: number
  /** Lean sideways, radians. */
  roll: number
  /** Extra turn on top of the heading, radians. */
  yaw: number
}

export interface BodyOptions {
  /** A skeletal clip already plays this motion: keep only a hint of the procedural layer. */
  skeletal: boolean
  /** Per-character phase offset so two characters never move in sync. */
  phase: number
  /** Jump height multiplier of the place (moon, under water). */
  bounce: number
}

const HOPS_PER_UNIT = 1.25

function emotionLayer(o: BodyOffset, emotion: Emotion, t: number, since: number, strength: number) {
  switch (emotion) {
    case 'happy':
      o.y += 0.05 * Math.abs(Math.sin(t * 3.4)) * strength
      o.roll += 0.05 * Math.sin(t * 1.7) * strength
      break
    case 'excited': {
      const hop = Math.abs(Math.sin(t * 5.2))
      o.y += 0.11 * hop * strength
      o.stretch += 0.06 * hop * strength
      o.roll += 0.04 * Math.sin(t * 5.2) * strength
      break
    }
    case 'sad':
      o.pitch += 0.3 * strength
      o.stretch -= 0.06 * strength
      o.roll += 0.03 * Math.sin(t * 0.9) * strength
      break
    case 'scared':
      o.x += 0.025 * Math.sin(t * 41) * strength
      o.pitch -= 0.14 * strength
      o.stretch -= 0.04 * strength
      break
    case 'surprised': {
      // A quick pop upwards that settles.
      const pop = Math.exp(-since * 3.2) * Math.cos(since * 14)
      o.stretch += 0.22 * pop * strength
      o.y += 0.12 * Math.max(0, pop) * strength
      o.pitch -= 0.1 * strength
      break
    }
    case 'angry':
      o.x += 0.012 * Math.sin(t * 27) * strength
      o.pitch += 0.16 * strength
      o.squash += 0.05 * strength
      o.y += 0.03 * Math.abs(Math.sin(t * 6.5)) * strength
      break
    case 'sleepy':
      o.roll += 0.11 * Math.sin(t * 0.8) * strength
      o.pitch += 0.16 + 0.05 * Math.sin(t * 0.8) * strength
      o.stretch += 0.03 * Math.sin(t * 1.1) * strength
      break
    default:
      break
  }
}

export function bodyOffset(pose: ActorPose, time: number, options: BodyOptions): BodyOffset {
  const t = time + options.phase
  const o: BodyOffset = { y: 0, x: 0, stretch: 1, squash: 1, pitch: 0, roll: 0, yaw: 0 }
  const full = options.skeletal ? 0.12 : 1

  // Breathing: always there, it is what makes a still toy look alive.
  const breath = Math.sin(t * 2.1)
  o.stretch += 0.022 * breath * (options.skeletal ? 0.4 : 1)
  o.roll += 0.012 * Math.sin(t * 0.83)

  switch (pose.motion) {
    case 'walk':
    case 'run': {
      const run = pose.motion === 'run'
      const cycle = pose.travel * HOPS_PER_UNIT * (run ? 0.8 : 1)
      const hop = Math.abs(Math.sin(cycle * Math.PI))
      // Fade the hops in and out with speed so the character settles when it arrives.
      const drive = smoothstep(0, 0.5, pose.speed) * full
      o.y += (run ? 0.26 : 0.16) * hop * drive
      // Squash on landing, stretch at the top.
      const s = (hop - 0.35) * (run ? 0.2 : 0.14) * drive
      o.stretch += s
      o.pitch += (run ? 0.26 : 0.1) * drive
      o.roll += (run ? 0.07 : 0.1) * Math.sin(cycle * Math.PI) * drive
      break
    }
    case 'jump': {
      const lift = pose.lift
      o.y += lift * 0.75 * options.bounce
      // Crouch right before and after touching the ground, stretch in the air.
      const ground = 1 - clamp01(lift * 3.5)
      o.stretch += (0.16 * Math.sin(lift * Math.PI * 0.5) - 0.2 * ground * (pose.progress > 0 && pose.progress < 1 ? 1 : 0)) * (options.skeletal ? 0.5 : 1)
      break
    }
    case 'spin':
      o.y += 0.12 * Math.sin(pose.progress * Math.PI) * full
      o.stretch += 0.08 * Math.sin(pose.progress * Math.PI) * full
      break
    case 'wave':
      o.roll += 0.2 * Math.sin(t * 7.5) * full
      o.y += 0.05 * Math.abs(Math.sin(t * 3.75)) * full
      o.pitch -= 0.06 * full
      break
    case 'dance': {
      const beat = t * 5.4
      o.y += 0.14 * Math.abs(Math.sin(beat)) * full
      o.roll += 0.2 * Math.sin(beat * 0.5) * full
      o.yaw += 0.55 * Math.sin(beat * 0.25) * full
      o.stretch += 0.08 * Math.sin(beat * 2) * full
      break
    }
    case 'celebrate': {
      const beat = t * 4.6
      const hop = Math.abs(Math.sin(beat))
      o.y += 0.3 * hop * options.bounce * full
      o.stretch += 0.14 * (hop - 0.4) * full
      o.yaw += 0.35 * Math.sin(beat * 0.5) * full
      break
    }
    default:
      break
  }

  // Emotions colour whatever the body is doing; strongest while standing still.
  const emotionStrength = (pose.motion === 'idle' ? 1 : 0.45) * (options.skeletal && pose.motion !== 'idle' ? 0.5 : 1)
  emotionLayer(o, pose.emotion, t, pose.motionTime, emotionStrength)

  // Keep the volume: what is gained in height is lost in width.
  o.stretch = Math.max(0.6, o.stretch)
  o.squash *= 1 / Math.sqrt(o.stretch)
  return o
}

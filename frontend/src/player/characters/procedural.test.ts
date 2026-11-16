import { describe, expect, it } from 'vitest'
import type { Emotion } from '../../api/types'
import type { ActorPose, Motion } from '../engine/timeline'
import { characterHeight } from './height'
import { bodyOffset } from './procedural'

const pose = (overrides: Partial<ActorPose> = {}): ActorPose => ({
  x: 0,
  z: 0,
  heading: 0,
  visible: true,
  scale: 1,
  emotion: 'neutral',
  motion: 'idle',
  motionTime: 1,
  progress: 0,
  travel: 0,
  speed: 0,
  pop: 1,
  lift: 0,
  exactHeading: false,
  ...overrides,
})

const options = { skeletal: false, phase: 0, bounce: 1 }
const MOTIONS: Motion[] = ['idle', 'walk', 'run', 'jump', 'spin', 'wave', 'dance', 'celebrate']
const EMOTIONS: Emotion[] = ['neutral', 'happy', 'sad', 'scared', 'surprised', 'angry', 'excited', 'sleepy']

describe('bodyOffset', () => {
  it('stays finite, above the ground and within toy proportions for every motion and emotion', () => {
    for (const motion of MOTIONS) {
      for (const emotion of EMOTIONS) {
        for (let t = 0; t < 12; t += 0.07) {
          const o = bodyOffset(pose({ motion, emotion, progress: (t / 12) % 1, travel: t, speed: 1.5, lift: Math.abs(Math.sin(t)), motionTime: t }), t, options)
          for (const value of Object.values(o)) expect(Number.isFinite(value)).toBe(true)
          expect(o.y).toBeGreaterThanOrEqual(0)
          expect(o.y).toBeLessThan(1.6)
          expect(o.stretch).toBeGreaterThanOrEqual(0.6)
          expect(o.stretch).toBeLessThan(1.6)
          // Volume is preserved: taller means thinner.
          expect(o.squash * o.squash * o.stretch).toBeGreaterThan(0.9)
          expect(o.squash * o.squash * o.stretch).toBeLessThan(1.25)
        }
      }
    }
  })

  it('breathes while standing still', () => {
    const values = new Set<string>()
    for (let t = 0; t < 3; t += 0.25) values.add(bodyOffset(pose(), t, options).stretch.toFixed(4))
    expect(values.size).toBeGreaterThan(6)
  })

  it('hops along the path while walking and higher while running', () => {
    const peak = (motion: Motion) => {
      let max = 0
      for (let travel = 0; travel < 4; travel += 0.02) max = Math.max(max, bodyOffset(pose({ motion, travel, speed: 2 }), 0, options).y)
      return max
    }
    expect(peak('walk')).toBeGreaterThan(0.1)
    expect(peak('run')).toBeGreaterThan(peak('walk'))
    // Standing at the destination: no hop left.
    expect(bodyOffset(pose({ motion: 'walk', travel: 3.3, speed: 0 }), 0, options).y).toBeLessThan(0.01)
  })

  it('mostly steps aside when a skeletal clip already plays the motion', () => {
    const p = pose({ motion: 'walk', travel: 0.4, speed: 2 })
    expect(bodyOffset(p, 0, { ...options, skeletal: true }).y).toBeLessThan(bodyOffset(p, 0, options).y * 0.3)
  })

  it('jumps higher where the place is bouncy', () => {
    const p = pose({ motion: 'jump', lift: 1, progress: 0.5 })
    expect(bodyOffset(p, 0, { ...options, bounce: 1.6 }).y).toBeGreaterThan(bodyOffset(p, 0, options).y * 1.4)
  })

  it('droops when sad and shakes when scared', () => {
    expect(bodyOffset(pose({ emotion: 'sad' }), 1, options).pitch).toBeGreaterThan(0.2)
    const xs = new Set<string>()
    for (let t = 0; t < 1; t += 0.03) xs.add(bodyOffset(pose({ emotion: 'scared' }), t, options).x.toFixed(4))
    expect(xs.size).toBeGreaterThan(10)
  })
})

describe('characterHeight', () => {
  it('compresses sizes so small and big characters share a frame', () => {
    expect(characterHeight(1)).toBeCloseTo(1.7)
    expect(characterHeight(0.01)).toBeGreaterThanOrEqual(0.75)
    expect(characterHeight(100)).toBeLessThanOrEqual(3.4)
    expect(characterHeight(2)).toBeGreaterThan(characterHeight(1))
    expect(characterHeight(2) / characterHeight(0.5)).toBeLessThan(4)
  })
})

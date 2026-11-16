import { describe, expect, it } from 'vitest'
import type { CameraType } from '../../api/types'
import { MOCK_STORIES } from '../../mock/stories'
import { fitFactor, handheld, shotFor, type Shot, type ShotInput } from './camera'
import { compileStory, sampleScene } from './timeline'

const story = MOCK_STORIES[0]
const scenes = compileStory(story.plan!)
const heights = Object.fromEntries(story.plan!.characters.map((c) => [c.key, 1.6]))

function input(sceneIndex: number, sceneTime: number, overrides: Partial<ShotInput> = {}): ShotInput {
  return {
    scene: scenes[sceneIndex],
    poses: sampleScene(scenes[sceneIndex], sceneTime),
    heights,
    sceneTime,
    animTime: sceneTime,
    aspect: 16 / 9,
    phase: 'playing',
    ...overrides,
  }
}

const distance = (shot: Shot) => Math.hypot(shot.position[0] - shot.target[0], shot.position[1] - shot.target[1], shot.position[2] - shot.target[2])

function expectSane(shot: Shot) {
  for (const value of [...shot.position, ...shot.target, shot.fov]) expect(Number.isFinite(value)).toBe(true)
  // Above the ground, in front of the stage, at a sensible distance and lens.
  expect(shot.position[1]).toBeGreaterThan(0.8)
  expect(shot.position[2]).toBeGreaterThan(shot.target[2])
  expect(distance(shot)).toBeGreaterThan(3)
  expect(distance(shot)).toBeLessThan(60)
  expect(shot.fov).toBeGreaterThanOrEqual(28)
  expect(shot.fov).toBeLessThanOrEqual(50)
}

describe('shotFor', () => {
  it('gives a sane shot for every scene, moment and screen shape of the bundled stories', () => {
    for (const mock of MOCK_STORIES) {
      const compiled = compileStory(mock.plan!)
      for (const scene of compiled) {
        for (const aspect of [0.46, 1, 16 / 9, 2.4]) {
          for (let t = 0; t <= scene.duration; t += 0.5) {
            expectSane(shotFor({ scene, poses: sampleScene(scene, t), heights: {}, sceneTime: t, animTime: t, aspect, phase: 'playing' }))
          }
        }
      }
    }
  })

  it('handles every camera type, with and without a target', () => {
    const types: CameraType[] = ['wide', 'closeup', 'orbit', 'follow', 'dolly_in', 'over_shoulder']
    for (const type of types) {
      for (const targetKey of [undefined, 'bip', 'nobody']) {
        const scene = { ...scenes[1], scene: { ...scenes[1].scene, camera: { type, targetKey } } }
        expectSane(shotFor(input(1, 5, { scene })))
      }
    }
  })

  it('falls back to a wide shot while the stage is still empty', () => {
    const scene = { ...scenes[0], scene: { ...scenes[0].scene, camera: { type: 'closeup' as const, targetKey: 'bip' } } }
    const shot = shotFor(input(0, 0, { scene, poses: sampleScene(scenes[0], 0) }))
    expect(distance(shot)).toBeGreaterThan(12)
  })

  it('comes closer for a close-up than for a wide shot', () => {
    const wide = shotFor(input(1, 5, { scene: { ...scenes[1], scene: { ...scenes[1].scene, camera: { type: 'wide' } } } }))
    const close = shotFor(input(1, 5, { scene: { ...scenes[1], scene: { ...scenes[1].scene, camera: { type: 'closeup', targetKey: 'bip' } } } }))
    expect(distance(close)).toBeLessThan(distance(wide) * 0.6)
  })

  it('moves in during a dolly shot', () => {
    const scene = { ...scenes[1], scene: { ...scenes[1].scene, camera: { type: 'dolly_in' as const, targetKey: 'bip' } } }
    const early = shotFor(input(1, 0.5, { scene, poses: sampleScene(scenes[1], 6) }))
    const late = shotFor(input(1, 7.5, { scene, poses: sampleScene(scenes[1], 6) }))
    expect(distance(late)).toBeLessThan(distance(early) - 3)
  })

  it('stands further back on a portrait screen', () => {
    expect(fitFactor(16 / 9)).toBe(1)
    expect(fitFactor(0.5)).toBeGreaterThan(1.3)
    const landscape = shotFor(input(0, 5))
    const portrait = shotFor(input(0, 5, { aspect: 0.5 }))
    expect(distance(portrait)).toBeGreaterThan(distance(landscape))
  })

  it('shows the whole island behind the title card', () => {
    const shot = shotFor(input(0, 0, { phase: 'title' }))
    expectSane(shot)
    expect(distance(shot)).toBeGreaterThan(20)
  })
})

describe('handheld', () => {
  it('stays small and never jumps', () => {
    let previous = handheld(0, 0.05)
    for (let t = 0.016; t < 60; t += 0.016) {
      const now = handheld(t, 0.05)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(now[i])).toBeLessThan(0.1)
        expect(Math.abs(now[i] - previous[i])).toBeLessThan(0.002)
      }
      previous = now
    }
  })
})

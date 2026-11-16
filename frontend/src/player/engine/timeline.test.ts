import { describe, expect, it } from 'vitest'
import type { PlanAction, PlanScene, StoryPlan } from '../../api/types'
import { MOCK_STORIES } from '../../mock/stories'
import { compileStory, ENTRY_RADIUS, MIN_SPACING, PLAY_RADIUS, restHeading, sampleScene, samplePose, totalDuration } from './timeline'

function plan(scenes: Partial<PlanScene>[], keys = ['a', 'b']): StoryPlan {
  return {
    title: 'Test',
    language: 'en',
    mood: 'cozy',
    palette: ['#ff0000'],
    characters: keys.map((key) => ({ key, displayName: key, kind: 'creature', relativeSize: 1 })),
    scenes: scenes.map((s) => ({
      environment: 'meadow',
      timeOfDay: 'day',
      weather: 'clear',
      narration: 'Once upon a time.',
      durationSec: 8,
      camera: { type: 'wide' },
      actions: [],
      ...s,
    })),
  }
}

const act = (characterKey: string, type: PlanAction['type'], startAt: number, duration: number, extra: Partial<PlanAction> = {}): PlanAction => ({
  characterKey,
  type,
  startAt,
  duration,
  ...extra,
})

describe('compileStory', () => {
  it('keeps characters who enter later off stage until they do', () => {
    const [scene] = compileStory(plan([{ actions: [act('a', 'enter', 2, 2, { to: { x: 1, z: 0 } })] }]))
    expect(samplePose(scene.tracks.a, 0).visible).toBe(false)
    expect(samplePose(scene.tracks.a, 1.9).visible).toBe(false)
    expect(samplePose(scene.tracks.a, 3).visible).toBe(true)
    // Somebody with no "enter" is simply there from the start.
    expect(samplePose(scene.tracks.b, 0).visible).toBe(true)
  })

  it('walks in from the rim and arrives exactly at the target', () => {
    const [scene] = compileStory(plan([{ actions: [act('a', 'enter', 0, 3, { to: { x: 2, z: 1 } })] }], ['a']))
    const start = samplePose(scene.tracks.a, 0.01)
    expect(Math.hypot(start.x, start.z)).toBeCloseTo(ENTRY_RADIUS, 0)
    expect(start.motion).toBe('walk')
    const end = samplePose(scene.tracks.a, 3.5)
    expect(end.x).toBeCloseTo(2)
    expect(end.z).toBeCloseTo(1)
    expect(end.motion).toBe('idle')
    // Having arrived, the character faces the audience again.
    expect(end.heading).toBeCloseTo(restHeading(2))
  })

  it('starts the next action facing the audience, not the direction of travel', () => {
    const [scene] = compileStory(
      plan([{ actions: [act('a', 'walk_to', 0, 2, { to: { x: -3, z: 0 } }), act('a', 'wave', 2, 2)] }], ['a']),
    )
    expect(samplePose(scene.tracks.a, 3).heading).toBeCloseTo(restHeading(-3))
  })

  it('never lets destinations leave the play area or overlap another character', () => {
    const [scene] = compileStory(
      plan([
        {
          actions: [act('a', 'walk_to', 0, 2, { to: { x: 40, z: -40 } }), act('b', 'walk_to', 0, 2, { to: { x: 40, z: -40 } })],
        },
      ]),
    )
    const poses = sampleScene(scene, 7)
    expect(Math.hypot(poses.a.x, poses.a.z)).toBeLessThanOrEqual(PLAY_RADIUS + 1e-6)
    expect(Math.hypot(poses.b.x, poses.b.z)).toBeLessThanOrEqual(PLAY_RADIUS + 1e-6)
    expect(Math.hypot(poses.a.x - poses.b.x, poses.a.z - poses.b.z)).toBeGreaterThan(MIN_SPACING * 0.5)
  })

  it('cuts an action short when the next one of the same character starts', () => {
    const [scene] = compileStory(
      plan([{ actions: [act('a', 'dance', 0, 6), act('a', 'jump', 2, 2)] }], ['a']),
    )
    expect(samplePose(scene.tracks.a, 1).motion).toBe('dance')
    expect(samplePose(scene.tracks.a, 2.5).motion).toBe('jump')
    expect(samplePose(scene.tracks.a, 4.5).motion).toBe('idle')
  })

  it('carries position, size and visibility into the next scene', () => {
    const scenes = compileStory(
      plan(
        [
          { actions: [act('a', 'walk_to', 0, 2, { to: { x: 3, z: 1 } }), act('a', 'grow', 3, 1), act('b', 'exit', 0, 2)] },
          { actions: [] },
        ],
      ),
    )
    const later = sampleScene(scenes[1], 0)
    expect(later.a.x).toBeCloseTo(3)
    expect(later.a.scale).toBeCloseTo(1.6)
    expect(later.b.visible).toBe(false)
  })

  it('turns towards the target of look_at and keeps looking', () => {
    const [scene] = compileStory(
      plan([{ actions: [act('a', 'walk_to', 0, 1, { to: { x: -3, z: 0 } }), act('b', 'walk_to', 0, 1, { to: { x: 3, z: 0 } }), act('a', 'look_at', 2, 1, { targetKey: 'b' })] }]),
    )
    // b stands to the right (+x) of a: heading +90 degrees.
    expect(samplePose(scene.tracks.a, 2.5).heading).toBeCloseTo(Math.PI / 2, 1)
    expect(samplePose(scene.tracks.a, 6).heading).toBeCloseTo(Math.PI / 2, 1)
  })

  it('makes a jump leave the ground and land again', () => {
    const [scene] = compileStory(plan([{ actions: [act('a', 'jump', 1, 0.85)] }], ['a']))
    expect(samplePose(scene.tracks.a, 1.42).lift).toBeGreaterThan(0.9)
    expect(samplePose(scene.tracks.a, 1.86).lift).toBe(0)
  })

  it('hides and shows characters with a pop', () => {
    const [scene] = compileStory(plan([{ actions: [act('a', 'hide', 1, 1), act('a', 'appear', 4, 1)] }], ['a']))
    expect(samplePose(scene.tracks.a, 0.5).visible).toBe(true)
    expect(samplePose(scene.tracks.a, 3).visible).toBe(false)
    expect(samplePose(scene.tracks.a, 6).visible).toBe(true)
    expect(samplePose(scene.tracks.a, 6).pop).toBe(1)
  })

  it('survives sloppy plans: unknown characters, zero durations, actions past the end', () => {
    const scenes = compileStory(
      plan([
        {
          durationSec: 5,
          actions: [act('ghost', 'dance', 0, 2), act('a', 'spin', 4.9, 0), act('a', 'run_to', 30, 5, { to: { x: 1, z: 1 } }), act('b', 'look_at', 1, 1, { targetKey: 'ghost' })],
        },
      ]),
    )
    for (let t = 0; t <= 5; t += 0.25) {
      for (const pose of Object.values(sampleScene(scenes[0], t))) {
        for (const value of [pose.x, pose.z, pose.heading, pose.scale, pose.pop, pose.lift, pose.speed, pose.travel]) {
          expect(Number.isFinite(value)).toBe(true)
        }
      }
    }
  })
})

describe('bundled stories', () => {
  it.each(MOCK_STORIES.map((s) => [s.slug, s] as const))('%s compiles and stays inside the stage at every moment', (_slug, story) => {
    const scenes = compileStory(story.plan!)
    expect(scenes).toHaveLength(story.plan!.scenes.length)
    expect(totalDuration(scenes)).toBeGreaterThan(20)
    for (const scene of scenes) {
      let anyoneVisible = false
      for (let t = 0; t <= scene.duration; t += 0.2) {
        for (const pose of Object.values(sampleScene(scene, t))) {
          expect(Number.isFinite(pose.x + pose.z + pose.heading + pose.scale + pose.pop)).toBe(true)
          expect(Math.hypot(pose.x, pose.z)).toBeLessThanOrEqual(ENTRY_RADIUS + 1e-6)
          anyoneVisible ||= pose.visible
        }
      }
      expect(anyoneVisible).toBe(true)
    }
  })
})

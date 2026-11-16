import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS, PROP_TYPES, TIMES_OF_DAY, WEATHERS, type PlanProp } from '../../api/types'
import { MOCK_STORIES } from '../../mock/stories'
import { compileStory, PLAY_RADIUS } from '../engine/timeline'
import { atmosphereFor, type EnvKind } from './atmosphere'
import { buildScenery, ENVIRONMENT_PRESETS } from './environments'
import { buildIsland, buildWaterSlab, placeInput } from './island'

const HEX = /^#[0-9a-f]{6}$/i

describe('atmosphereFor', () => {
  it('gives valid colours and positive light for every place, time and weather', () => {
    const kinds: EnvKind[] = ['outdoor', 'space', 'underwater', 'cave']
    for (const kind of kinds) {
      for (const time of TIMES_OF_DAY) {
        for (const weather of WEATHERS) {
          const a = atmosphereFor(kind, time, weather)
          for (const color of [a.skyTop, a.skyHorizon, a.skyBottom, a.keyColor, a.hemiSky, a.hemiGround, a.rimColor, a.fogColor, a.discColor, a.cloudColor]) {
            expect(color).toMatch(HEX)
          }
          // Whatever the weather, the characters must stay readable.
          expect(a.keyIntensity + a.hemiIntensity + a.fillIntensity).toBeGreaterThan(1.8)
          expect(a.fogDensity).toBeGreaterThan(0)
          expect(a.fogDensity).toBeLessThan(0.06)
          expect(a.starOpacity).toBeGreaterThanOrEqual(0)
          expect(a.starOpacity).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('shows stars when the weather asks for them, even by day', () => {
    expect(atmosphereFor('outdoor', 'day', 'clear').starOpacity).toBe(0)
    expect(atmosphereFor('outdoor', 'day', 'stars').starOpacity).toBeGreaterThan(0.5)
    expect(atmosphereFor('outdoor', 'night', 'rain').starOpacity).toBe(0)
  })

  it('lights windows and lamps in the evening, at night and for fireflies', () => {
    expect(atmosphereFor('outdoor', 'day', 'clear').lit).toBe(false)
    expect(atmosphereFor('outdoor', 'sunset', 'clear').lit).toBe(true)
    expect(atmosphereFor('outdoor', 'night', 'clear').lit).toBe(true)
    expect(atmosphereFor('outdoor', 'day', 'fireflies').lit).toBe(true)
  })
})

describe('buildScenery', () => {
  const allProps: PlanProp[] = PROP_TYPES.map((type, i) => ({ type, x: ((i * 37) % 11) - 5, z: ((i * 53) % 11) - 5, scale: 0.6 + (i % 5) * 0.3 }))

  it.each(ENVIRONMENTS)('%s builds, lit and unlit, with every plan prop', (environment) => {
    for (const lit of [false, true]) {
      const built = buildScenery({ environment, lit, palette: ['#ff8a5b', '#5bb8ff', '#ffd166'], props: allProps, avoid: [{ x: 0, z: 0 }], seed: 7 })
      expect(built.solid).not.toBeNull()
      const position = built.solid!.getAttribute('position')
      expect(position.count).toBeGreaterThan(500)
      // Cheap enough for a phone: one merged mesh well under 400k triangles.
      expect(position.count / 3).toBeLessThan(400_000)
      expect(built.solid!.getAttribute('color').count).toBe(position.count)
      expect(built.solid!.getAttribute('sway').count).toBe(position.count)
      const box = new Box3().setFromBufferAttribute(position as never)
      for (const value of [...box.min.toArray(), ...box.max.toArray()]) expect(Number.isFinite(value)).toBe(true)
      // Backdrops (mountains, planets) may stand far out, but nothing escapes into the distance.
      expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(45)
    }
  })

  it('is deterministic for a seed', () => {
    const input = { environment: 'forest' as const, lit: false, palette: ['#fff'], props: [], avoid: [], seed: 42 }
    const a = buildScenery(input).solid!.getAttribute('position').array
    const b = buildScenery(input).solid!.getAttribute('position').array
    expect(Array.from(a.slice(0, 600))).toEqual(Array.from(b.slice(0, 600)))
    const other = buildScenery({ ...input, seed: 43 }).solid!.getAttribute('position').array
    expect(Array.from(other.slice(0, 600))).not.toEqual(Array.from(a.slice(0, 600)))
  })

  it('falls back to the meadow for an unknown environment', () => {
    const built = buildScenery({ environment: 'volcano' as never, lit: false, palette: [], props: [], avoid: [], seed: 1 })
    expect(built.solid).not.toBeNull()
  })
})

describe('island', () => {
  it.each(ENVIRONMENTS)('%s has a flat top at y = 0 that covers the play area', (environment) => {
    const env = ENVIRONMENT_PRESETS[environment]
    const island = buildIsland(env, 3)
    const position = island.getAttribute('position')
    let top = -Infinity
    for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i))
    expect(top).toBeCloseTo(0, 5)
    expect(env.radius).toBeGreaterThan(PLAY_RADIUS)
    expect(island.getAttribute('color').count).toBe(position.count)
    if (env.waterRadius > 0) {
      expect(env.waterRadius).toBeGreaterThan(env.radius)
      const slab = buildWaterSlab(env).getAttribute('position')
      let surface = -Infinity
      for (let i = 0; i < slab.count; i++) surface = Math.max(surface, slab.getY(i))
      // The water surface lies just below the grass.
      expect(surface).toBeLessThan(0)
      expect(surface).toBeGreaterThan(-0.5)
    }
  })
})

describe('placeInput', () => {
  const story = MOCK_STORIES[0]
  const plan = story.plan!
  const scenes = compileStory(plan)

  it('gives two scenes in the same place the same scenery', () => {
    expect(plan.scenes[0].environment).toBe(plan.scenes[1].environment)
    const a = placeInput(plan, scenes, 0, false, story.slug)
    const b = placeInput(plan, scenes, 1, false, story.slug)
    expect(a).toEqual(b)
    // Props of both scenes are there, the shared one only once.
    expect(a.props.map((p) => p.type).sort()).toEqual(['ball', 'signpost'])
  })

  it('gives a different place a different seed and its own props', () => {
    const meadow = placeInput(plan, scenes, 0, false, story.slug)
    const forest = placeInput(plan, scenes, 2, true, story.slug)
    expect(forest.environment).toBe('forest')
    expect(forest.seed).not.toBe(meadow.seed)
    expect(forest.lit).toBe(true)
    expect(forest.props.map((p) => p.type)).toEqual(['lantern', 'mushroom'])
    expect(forest.avoid.length).toBeGreaterThan(3)
  })
})

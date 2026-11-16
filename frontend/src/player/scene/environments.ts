// The twelve places a story can happen in. Each preset describes its ground, its prop colours and a layout
// function. Layouts keep the middle of the island free: tall things stand behind and beside the play area,
// only low things stand between the characters and the audience.

import type { EnvironmentId, PlanProp } from '../../api/types'
import { seededRandom } from '../engine/easing'
import { PLAY_RADIUS } from '../engine/timeline'
import type { EnvKind } from './atmosphere'
import { PartBuilder, shade, type BuiltScenery } from './parts'
import * as P from './props'
import { pick, range, type Look, type PropFn, type Rng } from './props'

export const ISLAND_RADIUS = 9.2

export type AmbientParticles = 'pollen' | 'bubbles' | 'dust' | 'leaves' | 'none'

export interface EnvPreset {
  kind: EnvKind
  ground: { top: string; lip: string; soil: string; soilDark: string }
  /** Radius of the solid island. Smaller than the default when the place has water around it. */
  radius: number
  /** Radius of the water slab around the island (0 = none). */
  waterRadius: number
  waterColor: string
  leaf: string[]
  trunk: string
  rock: string
  flower: string[]
  snow: boolean
  clouds: boolean
  ambient: AmbientParticles
  /** Jump height multiplier (the moon is bouncy). */
  bounce: number
  /** Characters float this high above the ground (under water). */
  hover: number
  build(ctx: BuildContext): void
}

interface Placed {
  x: number
  z: number
  r: number
}

export class BuildContext {
  readonly placed: Placed[] = []
  readonly b: PartBuilder
  readonly r: Rng
  readonly look: Look
  readonly env: EnvPreset

  constructor(b: PartBuilder, r: Rng, look: Look, env: EnvPreset) {
    this.b = b
    this.r = r
    this.look = look
    this.env = env
  }

  private free(x: number, z: number, radius: number) {
    return this.placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + radius)
  }

  reserve(x: number, z: number, radius: number) {
    this.placed.push({ x, z, r: radius })
  }

  /** One prop at a fixed place. */
  put(fn: PropFn, x: number, z: number, scale = 1, rotY = this.r() * Math.PI * 2, footprint = 0.6) {
    this.reserve(x, z, footprint * scale)
    this.b.at(x, 0, z, rotY, scale, () => fn(this.b, this.r, this.look))
  }

  /**
   * Scatters `count` props in a ring sector. Angles are in turns of the circle: 0 = towards the audience,
   * 0.5 = straight behind the stage. `footprint` is the radius kept free around each one.
   */
  scatter(
    fn: PropFn,
    count: number,
    opts: { from: number; to: number; rMin: number; rMax: number; scale?: [number, number]; footprint?: number; face?: 'center' | 'random' },
  ) {
    const footprint = opts.footprint ?? 0.6
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const a = range(this.r, opts.from, opts.to) * Math.PI * 2
        const rad = range(this.r, opts.rMin, opts.rMax)
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        const scale = opts.scale ? range(this.r, opts.scale[0], opts.scale[1]) : 1
        if (footprint > 0 && !this.free(x, z, footprint * scale)) continue
        const rotY = opts.face === 'center' ? Math.atan2(-x, -z) : this.r() * Math.PI * 2
        if (footprint > 0) this.reserve(x, z, footprint * scale)
        this.b.at(x, 0, z, rotY, scale, () => fn(this.b, this.r, this.look))
        break
      }
    }
  }

  /** Flat blotches of colour so the ground does not look like one sheet of plastic. */
  patches(colors: string[], count: number, maxRadius = this.env.radius - 0.9) {
    for (let i = 0; i < count; i++) {
      const a = this.r() * Math.PI * 2
      const rad = Math.sqrt(this.r()) * maxRadius
      const w = range(this.r, 1.2, 3.4)
      this.b.add('disc', pick(this.r, colors), [Math.sin(a) * rad, 0.004 + i * 0.0004, Math.cos(a) * rad], [w, 1, w * range(this.r, 0.6, 1)], {
        rot: [0, this.r() * 3, 0],
      })
    }
  }

  /** Stepping stones from one point to another. */
  path(color: string, from: [number, number], to: [number, number], width = 1.1) {
    const steps = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.85)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = from[0] + (to[0] - from[0]) * t + (this.r() - 0.5) * 0.25
      const z = from[1] + (to[1] - from[1]) * t + (this.r() - 0.5) * 0.25
      const w = width * range(this.r, 0.7, 1)
      this.b.add('dome', i % 2 ? color : shade(color, 0.1), [x, 0, z], [w, 0.12, w * range(this.r, 0.7, 1)], { rot: [0, this.r() * 3, 0] })
    }
  }
}

const BACK = { from: 0.27, to: 0.73 }
const SIDES_AND_BACK = { from: 0.18, to: 0.82 }
const FRONT = { from: -0.17, to: 0.17 }
const ALL = { from: 0, to: 1 }
const EDGE = { rMin: 7.1, rMax: 8.6 }

const GREEN_LEAVES = ['#6cc24a', '#7fcf5a', '#58b04a', '#93d66a']
const FLOWERS = ['#ff7eb6', '#ffd54a', '#ffffff', '#ff8a65', '#b388ff']

const base = {
  radius: ISLAND_RADIUS,
  waterRadius: 0,
  waterColor: '#4fc3e8',
  leaf: GREEN_LEAVES,
  trunk: '#a8734a',
  rock: '#a9a6b5',
  flower: FLOWERS,
  snow: false,
  clouds: true,
  ambient: 'pollen' as AmbientParticles,
  bounce: 1,
  hover: 0,
  kind: 'outdoor' as EnvKind,
}

const GRASS = { top: '#8fd468', lip: '#79c257', soil: '#b88458', soilDark: '#8f6242' }

const hillAt = (c: BuildContext, color: string, turn: number, rad: number, w: number, h: number) => {
  const a = turn * Math.PI * 2
  c.b.at(Math.sin(a) * rad, 0, Math.cos(a) * rad, 0, 1, () => P.hill(c.b, color, w, h))
}

export const ENVIRONMENT_PRESETS: Record<EnvironmentId, EnvPreset> = {
  meadow: {
    ...base,
    ground: GRASS,
    build(c) {
      c.patches(['#9bdc74', '#84cb5e', '#a6e07c'], 16)
      hillAt(c, '#9bdc74', 0.42, 7.0, 4.4, 0.9)
      hillAt(c, '#84cb5e', 0.6, 7.2, 3.8, 1.2)
      c.scatter(P.tree, 4, { ...BACK, ...EDGE, scale: [0.95, 1.3], footprint: 1.3 })
      c.scatter(P.tree, 2, { from: 0.2, to: 0.27, rMin: 7.6, rMax: 8.4, footprint: 1.2 })
      c.scatter(P.bush, 7, { ...SIDES_AND_BACK, rMin: 6.8, rMax: 8.6, scale: [0.8, 1.3] })
      c.scatter(P.rock, 3, { ...ALL, rMin: 7.2, rMax: 8.6, scale: [0.6, 1.0] })
      c.put(P.fence, -6.6, -4.4, 1, 0.9)
      c.put(P.fence, -5.0, -6.0, 1, 0.55)
      c.scatter(P.flower, 30, { ...ALL, rMin: 1.5, rMax: 8.7, scale: [0.8, 1.3], footprint: 0.2 })
      c.scatter(P.grassTuft, 46, { ...ALL, rMin: 0.5, rMax: 8.8, scale: [0.8, 1.5], footprint: 0 })
      c.scatter(P.bush, 3, { ...FRONT, rMin: 7.9, rMax: 8.7, scale: [0.6, 0.85] })
    },
  },

  forest: {
    ...base,
    ground: { top: '#73b858', lip: '#5fa34a', soil: '#8c6347', soilDark: '#6b4a36' },
    leaf: ['#3f9a4c', '#4fae55', '#2f8a4a', '#62b85a'],
    trunk: '#8a5a3c',
    ambient: 'leaves',
    build(c) {
      c.patches(['#66ab50', '#7fc462', '#5c9f4a'], 18)
      c.scatter(P.pine, 9, { ...SIDES_AND_BACK, rMin: 7.6, rMax: 8.7, scale: [1.0, 1.45], footprint: 0.95 })
      c.scatter(P.tree, 7, { ...SIDES_AND_BACK, rMin: 6.9, rMax: 8.2, scale: [0.9, 1.3], footprint: 1.15 })
      c.scatter(P.bush, 6, { ...SIDES_AND_BACK, rMin: 6.6, rMax: 8.4 })
      // A fallen log to sit on.
      c.b.at(5.6, 0, -3.9, 0.6, 1, () => {
        c.b.add('cyl', '#8a5a3c', [0, 0.35, 0], [0.7, 2.6, 0.7], { rot: [0, 0, Math.PI / 2] })
        c.b.add('disc', '#d9b48a', [1.31, 0.35, 0], [0.6, 1, 0.6], { rot: [0, 0, Math.PI / 2] })
        c.b.add('sphere', '#7fc462', [-0.4, 0.68, 0.1], [0.9, 0.2, 0.5])
      })
      c.reserve(5.6, -3.9, 1.5)
      c.scatter(P.mushroom, 9, { ...ALL, rMin: 5.8, rMax: 8.6, scale: [0.45, 0.9], footprint: 0.4 })
      c.scatter(P.rock, 4, { ...ALL, rMin: 7.0, rMax: 8.6, scale: [0.6, 1.1] })
      c.scatter(P.grassTuft, 40, { ...ALL, rMin: 0.5, rMax: 8.8, scale: [0.9, 1.6], footprint: 0 })
      c.scatter(P.flower, 10, { ...ALL, rMin: 2, rMax: 8.6, footprint: 0.2 })
    },
  },

  beach: {
    ...base,
    ground: { top: '#f8e0a6', lip: '#edd190', soil: '#dcb97f', soilDark: '#b8935f' },
    radius: 8.2,
    waterRadius: 11.4,
    rock: '#c9bfae',
    ambient: 'none',
    build(c) {
      c.patches(['#fbe8b8', '#f1d594', '#fff0c8'], 14)
      c.scatter(P.palm, 4, { ...BACK, rMin: 6.6, rMax: 7.6, scale: [0.95, 1.25], footprint: 1.0 })
      c.put(P.palm, -6.9, -1.6, 1.15)
      c.put(P.umbrella, 5.9, -3.6, 1, 0.4, 1.4)
      c.scatter(P.rock, 3, { ...SIDES_AND_BACK, rMin: 6.8, rMax: 7.7, scale: [0.6, 1.1] })
      c.scatter(P.shell, 8, { ...ALL, rMin: 3, rMax: 7.7, scale: [0.7, 1.2], footprint: 0.3 })
      c.scatter(P.bush, 3, { ...BACK, rMin: 6.8, rMax: 7.6, scale: [0.7, 1.0] })
      // Sand castle with a little flag.
      c.b.at(-5.4, 0, -4.6, 0.4, 1, () => {
        c.b.add('cyl', '#eccf8c', [0, 0.3, 0], [1.3, 0.6, 1.3])
        c.b.add('cyl', '#f3d99b', [0, 0.8, 0], [0.8, 0.5, 0.8])
        c.b.add('cone', '#eccf8c', [0, 1.3, 0], [0.7, 0.6, 0.7])
        c.b.add('cyl', '#8a5a3c', [0, 1.8, 0], [0.04, 0.5, 0.04])
        c.b.add('cone', c.look.accent[0] ?? '#ef5350', [0.14, 1.95, 0], [0.26, 0.28, 0.04], { rot: [0, 0, -Math.PI / 2] })
      })
      c.reserve(-5.4, -4.6, 1.1)
      // Things floating in the water around the island.
      for (const [turn, rad, s] of [
        [0.33, 9.9, 0.8],
        [0.62, 10.1, 1.0],
        [0.08, 9.8, 0.7],
      ] as const) {
        const a = turn * Math.PI * 2
        c.b.at(Math.sin(a) * rad, -0.28, Math.cos(a) * rad, a, s, () => P.rock(c.b, c.r, c.look))
      }
      c.b.at(7.6, -0.42, -7.0, -0.8, 0.8, () => P.boat(c.b, c.r, c.look))
    },
  },

  sea: {
    ...base,
    ground: { top: '#f8e0a6', lip: '#edd190', soil: '#dcb97f', soilDark: '#b8935f' },
    radius: 6.9,
    waterRadius: 11.6,
    waterColor: '#3fb4e6',
    rock: '#9aa3b5',
    ambient: 'none',
    build(c) {
      c.patches(['#fbe8b8', '#f1d594'], 10)
      c.put(P.palm, -5.4, -2.9, 1.2)
      c.put(P.palm, 4.6, -4.3, 1.0)
      c.scatter(P.rock, 4, { ...SIDES_AND_BACK, rMin: 5.6, rMax: 6.3, scale: [0.6, 1.1] })
      c.scatter(P.shell, 6, { ...ALL, rMin: 2.5, rMax: 6.2, scale: [0.7, 1.1], footprint: 0.3 })
      c.scatter(P.bush, 2, { ...BACK, rMin: 5.6, rMax: 6.2, scale: [0.7, 0.9] })
      // Lighthouse on a rock out in the water.
      c.b.at(-7.6, -0.3, -6.3, 0, 1, () => {
        c.b.add('rock', c.env.rock, [0, 0.3, 0], [3.0, 1.3, 2.6])
        c.b.add('taper', '#ffffff', [0, 2.6, 0], [1.3, 4.2, 1.3])
        c.b.add('taper', '#ef5350', [0, 1.9, 0], [1.4, 0.8, 1.4])
        c.b.add('taper', '#ef5350', [0, 3.6, 0], [1.08, 0.8, 1.08])
        c.b.add('cyl', '#4a5568', [0, 4.8, 0], [1.1, 0.16, 1.1])
        c.b.add('cyl', '#ffd27a', [0, 5.2, 0], [0.6, 0.6, 0.6], { bucket: 'glow', glow: 2.6 })
        c.b.add('cone', '#ef5350', [0, 5.85, 0], [0.95, 0.7, 0.95])
      })
      c.b.at(8.4, -0.42, -4.4, -0.5, 1, () => P.boat(c.b, c.r, c.look))
      c.b.at(-8.9, -0.42, 2.6, 2.2, 0.7, () => P.boat(c.b, c.r, c.look))
      for (const [turn, rad, s] of [
        [0.1, 9.6, 0.9],
        [0.4, 10.2, 1.1],
        [0.86, 9.7, 0.8],
        [0.7, 10.4, 1.2],
      ] as const) {
        const a = turn * Math.PI * 2
        c.b.at(Math.sin(a) * rad, -0.3, Math.cos(a) * rad, a, s, () => P.rock(c.b, c.r, c.look))
      }
      // A buoy bobbing near the shore.
      c.b.at(5.8, -0.3, 6.6, 0, 1, () => {
        c.b.add('sphere', '#ef5350', [0, 0.25, 0], [0.8, 0.6, 0.8])
        c.b.add('cyl', '#ffffff', [0, 0.75, 0], [0.16, 0.7, 0.16])
        c.b.add('sphere', '#ffd27a', [0, 1.2, 0], 0.24, { bucket: 'glow', glow: 2.2 })
      })
    },
  },

  castle: {
    ...base,
    ground: GRASS,
    rock: '#b9b3c4',
    build(c) {
      c.patches(['#9bdc74', '#84cb5e'], 14)
      const stone = '#d9d2e0'
      const roof = c.look.accent[0] ?? '#e76f51'
      const roofB = c.look.accent[2] ?? '#5b8def'
      // Curtain wall along the back with towers, and a keep behind the gate.
      const towers: [number, number, number][] = [
        [0.33, 8.0, 4.6],
        [0.44, 8.2, 5.6],
        [0.56, 8.2, 5.6],
        [0.67, 8.0, 4.6],
      ]
      towers.forEach(([turn, rad, h], i) => {
        const a = turn * Math.PI * 2
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.b.at(x, 0, z, Math.atan2(-x, -z), 1, () => P.tower(c.b, c.look, stone, i % 2 ? roofB : roof, h))
        c.reserve(x, z, 1.3)
      })
      for (let i = 0; i < towers.length - 1; i++) {
        const a0 = towers[i][0] * Math.PI * 2
        const a1 = towers[i + 1][0] * Math.PI * 2
        const x0 = Math.sin(a0) * towers[i][1]
        const z0 = Math.cos(a0) * towers[i][1]
        const x1 = Math.sin(a1) * towers[i + 1][1]
        const z1 = Math.cos(a1) * towers[i + 1][1]
        const len = Math.hypot(x1 - x0, z1 - z0)
        const rot = Math.atan2(-(z1 - z0), x1 - x0)
        c.b.at((x0 + x1) / 2, 0, (z0 + z1) / 2, rot, 1, () => {
          P.wall(c.b, shade(stone, -0.06), len - 1.2, i === 1 ? 3.4 : 2.6)
          if (i === 1) {
            // Gate with a wooden door and a banner.
            c.b.add('box', '#8a5a3c', [0, 1.1, 0.36], [1.5, 2.2, 0.1])
            c.b.add('cyl', '#8a5a3c', [0, 2.2, 0.36], [1.5, 0.1, 1.5], { rot: [Math.PI / 2, 0, 0] })
            c.b.add('box', roof, [0, 3.05, 0.4], [0.7, 0.9, 0.06], { sway: 0.004 })
          }
        })
        c.reserve((x0 + x1) / 2, (z0 + z1) / 2, 1.6)
      }
      c.path('#e6dccb', [0, -6.4], [0, 3.5], 1.25)
      c.scatter(P.tree, 2, { from: 0.2, to: 0.27, rMin: 7.4, rMax: 8.2, footprint: 1.2 })
      c.scatter(P.tree, 2, { from: 0.73, to: 0.8, rMin: 7.4, rMax: 8.2, footprint: 1.2 })
      c.scatter(P.bush, 6, { ...SIDES_AND_BACK, rMin: 6.4, rMax: 8.5 })
      c.scatter(P.flower, 18, { ...ALL, rMin: 2, rMax: 8.6, footprint: 0.2 })
      c.scatter(P.grassTuft, 30, { ...ALL, rMin: 1, rMax: 8.8, footprint: 0 })
      c.scatter(P.rock, 2, { ...FRONT, rMin: 7.8, rMax: 8.6, scale: [0.5, 0.8] })
    },
  },

  village: {
    ...base,
    ground: GRASS,
    build(c) {
      c.patches(['#9bdc74', '#84cb5e'], 14)
      const spots: [number, number, number][] = [
        [0.3, 7.5, 1.0],
        [0.42, 7.7, 1.12],
        [0.56, 7.7, 1.05],
        [0.69, 7.5, 0.95],
      ]
      for (const [turn, rad, s] of spots) {
        const a = turn * Math.PI * 2
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.put(P.house, x, z, s, Math.atan2(-x, -z), 1.9)
      }
      c.path('#ead9b8', [-5.6, -3.2], [5.6, -3.2], 1.2)
      c.path('#ead9b8', [0, -3.2], [0, 4.6], 1.2)
      c.put(P.lantern, -2.4, -4.7, 1, 0)
      c.put(P.lantern, 2.5, -4.7, 1, 0)
      c.put(P.fence, -6.9, 1.4, 1, 1.35)
      c.put(P.fence, 6.9, 1.6, 1, -1.35)
      c.put(P.signpost, 6.2, -1.6, 1, -0.6)
      c.scatter(P.tree, 3, { ...SIDES_AND_BACK, rMin: 7.6, rMax: 8.5, footprint: 1.2 })
      c.scatter(P.bush, 6, { ...SIDES_AND_BACK, rMin: 6.2, rMax: 8.6 })
      c.scatter(P.flower, 20, { ...ALL, rMin: 2, rMax: 8.6, footprint: 0.2 })
      c.scatter(P.grassTuft, 30, { ...ALL, rMin: 1, rMax: 8.8, footprint: 0 })
    },
  },

  snowy_mountain: {
    ...base,
    ground: { top: '#f6faff', lip: '#dfe9f6', soil: '#9da8bd', soilDark: '#76819a' },
    leaf: ['#3f8f6b', '#4a9c78', '#357f62'],
    trunk: '#7d5a44',
    rock: '#8f9bb3',
    snow: true,
    ambient: 'none',
    build(c) {
      c.patches(['#e6effa', '#ffffff', '#dbe7f6'], 16)
      const peaks: [number, number, number][] = [
        [0.36, 7.9, 5.2],
        [0.47, 8.3, 7.4],
        [0.57, 8.2, 6.0],
        [0.66, 7.8, 4.6],
      ]
      for (const [turn, rad, h] of peaks) {
        const a = turn * Math.PI * 2
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.b.at(x, -0.1, z, 0, 1, () => P.mountain(c.b, c.r, '#8fa0c2', '#ffffff', h))
        c.reserve(x, z, h * 0.3)
      }
      c.scatter(P.pine, 8, { ...SIDES_AND_BACK, rMin: 6.6, rMax: 8.5, scale: [0.8, 1.25], footprint: 0.9 })
      c.scatter(P.rock, 5, { ...ALL, rMin: 6.8, rMax: 8.6, scale: [0.6, 1.2] })
      // Snow drifts.
      for (let i = 0; i < 12; i++) {
        const a = c.r() * Math.PI * 2
        const rad = range(c.r, 6.4, 8.6)
        const w = range(c.r, 1.2, 2.6)
        c.b.add('dome', '#ffffff', [Math.sin(a) * rad, 0, Math.cos(a) * rad], [w, range(c.r, 0.3, 0.6), w * 0.8])
      }
      c.scatter(P.bush, 3, { ...SIDES_AND_BACK, rMin: 6.6, rMax: 8.4, scale: [0.7, 1] })
    },
  },

  space: {
    ...base,
    kind: 'space',
    ground: { top: '#bcb6d6', lip: '#a39cc4', soil: '#6f6894', soilDark: '#4f4874' },
    rock: '#9d96bd',
    clouds: false,
    ambient: 'dust',
    bounce: 1.6,
    build(c) {
      c.patches(['#c8c3e0', '#aaa3c8'], 10)
      for (let i = 0; i < 11; i++) {
        const a = c.r() * Math.PI * 2
        const rad = Math.sqrt(c.r()) * 8.2
        const s = range(c.r, 0.8, 2.0)
        c.b.at(Math.sin(a) * rad, 0, Math.cos(a) * rad, 0, 1, () => P.crater(c.b, c.env.ground.top, s))
      }
      c.scatter(P.rock, 7, { ...SIDES_AND_BACK, ...EDGE, scale: [0.7, 1.6] })
      c.scatter(P.crystal, 4, { ...SIDES_AND_BACK, rMin: 6.8, rMax: 8.4, scale: [0.7, 1.1] })
      c.scatter(P.rock, 3, { ...FRONT, rMin: 7.8, rMax: 8.7, scale: [0.4, 0.7] })
      // A small lander with a dish and a flag.
      c.b.at(-5.8, 0, -4.6, 0.5, 1, () => {
        c.b.add('sphere', '#f2f2f8', [0, 1.25, 0], [1.6, 1.3, 1.6])
        c.b.add('cyl', '#ffd27a', [0, 0.55, 0], [1.3, 0.3, 1.3], { bucket: 'glow', glow: 1.6 })
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2
          c.b.add('cyl', '#8d99ae', [Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8], [0.08, 0.9, 0.08], { rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] })
          c.b.add('disc', '#8d99ae', [Math.cos(a) * 1.0, 0.03, Math.sin(a) * 1.0], [0.4, 3, 0.4])
        }
        c.b.add('sphere', '#7fd4ff', [0, 1.4, 0.62], [0.6, 0.6, 0.3])
        c.b.add('cyl', '#8d99ae', [0.3, 2.2, 0], [0.04, 0.8, 0.04])
        c.b.add('dome', '#f2f2f8', [0.3, 2.6, 0], [0.7, 0.3, 0.7], { rot: [0.6, 0, 0.4] })
      })
      c.reserve(-5.8, -4.6, 1.5)
      c.b.at(6.3, 0, -3.4, 0, 1, () => {
        c.b.add('cyl', '#f2f2f8', [0, 1.1, 0], [0.06, 2.2, 0.06])
        c.b.add('box', c.look.accent[0] ?? '#ef5350', [0.45, 1.9, 0], [0.85, 0.5, 0.04])
      })
      // Planets hanging in the sky behind the island.
      c.b.add('sphere', '#ffb38a', [-17, 9, -26], 9)
      c.b.add('torus', '#ffe0c2', [-17, 9, -26], [15, 2.2, 15], { rot: [0.5, 0, 0.35] })
      c.b.add('sphere', '#8fd6ff', [20, 14, -30], 5)
      c.b.add('sphere', '#d9a8ff', [9, -3, -24], 2.6)
    },
  },

  underwater: {
    ...base,
    kind: 'underwater',
    ground: { top: '#f2dea4', lip: '#e2c88a', soil: '#c9a66e', soilDark: '#a07f52' },
    rock: '#7f93a8',
    clouds: false,
    ambient: 'bubbles',
    bounce: 1.3,
    hover: 0.28,
    build(c) {
      c.patches(['#f8e8b8', '#e9d291'], 12)
      c.scatter(P.coral, 11, { ...SIDES_AND_BACK, rMin: 6.6, rMax: 8.5, scale: [0.9, 1.9], footprint: 0.8 })
      c.scatter(P.seaweed, 12, { ...SIDES_AND_BACK, rMin: 6.4, rMax: 8.7, scale: [0.9, 1.6], footprint: 0.5 })
      c.scatter(P.rock, 6, { ...ALL, rMin: 6.8, rMax: 8.6, scale: [0.7, 1.7] })
      c.scatter(P.shell, 8, { ...ALL, rMin: 2.5, rMax: 8.4, scale: [0.8, 1.3], footprint: 0.3 })
      c.scatter(P.seaweed, 4, { ...FRONT, rMin: 8.0, rMax: 8.7, scale: [0.5, 0.8], footprint: 0.4 })
      c.scatter(P.coral, 3, { ...FRONT, rMin: 8.0, rMax: 8.7, scale: [0.5, 0.8], footprint: 0.5 })
      // Starfish.
      for (let i = 0; i < 4; i++) {
        const a = c.r() * Math.PI * 2
        const rad = range(c.r, 3, 8)
        c.b.at(Math.sin(a) * rad, 0, Math.cos(a) * rad, c.r() * 6, 1, () => {
          for (let k = 0; k < 5; k++) {
            const t = (k / 5) * Math.PI * 2
            c.b.add('sphere', '#ff8a65', [Math.cos(t) * 0.2, 0.05, Math.sin(t) * 0.2], [0.5, 0.12, 0.2], { rot: [0, -t, 0] })
          }
        })
      }
    },
  },

  cave: {
    ...base,
    kind: 'cave',
    ground: { top: '#7a6880', lip: '#66566c', soil: '#4a3c52', soilDark: '#35293c' },
    rock: '#6e5d78',
    clouds: false,
    ambient: 'dust',
    build(c) {
      c.patches(['#85738b', '#6d5c73'], 12)
      // Horseshoe of boulders as the cave wall, with an arch of rock overhead.
      for (let i = 0; i < 13; i++) {
        const turn = 0.2 + (i / 12) * 0.6
        const a = turn * Math.PI * 2
        const rad = 8.3 + (i % 2) * 0.5
        const h = range(c.r, 4.5, 8) * (0.7 + 0.5 * Math.sin((turn - 0.2) / 0.6 * Math.PI))
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.b.add('rock', i % 2 ? '#5d4d66' : '#6b5a74', [x, h * 0.4, z], [3.6, h, 3.0], { rot: [0, c.r() * 3, c.r() * 0.2] })
        c.reserve(x, z, 1.2)
      }
      for (let i = 0; i < 7; i++) {
        const turn = 0.3 + (i / 6) * 0.4
        const a = turn * Math.PI * 2
        c.b.add('rock', '#54455c', [Math.sin(a) * 6.8, 8.6 + Math.sin(i * 1.7) * 0.5, Math.cos(a) * 6.8 - 1], [5.2, 2.6, 4.2], {
          rot: [c.r(), c.r() * 3, c.r()],
        })
      }
      for (let i = 0; i < 9; i++) {
        const turn = 0.28 + c.r() * 0.44
        const a = turn * Math.PI * 2
        const rad = range(c.r, 5.6, 7.6)
        c.b.at(Math.sin(a) * rad, 7.9, Math.cos(a) * rad - 1, 0, 1, () => P.stalagmite(c.b, c.r, '#6b5a74', range(c.r, 1.2, 2.6), true))
      }
      for (let i = 0; i < 9; i++) {
        const turn = range(c.r, 0.2, 0.8)
        const a = turn * Math.PI * 2
        const rad = range(c.r, 6.6, 7.6)
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.b.at(x, 0, z, 0, 1, () => P.stalagmite(c.b, c.r, '#7d6b87', range(c.r, 1.0, 2.4)))
        c.reserve(x, z, 0.6)
      }
      c.scatter(P.crystal, 7, { ...SIDES_AND_BACK, rMin: 6.3, rMax: 7.6, scale: [0.8, 1.5], footprint: 0.7 })
      c.scatter(P.rock, 5, { ...ALL, rMin: 6.8, rMax: 8.6, scale: [0.5, 1.0] })
      c.scatter(P.crystal, 2, { ...FRONT, rMin: 8.0, rMax: 8.6, scale: [0.45, 0.6] })
      // Glowing mushrooms.
      for (let i = 0; i < 8; i++) {
        const a = c.r() * Math.PI * 2
        const rad = range(c.r, 5.8, 8.4)
        const s = range(c.r, 0.3, 0.6)
        c.b.at(Math.sin(a) * rad, 0, Math.cos(a) * rad, 0, s, () => {
          c.b.add('taper', '#e8e0f0', [0, 0.3, 0], [0.3, 0.6, 0.3])
          c.b.add('dome', '#7ff0e0', [0, 0.5, 0], [1.0, 0.8, 1.0], { bucket: 'glow', glow: 1.5 })
        })
      }
    },
  },

  desert: {
    ...base,
    ground: { top: '#f4c981', lip: '#e7b86c', soil: '#cb9254', soilDark: '#a26f3f' },
    leaf: ['#9db86a', '#b3c47a'],
    rock: '#d98a5f',
    ambient: 'dust',
    build(c) {
      c.patches(['#f9d695', '#ecbd72', '#fbdca2'], 16)
      hillAt(c, '#f9d695', 0.4, 7.2, 4.6, 1.1)
      hillAt(c, '#f1c67e', 0.63, 7.3, 4.0, 0.9)
      hillAt(c, '#fbdca2', 0.22, 7.6, 3.0, 0.6)
      // Mesa rocks and a far pyramid.
      for (const [turn, rad, s] of [
        [0.3, 7.9, 1.0],
        [0.71, 7.8, 0.85],
      ] as const) {
        const a = turn * Math.PI * 2
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        c.b.at(x, 0, z, c.r() * 3, s, () => {
          c.b.add('box', '#d98a5f', [0, 1.2, 0], [2.2, 2.4, 1.9])
          c.b.add('box', '#e39a6c', [0.1, 2.75, 0], [2.5, 0.7, 2.2])
          c.b.add('box', '#c97a52', [-0.9, 0.7, 0.7], [1.2, 1.4, 1.2])
        })
        c.reserve(x, z, 1.8)
      }
      c.b.at(1.4, 0, -8.0, 0.5, 1, () => c.b.add('pyramid', '#eab968', [0, 2.0, 0], [5.4, 4.0, 5.4]))
      c.reserve(1.4, -8.0, 2.6)
      c.scatter(P.cactus, 6, { ...SIDES_AND_BACK, rMin: 6.5, rMax: 8.5, scale: [0.8, 1.3], footprint: 0.8 })
      c.scatter(P.rock, 5, { ...ALL, rMin: 6.8, rMax: 8.6, scale: [0.5, 1.0] })
      c.scatter(P.bush, 4, { ...ALL, rMin: 6.8, rMax: 8.6, scale: [0.4, 0.7] })
      c.scatter(P.cactus, 2, { ...FRONT, rMin: 8.0, rMax: 8.6, scale: [0.4, 0.55], footprint: 0.5 })
    },
  },

  city_park: {
    ...base,
    ground: { top: '#93d577', lip: '#7dc262', soil: '#a8a2ad', soilDark: '#7f7a86' },
    leaf: ['#5fbf63', '#74cc6a', '#4fae5c'],
    build(c) {
      c.patches(['#a0dc82', '#86cb68'], 12)
      const pastel = ['#ffd6c9', '#cfe3ff', '#ffe9b8', '#d9d0ff', '#c9f0e0', '#ffcfe0']
      // Skyline behind the park.
      for (let i = 0; i < 8; i++) {
        const turn = 0.3 + (i / 7) * 0.4
        const a = turn * Math.PI * 2
        const rad = 8.3
        const x = Math.sin(a) * rad
        const z = Math.cos(a) * rad
        const h = range(c.r, 3.2, 7.2)
        const w = range(c.r, 1.6, 2.3)
        c.b.at(x, 0, z, Math.atan2(-x, -z), 1, () => P.building(c.b, c.r, c.look, pick(c.r, pastel), w, h))
        c.reserve(x, z, 1.4)
      }
      // Paths and a fountain.
      const pathColor = '#efe3cc'
      c.path(pathColor, [-7.4, 2.6], [7.4, 2.6], 1.3)
      c.path(pathColor, [0, -5.2], [0, 2.6], 1.3)
      c.b.at(0, 0, -6.0, 0, 1, () => {
        c.b.add('cyl', '#e6e0ee', [0, 0.3, 0], [2.6, 0.6, 2.6])
        c.b.add('cyl', '#7fd4f5', [0, 0.56, 0], [2.2, 0.12, 2.2], { bucket: 'water' })
        c.b.add('taper', '#e6e0ee', [0, 0.95, 0], [0.5, 1.3, 0.5])
        c.b.add('dome', '#e6e0ee', [0, 1.5, 0], [1.2, 0.3, 1.2], { rot: [Math.PI, 0, 0] })
        c.b.add('sphere', '#bfeaff', [0, 1.85, 0], [0.5, 0.7, 0.5], { bucket: 'water' })
      })
      c.reserve(0, -6.0, 1.7)
      c.put(P.bench, -3.4, -5.4, 1, 0.35)
      c.put(P.bench, 3.4, -5.4, 1, -0.35)
      c.put(P.lantern, -5.6, -3.4, 1, 0)
      c.put(P.lantern, 5.6, -3.4, 1, 0)
      c.put(P.lantern, -7.2, 4.0, 0.9, 0)
      c.put(P.lantern, 7.2, 4.0, 0.9, 0)
      c.scatter(P.tree, 5, { ...SIDES_AND_BACK, rMin: 6.6, rMax: 7.6, scale: [0.85, 1.15], footprint: 1.2 })
      c.scatter(P.bush, 6, { ...SIDES_AND_BACK, rMin: 6.4, rMax: 7.8, scale: [0.7, 1.1] })
      c.scatter(P.flower, 22, { ...ALL, rMin: 3, rMax: 8.6, footprint: 0.2 })
      c.scatter(P.grassTuft, 24, { ...ALL, rMin: 1, rMax: 8.8, footprint: 0 })
    },
  },
}

export interface SceneryInput {
  environment: EnvironmentId
  lit: boolean
  palette: string[]
  props: PlanProp[]
  /** Places characters stand on or walk to in this scene; plan props are moved out of their way. */
  avoid: { x: number; z: number }[]
  seed: number
}

/** Builds all static scenery of one scene: the environment layout plus the props the plan asked for. */
export function buildScenery(input: SceneryInput): BuiltScenery {
  const env = ENVIRONMENT_PRESETS[input.environment] ?? ENVIRONMENT_PRESETS.meadow
  const r = seededRandom(input.seed)
  const look: Look = {
    leaf: env.leaf,
    trunk: env.trunk,
    rock: env.rock,
    flower: env.flower,
    accent: input.palette,
    snow: env.snow,
    lit: input.lit,
  }
  const b = new PartBuilder()
  const ctx = new BuildContext(b, r, look, env)
  const limit = Math.min(env.radius - 0.9, 7.6)

  // Plan props first, so the environment layout leaves room for them.
  for (const prop of input.props) {
    const fn = P.PLAN_PROPS[prop.type]
    if (!fn) continue
    let x = prop.x
    let z = prop.z
    const scale = Math.min(1.6, Math.max(0.5, prop.scale ?? 1))
    for (let i = 0; i < 12; i++) {
      const blocked = input.avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5)
      if (!blocked) break
      const len = Math.hypot(x, z) || 1
      // Push outwards, and backwards a little so the prop does not end up between characters and camera.
      x += (x / len) * 0.6 + (Math.abs(x) < 0.3 ? 0.6 : 0)
      z += (z / len) * 0.6 - 0.25
    }
    const len = Math.hypot(x, z)
    if (len > limit) {
      x *= limit / len
      z *= limit / len
    }
    ctx.put(fn, x, z, scale, r() * 0.8 - 0.4, 0.9)
  }
  // Keep the play area itself free of solid scenery.
  ctx.reserve(0, 0, PLAY_RADIUS - 0.2)
  env.build(ctx)
  return b.build()
}

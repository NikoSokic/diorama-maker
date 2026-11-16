// Procedural toy props. Every function builds one prop at the local origin, standing on y = 0,
// in world units (a character is about 1.6 tall).

import type { PropType } from '../../api/types'
import { shade, type PartBuilder } from './parts'

export interface Look {
  leaf: string[]
  trunk: string
  rock: string
  flower: string[]
  /** Story palette, used for man-made things (roofs, tents, balloons). */
  accent: string[]
  snow: boolean
  /** Windows, lamps and fires glow (evening, night, dark places). */
  lit: boolean
}

export type Rng = () => number
export type PropFn = (b: PartBuilder, r: Rng, look: Look) => void

export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]
export const range = (r: Rng, a: number, b: number) => a + (b - a) * r()

const WOOD = '#b98556'
const WOOD_DARK = '#8a5a3c'
const CREAM = '#fff1d6'
const SNOW = '#ffffff'
const WARM_GLOW = '#ffd27a'
const GLASS = '#a9dcff'

function windowPane(b: PartBuilder, look: Look, pos: [number, number, number], size: [number, number, number]) {
  if (look.lit) b.add('box', WARM_GLOW, pos, size, { bucket: 'glow', glow: 2.4 })
  else b.add('box', GLASS, pos, size)
}

export const tree: PropFn = (b, r, look) => {
  const h = range(r, 1.4, 2.0)
  const leaf = pick(r, look.leaf)
  const sway = 0.012
  b.add('taper', look.trunk, [0, h / 2, 0], [0.55, h, 0.55], { sway })
  b.add('sphere', leaf, [0, h + 0.95, 0], [2.6, 2.3, 2.6], { sway })
  b.add('sphere', shade(leaf, 0.14), [0.75, h + 1.55, 0.35], [1.5, 1.35, 1.5], { sway })
  b.add('sphere', shade(leaf, -0.12), [-0.85, h + 0.6, -0.25], [1.65, 1.45, 1.65], { sway })
  if (look.snow) b.add('dome', SNOW, [0.1, h + 1.6, 0], [2.0, 1.1, 2.0], { sway })
}

export const pine: PropFn = (b, r, look) => {
  const s = range(r, 0.9, 1.2)
  const leaf = pick(r, look.leaf)
  const sway = 0.008
  b.add('taper', look.trunk, [0, 0.45 * s, 0], [0.42 * s, 0.9 * s, 0.42 * s], { sway })
  const tiers: [number, number, number][] = [
    [1.45, 2.3, 1.6],
    [2.45, 1.8, 1.5],
    [3.35, 1.25, 1.4],
  ]
  tiers.forEach(([y, w, h], i) => {
    b.add('cone', shade(leaf, -0.14 + i * 0.1), [0, y * s, 0], [w * s, h * s, w * s], { sway })
    if (look.snow) b.add('cone', SNOW, [0, (y + h * 0.2) * s, 0], [w * 0.68 * s, h * 0.66 * s, w * 0.68 * s], { sway })
  })
}

export const bush: PropFn = (b, r, look) => {
  const leaf = pick(r, look.leaf)
  b.add('sphere', leaf, [0, 0.42, 0], [1.3, 0.95, 1.2], { sway: 0.01 })
  b.add('sphere', shade(leaf, 0.12), [0.55, 0.36, 0.2], [0.9, 0.75, 0.9], { sway: 0.01 })
  b.add('sphere', shade(leaf, -0.1), [-0.55, 0.32, -0.1], [0.85, 0.7, 0.85], { sway: 0.01 })
  if (look.snow) b.add('dome', SNOW, [0, 0.55, 0], [1.1, 0.5, 1.0])
  else if (r() > 0.4) {
    const berry = pick(r, look.flower)
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2
      b.add('sphere', berry, [Math.cos(a) * 0.45, 0.6 + r() * 0.25, Math.sin(a) * 0.4 + 0.15], 0.14)
    }
  }
}

export const rock: PropFn = (b, r, look) => {
  const c = look.rock
  b.add('rock', c, [0, 0.38, 0], [1.2, 0.9, 1.0], { rot: [r(), r() * 3, r()] })
  b.add('rock', shade(c, 0.12), [0.6, 0.2, 0.35], [0.6, 0.45, 0.55], { rot: [r(), r() * 3, r()] })
  if (r() > 0.5) b.add('rock', shade(c, -0.12), [-0.55, 0.18, -0.3], [0.5, 0.4, 0.5], { rot: [r(), r() * 3, r()] })
  if (look.snow) b.add('dome', SNOW, [0, 0.62, 0], [0.9, 0.3, 0.75])
}

export const flower: PropFn = (b, r, look) => {
  const petal = pick(r, look.flower)
  const h = range(r, 0.45, 0.75)
  const sway = 0.05
  b.add('cyl', '#5fae57', [0, h / 2, 0], [0.06, h, 0.06], { sway })
  b.add('sphere', '#6cc063', [0.14, h * 0.35, 0], [0.26, 0.08, 0.14], { sway, rot: [0, 0, 0.5] })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.add('sphere', petal, [Math.cos(a) * 0.14, h + 0.02, Math.sin(a) * 0.14], [0.2, 0.1, 0.2], { sway })
  }
  b.add('sphere', '#ffd54a', [0, h + 0.05, 0], 0.15, { sway })
}

export const mushroom: PropFn = (b, r, look) => {
  const cap = pick(r, ['#ef5350', '#ff8a65', '#ba68c8', look.accent[0] ?? '#ef5350'])
  const s = range(r, 0.8, 1.3)
  b.add('taper', CREAM, [0, 0.3 * s, 0], [0.36 * s, 0.6 * s, 0.36 * s])
  b.add('dome', cap, [0, 0.52 * s, 0], [1.05 * s, 0.85 * s, 1.05 * s])
  b.add('disc', shade(cap, -0.25), [0, 0.52 * s, 0], [1.0 * s, 1, 1.0 * s])
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r()
    const rad = 0.3 * s
    b.add('sphere', SNOW, [Math.cos(a) * rad, (0.52 + 0.3) * s, Math.sin(a) * rad], [0.16 * s, 0.07 * s, 0.16 * s])
  }
  b.add('sphere', SNOW, [0, 0.94 * s, 0], [0.18 * s, 0.07 * s, 0.18 * s])
}

export const house: PropFn = (b, r, look) => {
  const wall = pick(r, [CREAM, '#ffe2c4', '#f6efe3', '#ffe9a8'])
  const roof = pick(r, [look.accent[0] ?? '#e76f51', '#e76f51', '#d9534f', '#5b8def'])
  b.add('box', wall, [0, 0.95, 0], [2.6, 1.9, 2.3])
  b.add('prism', roof, [0, 2.32, 0], [3.5, 1.7, 2.7], { rot: [0, Math.PI / 2, 0] })
  if (look.snow) b.add('prism', SNOW, [0, 2.5, 0], [3.0, 1.45, 2.8], { rot: [0, Math.PI / 2, 0] })
  b.add('box', WOOD_DARK, [0, 0.55, 1.16], [0.6, 1.1, 0.1])
  b.add('sphere', '#ffd54a', [0.18, 0.55, 1.23], 0.09)
  windowPane(b, look, [-0.8, 1.15, 1.16], [0.5, 0.5, 0.08])
  windowPane(b, look, [0.8, 1.15, 1.16], [0.5, 0.5, 0.08])
  windowPane(b, look, [1.31, 1.15, 0], [0.08, 0.5, 0.5])
  windowPane(b, look, [-1.31, 1.15, 0], [0.08, 0.5, 0.5])
  b.add('box', shade(wall, -0.2), [0.75, 2.75, -0.5], [0.4, 0.9, 0.4])
}

export const tent: PropFn = (b, r, look) => {
  const c = pick(r, [look.accent[1] ?? '#ffb74d', '#ff8a65', '#4db6ac', '#ffca28'])
  b.add('prism', c, [0, 0.62, 0], [2.6, 2.4, 2.6])
  b.add('prism', shade(c, -0.45), [0, 0.5, 1.26], [1.2, 1.7, 0.12])
  b.add('prism', shade(c, 0.35), [0, 0.66, 0], [0.5, 2.46, 2.64])
  b.add('cyl', WOOD, [0, 1.95, 0], [0.07, 0.5, 0.07])
  b.add('cone', look.accent[0] ?? '#e76f51', [0.16, 2.1, 0], [0.3, 0.2, 0.05], { rot: [0, 0, -Math.PI / 2] })
}

export const campfire: PropFn = (b, r, look) => {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    b.add('rock', look.rock, [Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62], [0.32, 0.24, 0.3], { rot: [r(), r(), r()] })
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    b.add('cyl', WOOD_DARK, [Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18], [0.16, 0.9, 0.16], {
      rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9 + 1.2],
    })
  }
  b.add('cone', '#ff7b2e', [0, 0.62, 0], [0.62, 1.05, 0.62], { bucket: 'glow', glow: 2.6 })
  b.add('cone', '#ffc93c', [0.05, 0.52, 0.06], [0.38, 0.75, 0.38], { bucket: 'glow', glow: 3.2 })
  b.add('cone', '#fff3b0', [0, 0.42, 0.1], [0.2, 0.45, 0.2], { bucket: 'glow', glow: 3.6 })
}

export const bench: PropFn = (b) => {
  b.add('box', WOOD, [0, 0.5, 0], [1.9, 0.14, 0.6])
  b.add('box', WOOD, [0, 0.95, -0.27], [1.9, 0.5, 0.12], { rot: [-0.15, 0, 0] })
  for (const x of [-0.75, 0.75]) {
    b.add('box', '#5d6b7a', [x, 0.25, 0.2], [0.12, 0.5, 0.12])
    b.add('box', '#5d6b7a', [x, 0.5, -0.27], [0.12, 1.0, 0.12])
  }
}

export const fence: PropFn = (b, _r, look) => {
  const c = look.snow ? '#e8d5bd' : '#f5e6cf'
  for (let i = -2; i <= 2; i++) {
    b.add('box', c, [i * 0.55, 0.45, 0], [0.2, 0.9, 0.12])
    b.add('pyramid', c, [i * 0.55, 0.98, 0], [0.26, 0.2, 0.16], { rot: [0, Math.PI / 4, 0] })
  }
  b.add('box', shade(c, -0.08), [0, 0.62, 0.02], [2.6, 0.12, 0.08])
  b.add('box', shade(c, -0.08), [0, 0.3, 0.02], [2.6, 0.12, 0.08])
}

export const lantern: PropFn = (b) => {
  b.add('taper', '#4a5568', [0, 0.12, 0], [0.5, 0.24, 0.5])
  b.add('cyl', '#4a5568', [0, 1.2, 0], [0.12, 2.2, 0.12])
  b.add('box', WARM_GLOW, [0, 2.5, 0], [0.42, 0.5, 0.42], { bucket: 'glow', glow: 3 })
  b.add('pyramid', '#4a5568', [0, 2.9, 0], [0.75, 0.32, 0.75], { rot: [0, Math.PI / 4, 0] })
  b.add('box', '#4a5568', [0, 2.22, 0], [0.5, 0.08, 0.5])
}

export const ball: PropFn = (b, r, look) => {
  const c = pick(r, [look.accent[0] ?? '#ef5350', '#ef5350', '#42a5f5'])
  b.add('sphere', c, [0, 0.42, 0], 0.84)
  b.add('torus', SNOW, [0, 0.42, 0], [0.86, 0.9, 0.86], { rot: [0.5, 0, 0.3] })
  b.add('sphere', '#ffd54a', [0, 0.82, 0.02], [0.3, 0.1, 0.3], { rot: [0.1, 0, 0] })
}

export const balloon: PropFn = (b, r, look) => {
  const colors = [look.accent[0] ?? '#ef5350', look.accent[1] ?? '#ffca28', look.accent[2] ?? '#42a5f5']
  const sway = 0.035
  colors.forEach((c, i) => {
    const x = (i - 1) * 0.5
    const top = 2.6 + (i === 1 ? 0.45 : 0) + r() * 0.2
    b.add('cyl', '#fff8ee', [x * 0.5, top / 2, 0], [0.025, top, 0.025], { sway, rot: [0, 0, -x * 0.18] })
    b.add('sphere', c, [x, top + 0.38, 0], [0.72, 0.88, 0.72], { sway })
    b.add('cone', shade(c, -0.15), [x, top - 0.08, 0], [0.14, 0.12, 0.14], { sway })
  })
  b.add('rock', '#8d99ae', [0, 0.1, 0], [0.3, 0.2, 0.3])
}

export const gift: PropFn = (b, r, look) => {
  const c = pick(r, [look.accent[0] ?? '#ef5350', '#7e57c2', '#26a69a', '#ef5350'])
  const ribbon = '#ffd54a'
  b.add('box', c, [0, 0.4, 0], [0.9, 0.8, 0.9])
  b.add('box', ribbon, [0, 0.4, 0], [0.2, 0.83, 0.93])
  b.add('box', ribbon, [0, 0.4, 0], [0.93, 0.83, 0.2])
  b.add('sphere', ribbon, [-0.17, 0.9, 0], [0.34, 0.2, 0.2], { rot: [0, 0, 0.5] })
  b.add('sphere', ribbon, [0.17, 0.9, 0], [0.34, 0.2, 0.2], { rot: [0, 0, -0.5] })
}

export const cake: PropFn = (b, _r, look) => {
  b.add('cyl', '#f4d9b0', [0, 0.06, 0], [1.5, 0.12, 1.5])
  b.add('cyl', '#f7b7c8', [0, 0.4, 0], [1.2, 0.56, 1.2])
  b.add('cyl', CREAM, [0, 0.72, 0], [1.24, 0.12, 1.24])
  b.add('cyl', '#f7b7c8', [0, 1.0, 0], [0.8, 0.45, 0.8])
  b.add('cyl', CREAM, [0, 1.25, 0], [0.84, 0.1, 0.84])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    b.add('sphere', '#e53935', [Math.cos(a) * 0.5, 0.82, Math.sin(a) * 0.5], 0.14)
  }
  b.add('cyl', look.accent[2] ?? '#42a5f5', [0, 1.48, 0], [0.07, 0.36, 0.07])
  b.add('cone', '#ffc93c', [0, 1.76, 0], [0.12, 0.22, 0.12], { bucket: 'glow', glow: 3.4 })
}

export const treasureChest: PropFn = (b) => {
  const gold = '#f6c445'
  b.add('box', WOOD, [0, 0.36, 0], [1.3, 0.72, 0.85])
  b.add('cyl', WOOD_DARK, [0, 0.72, -0.3], [0.85, 1.3, 0.85], { rot: [0.9, 0, Math.PI / 2] })
  for (const x of [-0.45, 0.45]) b.add('box', gold, [x, 0.36, 0], [0.12, 0.76, 0.9])
  b.add('box', gold, [0, 0.52, 0.44], [0.22, 0.26, 0.08])
  for (let i = 0; i < 7; i++) {
    b.add('sphere', gold, [-0.45 + i * 0.15, 0.78 + (i % 2) * 0.06, 0.05 + (i % 3) * 0.08], [0.2, 0.14, 0.2], {
      bucket: 'glow',
      glow: 1.7,
    })
  }
  b.add('gem', '#ff5d8f', [0.2, 0.92, 0.1], [0.2, 0.26, 0.2], { bucket: 'glow', glow: 1.6 })
  b.add('gem', '#5de0ff', [-0.25, 0.9, 0.18], [0.18, 0.24, 0.18], { bucket: 'glow', glow: 1.6 })
}

export const boat: PropFn = (b, r, look) => {
  const hull = pick(r, [look.accent[0] ?? '#e76f51', '#e76f51', '#5b8def'])
  b.add('sphere', hull, [0, 0.3, 0], [2.6, 1.0, 1.2])
  b.add('box', CREAM, [0, 0.62, 0], [2.3, 0.3, 1.0])
  b.add('box', WOOD, [0, 0.72, 0], [2.0, 0.14, 0.8])
  b.add('cyl', WOOD_DARK, [0.1, 1.9, 0], [0.09, 2.5, 0.09])
  b.add('pyramid', SNOW, [0.75, 1.85, 0], [1.6, 2.0, 0.06], { rot: [0, 0, 0], sway: 0.01 })
  b.add('pyramid', shade(hull, 0.5), [-0.45, 1.65, 0], [0.9, 1.5, 0.06], { sway: 0.01 })
  b.add('cone', look.accent[1] ?? '#ffca28', [0.3, 3.1, 0], [0.4, 0.26, 0.05], { rot: [0, 0, -Math.PI / 2] })
}

export const bridge: PropFn = (b) => {
  const planks = 9
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1) - 0.5
    const y = 0.75 * (1 - 4 * t * t) + 0.08
    b.add('box', i % 2 ? WOOD : shade(WOOD, 0.12), [t * 3.6, y, 0], [0.44, 0.14, 1.5], { rot: [0, 0, -t * 1.5] })
  }
  for (const z of [-0.72, 0.72]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5
      const y = 0.75 * (1 - 4 * t * t)
      b.add('cyl', WOOD_DARK, [t * 3.4, y + 0.42, z], [0.1, 0.8, 0.1])
      b.add('sphere', WOOD_DARK, [t * 3.4, y + 0.85, z], 0.18)
    }
  }
}

export const signpost: PropFn = (b, _r, look) => {
  b.add('cyl', WOOD_DARK, [0, 0.9, 0], [0.14, 1.8, 0.14])
  b.add('box', look.accent[1] ?? '#ffca28', [0.3, 1.5, 0.05], [0.95, 0.3, 0.08])
  b.add('pyramid', look.accent[1] ?? '#ffca28', [0.88, 1.5, 0.05], [0.3, 0.3, 0.08], { rot: [0, 0, -Math.PI / 2] })
  b.add('box', CREAM, [-0.25, 1.1, 0.05], [0.85, 0.28, 0.08])
  b.add('pyramid', CREAM, [-0.78, 1.1, 0.05], [0.28, 0.28, 0.08], { rot: [0, 0, Math.PI / 2] })
}

export const star: PropFn = (b) => {
  const c = '#ffe27a'
  b.add('sphere', c, [0, 1.6, 0], 0.5, { bucket: 'glow', glow: 2.2 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.add('cone', c, [Math.sin(a) * 0.42, 1.6 + Math.cos(a) * 0.42, 0], [0.42, 0.6, 0.3], {
      rot: [0, 0, -a],
      bucket: 'glow',
      glow: 2.2,
    })
  }
}

export const crystal: PropFn = (b, r, look) => {
  const c = pick(r, ['#8be9ff', '#c4a1ff', '#ff9bd2', look.accent[2] ?? '#8be9ff'])
  const shards: [number, number, number, number][] = [
    [0, 1.5, 0, 0],
    [0.42, 1.0, 0.1, -0.45],
    [-0.38, 0.85, -0.05, 0.5],
    [0.05, 0.6, 0.38, 0.2],
  ]
  for (const [x, h, z, tilt] of shards) {
    b.add('gem', c, [x, h * 0.42, z], [0.42, h, 0.42], { rot: [tilt * 0.4, r() * 3, tilt], bucket: 'glow', glow: 1.5 })
  }
  b.add('rock', look.rock, [0, 0.12, 0], [1.1, 0.3, 1.0])
}

export const snowman: PropFn = (b, _r, look) => {
  b.add('sphere', SNOW, [0, 0.55, 0], 1.15)
  b.add('sphere', SNOW, [0, 1.35, 0], 0.85)
  b.add('sphere', SNOW, [0, 1.98, 0], 0.62)
  b.add('cone', '#ff8a3c', [0, 1.98, 0.42], [0.12, 0.4, 0.12], { rot: [Math.PI / 2, 0, 0] })
  for (const x of [-0.13, 0.13]) b.add('sphere', '#2d2a32', [x, 2.08, 0.27], 0.08)
  for (const y of [1.2, 1.45]) b.add('sphere', '#2d2a32', [0, y, 0.42], 0.08)
  b.add('torus', look.accent[0] ?? '#e53935', [0, 1.7, 0], [0.62, 1.2, 0.62])
  b.add('cyl', '#2d2a32', [0, 2.28, 0], [0.62, 0.05, 0.62])
  b.add('cyl', '#2d2a32', [0, 2.48, 0], [0.4, 0.4, 0.4])
  for (const s of [-1, 1]) {
    b.add('cyl', WOOD_DARK, [s * 0.68, 1.45, 0], [0.06, 0.8, 0.06], { rot: [0, 0, -s * 1.0] })
  }
}

export const cactus: PropFn = (b, r) => {
  const c = pick(r, ['#6fbf73', '#5fb07a', '#7cc47a'])
  const h = range(r, 1.5, 2.2)
  b.add('capsule', c, [0, h / 2, 0], [0.6, h / 2, 0.6])
  b.add('capsule', c, [0.5, h * 0.48, 0], [0.34, 0.2, 0.34], { rot: [0, 0, Math.PI / 2] })
  b.add('capsule', c, [0.72, h * 0.62, 0], [0.34, 0.3, 0.34])
  b.add('capsule', c, [-0.48, h * 0.32, 0], [0.32, 0.2, 0.32], { rot: [0, 0, Math.PI / 2] })
  b.add('capsule', c, [-0.68, h * 0.44, 0], [0.32, 0.26, 0.32])
  b.add('sphere', '#ff7eb6', [0, h + 0.02, 0], [0.26, 0.16, 0.26])
  b.add('sphere', '#ffd54a', [0.72, h * 0.62 + 0.33, 0], [0.16, 0.1, 0.16])
}

export const shell: PropFn = (b, r) => {
  const c = pick(r, ['#ffc4d6', '#ffe0b8', '#d8c4ff'])
  for (let i = -2; i <= 2; i++) {
    b.add('sphere', i % 2 ? shade(c, 0.25) : c, [i * 0.12, 0.2, -0.05 - Math.abs(i) * 0.03], [0.2, 0.26, 0.62], {
      rot: [0.35, i * 0.3, 0],
    })
  }
  b.add('sphere', shade(c, -0.15), [0, 0.12, 0.26], [0.3, 0.16, 0.2])
}

export const rocket: PropFn = (b, _r, look) => {
  const red = look.accent[0] ?? '#ef5350'
  b.add('capsule', '#f7f7fb', [0, 2.0, 0], [1.1, 1.0, 1.1])
  b.add('cone', red, [0, 3.75, 0], [1.02, 1.2, 1.02])
  b.add('torus', '#8d99ae', [0, 2.5, 0.5], [0.55, 0.55, 0.55], { rot: [Math.PI / 2, 0, 0] })
  b.add('sphere', '#7fd4ff', [0, 2.5, 0.46], [0.42, 0.42, 0.2])
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    b.add('box', red, [Math.sin(a) * 0.62, 0.75, Math.cos(a) * 0.62], [0.16, 1.4, 0.75], { rot: [0, a, 0] })
  }
  b.add('cyl', '#8d99ae', [0, 0.9, 0], [0.8, 0.25, 0.8])
  b.add('cone', '#ffb03a', [0, 0.38, 0], [0.6, 0.8, 0.6], { rot: [Math.PI, 0, 0], bucket: 'glow', glow: 2.6 })
}

// ---- Scenery that only environments use -------------------------------------------------------------------------

export const palm: PropFn = (b, r) => {
  const lean = range(r, -0.25, 0.25)
  const segments = 6
  let x = 0
  let y = 0
  for (let i = 0; i < segments; i++) {
    const w = 0.42 - i * 0.03
    b.add('taper', i % 2 ? '#c49a6c' : '#b48658', [x, y + 0.3, 0], [w, 0.66, w], { rot: [0, 0, -lean * i * 0.35], sway: 0.012 })
    x += Math.sin(lean * i * 0.35) * 0.6
    y += 0.58
  }
  const fronds = 7
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r() * 0.3
    const c = i % 2 ? '#58b368' : '#6cc47a'
    b.add('sphere', c, [x + Math.cos(a) * 0.95, y - 0.05, Math.sin(a) * 0.95], [2.0, 0.16, 0.62], {
      rot: [0, -a, -0.42],
      sway: 0.02,
    })
  }
  for (let i = 0; i < 3; i++) b.add('sphere', '#7a5236', [x + Math.cos(i * 2.1) * 0.2, y - 0.12, Math.sin(i * 2.1) * 0.2], 0.3)
}

export const cloud: PropFn = (b, r) => {
  const c = '#ffffff'
  b.add('sphere', c, [0, 0, 0], [2.4, 1.4, 1.6])
  b.add('sphere', c, [1.25, -0.15, 0.1], [1.7, 1.05, 1.3])
  b.add('sphere', c, [-1.3, -0.2, -0.1], [1.6, 0.95, 1.2])
  b.add('sphere', c, [0.45, 0.5, -0.15], [1.4, 1.1, 1.2])
  if (r() > 0.5) b.add('sphere', c, [-0.6, 0.38, 0.2], [1.1, 0.85, 1.0])
}

export const hill = (b: PartBuilder, color: string, w: number, h: number) => {
  b.add('sphere', color, [0, 0, 0], [w, h * 2, w * 0.8])
}

export const mountain = (b: PartBuilder, r: Rng, color: string, capColor: string | null, h: number) => {
  const w = h * range(r, 0.95, 1.2)
  const rot: [number, number, number] = [0, r() * 3, 0]
  b.add('cone', color, [0, h / 2, 0], [w, h, w], { rot })
  if (capColor) b.add('cone', capColor, [0, h * 0.8, 0], [w * 0.42, h * 0.42, w * 0.42], { rot })
}

export const tower = (b: PartBuilder, look: Look, wall: string, roof: string, h: number) => {
  b.add('cyl', wall, [0, h / 2, 0], [1.5, h, 1.5])
  b.add('cyl', shade(wall, -0.1), [0, h + 0.1, 0], [1.8, 0.3, 1.8])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    b.add('box', shade(wall, -0.1), [Math.cos(a) * 0.78, h + 0.4, Math.sin(a) * 0.78], [0.34, 0.34, 0.34], { rot: [0, -a, 0] })
  }
  b.add('cone', roof, [0, h + 1.15, 0], [1.5, 1.6, 1.5])
  b.add('cyl', WOOD_DARK, [0, h + 2.2, 0], [0.05, 0.7, 0.05])
  b.add('cone', look.accent[1] ?? '#ffca28', [0.2, h + 2.4, 0], [0.34, 0.4, 0.05], { rot: [0, 0, -Math.PI / 2], sway: 0.004 })
  windowPane(b, look, [0, h * 0.68, 0.74], [0.3, 0.5, 0.08])
}

export const wall = (b: PartBuilder, color: string, length: number, h: number) => {
  b.add('box', color, [0, h / 2, 0], [length, h, 0.7])
  const teeth = Math.round(length / 0.8)
  for (let i = 0; i < teeth; i++) {
    if (i % 2) continue
    b.add('box', shade(color, -0.08), [(i + 0.5) * (length / teeth) - length / 2, h + 0.18, 0], [length / teeth, 0.36, 0.74])
  }
}

export const building = (b: PartBuilder, r: Rng, look: Look, color: string, w: number, h: number) => {
  b.add('box', color, [0, h / 2, 0], [w, h, w * 0.8])
  b.add('box', shade(color, -0.15), [0, h + 0.06, 0], [w * 1.04, 0.14, w * 0.84])
  const cols = Math.max(2, Math.round(w / 0.75))
  const rows = Math.max(2, Math.round(h / 0.95))
  for (let cx = 0; cx < cols; cx++) {
    for (let ry = 0; ry < rows; ry++) {
      const x = (cx + 0.5) * (w / cols) - w / 2
      const y = (ry + 0.6) * (h / rows)
      const on = look.lit && r() > 0.3
      if (on) b.add('box', WARM_GLOW, [x, y, w * 0.4], [0.3, 0.38, 0.06], { bucket: 'glow', glow: 2.2 })
      else b.add('box', look.lit ? '#3d4a70' : GLASS, [x, y, w * 0.4], [0.3, 0.38, 0.06])
    }
  }
}

export const coral: PropFn = (b, r) => {
  const c = pick(r, ['#ff7f8f', '#ffa45c', '#ff6fb5', '#c77dff', '#ffd166'])
  const branches = 4 + Math.floor(r() * 3)
  b.add('sphere', shade(c, -0.1), [0, 0.15, 0], [0.9, 0.4, 0.9])
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + r()
    const tilt = range(r, 0.15, 0.6)
    const h = range(r, 0.5, 1.0)
    const x = Math.cos(a) * 0.22
    const z = Math.sin(a) * 0.22
    b.add('capsule', c, [x + Math.cos(a) * tilt * h * 0.5, h * 0.7, z + Math.sin(a) * tilt * h * 0.5], [0.24, h * 0.5, 0.24], {
      rot: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt],
      sway: 0.01,
    })
    b.add('sphere', shade(c, 0.25), [x + Math.cos(a) * tilt * h * 1.1, h * 1.35, z + Math.sin(a) * tilt * h * 1.1], 0.3, { sway: 0.01 })
  }
}

export const seaweed: PropFn = (b, r) => {
  const c = pick(r, ['#3fbf8f', '#59c9a5', '#2fa37c'])
  const blades = 3 + Math.floor(r() * 2)
  for (let i = 0; i < blades; i++) {
    const x = (i - blades / 2) * 0.25
    const h = range(r, 1.2, 2.6)
    const steps = 4
    for (let s = 0; s < steps; s++) {
      const y = (s + 0.5) * (h / steps)
      b.add('sphere', s % 2 ? c : shade(c, 0.12), [x + Math.sin(s * 1.3 + i) * 0.14, y, Math.cos(i * 2) * 0.12], [0.26, (h / steps) * 1.25, 0.12], {
        sway: 0.06,
      })
    }
  }
}

export const stalagmite = (b: PartBuilder, r: Rng, color: string, h: number, down = false) => {
  const w = h * range(r, 0.3, 0.45)
  b.add('pyramid', color, [0, down ? -h / 2 : h / 2, 0], [w, h, w], { rot: [down ? Math.PI : 0, r() * 3, 0] })
  b.add('pyramid', shade(color, -0.1), [w * 0.5, down ? -h * 0.3 : h * 0.3, w * 0.2], [w * 0.6, h * 0.6, w * 0.6], {
    rot: [down ? Math.PI : 0, r() * 3, 0],
  })
}

export const crater = (b: PartBuilder, color: string, size: number) => {
  b.add('torus', shade(color, 0.1), [0, 0.02, 0], [size, size * 0.55, size])
  b.add('disc', shade(color, -0.18), [0, 0.03, 0], [size * 0.9, 1, size * 0.9])
}

export const umbrella: PropFn = (b, r, look) => {
  const c = pick(r, [look.accent[0] ?? '#ef5350', '#ef5350', '#29b6f6', '#ffca28'])
  b.add('cyl', '#f5f5f5', [0, 1.2, 0], [0.08, 2.4, 0.08], { rot: [0, 0, 0.12] })
  b.add('dome', c, [-0.15, 2.1, 0], [2.6, 1.3, 2.6], { rot: [0, 0, 0.12] })
  b.add('dome', SNOW, [-0.15, 2.12, 0], [1.3, 1.36, 1.3], { rot: [0, 0, 0.12] })
  b.add('sphere', c, [-0.24, 2.82, 0], 0.16)
  b.add('box', pick(r, ['#ffd166', '#80deea', '#f8bbd0']), [0.9, 0.04, 0.5], [1.0, 0.06, 1.9], { rot: [0, 0.3, 0] })
}

export const grassTuft: PropFn = (b, r, look) => {
  const c = shade(pick(r, look.leaf), 0.1)
  for (let i = 0; i < 3; i++) {
    b.add('cone', c, [(i - 1) * 0.1, 0.16, (r() - 0.5) * 0.1], [0.12, 0.34 + r() * 0.12, 0.12], {
      rot: [0, 0, (i - 1) * -0.35],
      sway: 0.08,
    })
  }
}

/** Props a story plan may place by name. */
export const PLAN_PROPS: Record<PropType, PropFn> = {
  tree,
  pine,
  bush,
  rock,
  flower,
  mushroom,
  house,
  tent,
  campfire,
  bench,
  fence,
  lantern,
  ball,
  balloon,
  gift,
  cake,
  treasure_chest: treasureChest,
  boat,
  bridge,
  signpost,
  star,
  crystal,
  snowman,
  cactus,
  shell,
  rocket,
}

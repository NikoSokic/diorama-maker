// Scenery is built from simple rounded primitives and merged into a handful of meshes with vertex colours:
// one draw call for all solid scenery, one for glowing bits, one for water. Cheap enough for phones.

import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Shape =
  | 'sphere'
  | 'dome'
  | 'box'
  | 'cyl'
  | 'taper'
  | 'cone'
  | 'pyramid'
  | 'prism'
  | 'capsule'
  | 'torus'
  | 'rock'
  | 'gem'
  | 'disc'
  | 'blob'
  | 'spike'

export type Bucket = 'solid' | 'glow' | 'water'
type Vec3 = [number, number, number]

function prepared(geometry: BufferGeometry, flat = false): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.deleteAttribute('uv')
  if (flat) g.computeVertexNormals()
  return g
}

let cache: Record<Shape, BufferGeometry> | null = null

/** Unit-sized base shapes (about 1 unit wide and tall), origin in the centre unless noted. */
function shapes(): Record<Shape, BufferGeometry> {
  cache ??= {
    sphere: prepared(new SphereGeometry(0.5, 20, 14)),
    // Half sphere sitting on y = 0.
    dome: prepared(new SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    box: prepared(new RoundedBoxGeometry(1, 1, 1, 3, 0.1)),
    cyl: prepared(new CylinderGeometry(0.5, 0.5, 1, 18)),
    // Cylinder that narrows to 65 % at the top: trunks, posts, towers.
    taper: prepared(new CylinderGeometry(0.33, 0.5, 1, 14)),
    cone: prepared(new ConeGeometry(0.5, 1, 18)),
    pyramid: prepared(new ConeGeometry(0.5, 1, 4), true),
    // Triangular prism lying along z, ridge up (roofs, tents): apex y = 0.5, base y = -0.25, 0.87 wide.
    prism: prepared(new CylinderGeometry(0.5, 0.5, 1, 3).rotateX(Math.PI / 2).rotateZ(Math.PI), true),
    // 1 wide, 2 tall.
    capsule: prepared(new CapsuleGeometry(0.5, 1, 6, 14)),
    torus: prepared(new TorusGeometry(0.5, 0.12, 8, 22).rotateX(Math.PI / 2)),
    rock: prepared(new IcosahedronGeometry(0.5, 1), true),
    gem: prepared(new OctahedronGeometry(0.5, 0), true),
    disc: prepared(new CylinderGeometry(0.5, 0.5, 0.02, 24)),
    // Low-resolution sphere and cone, picked automatically for small parts.
    blob: prepared(new SphereGeometry(0.5, 10, 7)),
    spike: prepared(new ConeGeometry(0.5, 1, 6)),
  }
  return cache
}

const tmpColor = new Color()
const tmpPos = new Vector3()
const tmpScale = new Vector3()
const tmpQuat = new Quaternion()
const tmpEuler = new Euler()

export interface PartOptions {
  rot?: Vec3
  bucket?: Bucket
  /** Wind sway amount; the vertex shader bends the part more the higher it is above the ground. */
  sway?: number
  /** Brightness multiplier for glow parts (pushes them over the bloom threshold). */
  glow?: number
}

export interface BuiltScenery {
  solid: BufferGeometry | null
  glow: BufferGeometry | null
  water: BufferGeometry | null
}

export class PartBuilder {
  private readonly parts: Record<Bucket, BufferGeometry[]> = { solid: [], glow: [], water: [] }
  private readonly stack: Matrix4[] = [new Matrix4()]
  private frameScale = 1

  private get top() {
    return this.stack[this.stack.length - 1]
  }

  /** Runs `fn` with a local frame: position, y-rotation and uniform scale of one prop. */
  at(x: number, y: number, z: number, rotY: number, scale: number, fn: () => void): void {
    const m = new Matrix4().compose(
      tmpPos.set(x, y, z),
      tmpQuat.setFromEuler(tmpEuler.set(0, rotY, 0)),
      tmpScale.set(scale, scale, scale),
    )
    this.stack.push(this.top.clone().multiply(m))
    const previous = this.frameScale
    this.frameScale = previous * scale
    fn()
    this.frameScale = previous
    this.stack.pop()
  }

  add(shape: Shape, color: string, pos: Vec3, scale: Vec3 | number, options: PartOptions = {}): void {
    const s: Vec3 = typeof scale === 'number' ? [scale, scale, scale] : scale
    // Small parts get the low-resolution variant; nobody can tell and it keeps the vertex count down.
    const size = Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2])) * this.frameScale
    const lod: Shape = shape === 'sphere' && size < 0.75 ? 'blob' : shape === 'cone' && size < 0.5 ? 'spike' : shape
    const g = shapes()[lod].clone()
    const rot = options.rot ?? [0, 0, 0]
    const local = new Matrix4().compose(
      tmpPos.set(pos[0], pos[1], pos[2]),
      tmpQuat.setFromEuler(tmpEuler.set(rot[0], rot[1], rot[2])),
      tmpScale.set(s[0], s[1], s[2]),
    )
    g.applyMatrix4(this.top.clone().multiply(local))

    const count = g.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    tmpColor.set(color)
    if (options.glow) tmpColor.multiplyScalar(options.glow)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))

    const sway = new Float32Array(count)
    if (options.sway) {
      const position = g.getAttribute('position')
      const baseY = this.top.elements[13]
      for (let i = 0; i < count; i++) sway[i] = options.sway * Math.max(0, position.getY(i) - baseY)
    }
    g.setAttribute('sway', new BufferAttribute(sway, 1))

    this.parts[options.bucket ?? 'solid'].push(g)
  }

  build(): BuiltScenery {
    const merge = (list: BufferGeometry[]) => {
      if (list.length === 0) return null
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      return merged
    }
    return { solid: merge(this.parts.solid), glow: merge(this.parts.glow), water: merge(this.parts.water) }
  }
}

/** Mixes two hex colours (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), t).getHexString()
}

export function shade(color: string, amount: number): string {
  // Positive lightens towards warm white, negative darkens towards a deep violet (never plain black).
  return amount >= 0 ? mix(color, '#fff6e6', amount) : mix(color, '#2a1f3d', -amount)
}

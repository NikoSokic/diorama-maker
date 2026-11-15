// Generates the small procedural sample GLBs used by TRIPO_MODE=mock (own work, released as CC0).
// Usage: node scripts/make-mock-glbs.mjs   → writes backend/src/main/resources/mock-models/*.glb
// The rigged biped sample (biped.glb) is not generated here, see mock-models/CREDITS.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'src', 'main', 'resources', 'mock-models')

/** Flat-shaded low-poly ellipsoid as non-indexed triangles. */
function ellipsoid([rx, ry, rz], [cx, cy, cz] = [0, 0, 0], seg = 8, rings = 5) {
  const p = (i, j) => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / rings) * Math.PI
    return [cx + rx * Math.sin(ph) * Math.cos(th), cy + ry * Math.cos(ph), cz + rz * Math.sin(ph) * Math.sin(th)]
  }
  const tris = []
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1)
      if (j > 0) tris.push(a, b, c)
      if (j < rings - 1) tris.push(a, c, d)
    }
  }
  return tris
}

const part = (color, ...shapes) => ({ color, tris: shapes.flat() })

function buildGlb({ nodes, animations = [] }) {
  const chunks = []
  let offset = 0
  const bufferViews = [], accessors = [], materials = [], meshes = []
  const addView = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
    const pad = (4 - (bytes.length % 4)) % 4
    chunks.push(bytes, Buffer.alloc(pad))
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) })
    offset += bytes.length + pad
    return bufferViews.length - 1
  }
  const addAccessor = (typed, type, target, minMax = false) => {
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type]
    const acc = { bufferView: addView(typed, target), componentType: 5126, count: typed.length / size, type }
    if (minMax) {
      acc.min = Array(size).fill(Infinity)
      acc.max = Array(size).fill(-Infinity)
      typed.forEach((v, i) => {
        acc.min[i % size] = Math.min(acc.min[i % size], v)
        acc.max[i % size] = Math.max(acc.max[i % size], v)
      })
    }
    accessors.push(acc)
    return accessors.length - 1
  }
  const materialFor = (color) => {
    const key = color.join(',')
    let i = materials.findIndex((m) => m.extras.key === key)
    if (i < 0) {
      materials.push({ pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 0.85 }, extras: { key } })
      i = materials.length - 1
    }
    return i
  }
  const gltfNodes = nodes.map((n) => {
    const out = { name: n.name }
    if (n.translation) out.translation = n.translation
    if (n.children) out.children = n.children
    if (n.parts) {
      const primitives = n.parts.map(({ color, tris }) => {
        const pos = new Float32Array(tris.flat())
        const nor = new Float32Array(pos.length)
        for (let t = 0; t < pos.length; t += 9) {
          const u = [pos[t + 3] - pos[t], pos[t + 4] - pos[t + 1], pos[t + 5] - pos[t + 2]]
          const v = [pos[t + 6] - pos[t], pos[t + 7] - pos[t + 1], pos[t + 8] - pos[t + 2]]
          let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]
          const len = Math.hypot(nx, ny, nz) || 1
          // ellipsoid() already winds counter-clockwise seen from outside, so the face normal points outward
          nx /= len; ny /= len; nz /= len
          for (let k = 0; k < 3; k++) nor.set([nx, ny, nz], t + k * 3)
        }
        return {
          attributes: { POSITION: addAccessor(pos, 'VEC3', 34962, true), NORMAL: addAccessor(nor, 'VEC3', 34962) },
          material: materialFor(color),
        }
      })
      meshes.push({ name: n.name, primitives })
      out.mesh = meshes.length - 1
    }
    return out
  })
  const gltfAnimations = animations.map((a) => {
    const samplers = [], channels = []
    for (const ch of a.channels) {
      const input = addAccessor(new Float32Array(ch.times), 'SCALAR', undefined, true)
      const output = addAccessor(new Float32Array(ch.values.flat()), ch.path === 'rotation' ? 'VEC4' : 'VEC3')
      samplers.push({ input, output, interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: nodes.findIndex((n) => n.name === ch.node), path: ch.path } })
    }
    return { name: a.name, samplers, channels }
  })
  const json = {
    asset: { version: '2.0', generator: 'diorama-maker mock generator', copyright: 'CC0 1.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: gltfNodes,
    meshes,
    materials: materials.map(({ extras, ...m }) => m),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
    ...(gltfAnimations.length ? { animations: gltfAnimations } : {}),
  }
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)])
  const bin = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + bin.length, 8)
  const chunkHeader = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b }
  return Buffer.concat([header, chunkHeader(jsonBytes.length, 0x4e4f534a), jsonBytes, chunkHeader(bin.length, 0x004e4942), bin])
}

const WHITE = [0.98, 0.97, 0.94], DARK = [0.13, 0.12, 0.16]
const eyes = (y, z, dx, r = 0.07) => [
  part(WHITE, ellipsoid([r, r, r * 0.6], [-dx, y, z], 6, 4), ellipsoid([r, r, r * 0.6], [dx, y, z], 6, 4)),
  part(DARK, ellipsoid([r * 0.5, r * 0.5, r * 0.4], [-dx, y, z + r * 0.45], 6, 4), ellipsoid([r * 0.5, r * 0.5, r * 0.4], [dx, y, z + r * 0.45], 6, 4)),
]

// --- creature: round blob with eyes, feet and an antenna (not riggable) ---
const creature = () => {
  const body = [0.56, 0.78, 0.95], accent = [0.99, 0.74, 0.45]
  return buildGlb({
    nodes: [{
      name: 'Creature',
      parts: [
        part(body, ellipsoid([0.45, 0.42, 0.42], [0, 0.48, 0], 10, 7)),
        part(accent,
          ellipsoid([0.13, 0.07, 0.17], [-0.2, 0.07, 0.05], 6, 4), ellipsoid([0.13, 0.07, 0.17], [0.2, 0.07, 0.05], 6, 4),
          ellipsoid([0.03, 0.12, 0.03], [0, 0.98, 0], 5, 3), ellipsoid([0.07, 0.07, 0.07], [0, 1.12, 0], 6, 4)),
        ...eyes(0.58, 0.37, 0.15, 0.09),
      ],
    }],
  })
}

// --- object: toy mushroom (not riggable) ---
const object = () => {
  const cap = [0.95, 0.45, 0.45], stem = [0.97, 0.92, 0.82]
  const dots = [[0.2, 0.74, 0.22], [-0.22, 0.76, 0.12], [0.02, 0.84, -0.12], [-0.1, 0.7, 0.33], [0.28, 0.7, -0.14]]
  return buildGlb({
    nodes: [{
      name: 'Mushroom',
      parts: [
        part(stem, ellipsoid([0.17, 0.3, 0.17], [0, 0.3, 0], 8, 5)),
        part(cap, ellipsoid([0.48, 0.3, 0.48], [0, 0.62, 0], 10, 6)),
        part(WHITE, ...dots.map((c) => ellipsoid([0.07, 0.05, 0.07], c, 6, 4))),
      ],
    }],
  })
}

// --- quadruped: toy animal with four leg nodes and a looping "Walk" clip ---
const quadruped = () => {
  const fur = [0.96, 0.63, 0.35], belly = [0.99, 0.9, 0.78]
  const hips = { LegFL: [0.19, 0.42, 0.3], LegFR: [-0.19, 0.42, 0.3], LegBL: [0.19, 0.42, -0.3], LegBR: [-0.19, 0.42, -0.3] }
  const legNames = Object.keys(hips)
  const nodes = [
    { name: 'Quadruped', children: [1, 2, 3, 4, 5, 6] },
    {
      name: 'Body',
      parts: [
        part(fur, ellipsoid([0.3, 0.27, 0.5], [0, 0.56, 0], 10, 6), ellipsoid([0.25, 0.23, 0.24], [0, 0.86, 0.5], 8, 6),
          ellipsoid([0.07, 0.11, 0.05], [-0.15, 1.08, 0.46], 5, 3), ellipsoid([0.07, 0.11, 0.05], [0.15, 1.08, 0.46], 5, 3)),
        part(belly, ellipsoid([0.13, 0.1, 0.13], [0, 0.8, 0.7], 6, 4), ellipsoid([0.08, 0.08, 0.2], [0, 0.72, -0.6], 6, 4)),
        part(DARK, ellipsoid([0.04, 0.035, 0.03], [0, 0.83, 0.83], 5, 3)),
        ...eyes(0.93, 0.7, 0.11, 0.055),
      ],
    },
    ...legNames.map((name) => ({
      name,
      translation: hips[name],
      parts: [part(fur, ellipsoid([0.09, 0.22, 0.09], [0, -0.2, 0], 6, 4)), part(belly, ellipsoid([0.1, 0.05, 0.12], [0, -0.38, 0.02], 6, 3))],
    })),
    { name: 'Spare' },
  ]
  const steps = 16
  const times = Array.from({ length: steps + 1 }, (_, i) => i / steps)
  const swing = (phase) => times.map((t) => { const a = 0.55 * Math.sin(t * Math.PI * 2 + phase); return [Math.sin(a / 2), 0, 0, Math.cos(a / 2)] })
  const walk = {
    name: 'Walk',
    channels: [
      { node: 'LegFL', path: 'rotation', times, values: swing(0) },
      { node: 'LegBR', path: 'rotation', times, values: swing(0) },
      { node: 'LegFR', path: 'rotation', times, values: swing(Math.PI) },
      { node: 'LegBL', path: 'rotation', times, values: swing(Math.PI) },
      { node: 'Body', path: 'translation', times, values: times.map((t) => [0, 0.025 * Math.abs(Math.sin(t * Math.PI * 2)), 0]) },
    ],
  }
  return buildGlb({ nodes, animations: [walk] })
}

mkdirSync(OUT, { recursive: true })
for (const [name, make] of Object.entries({ creature, object, quadruped })) {
  const glb = make()
  writeFileSync(join(OUT, `${name}.glb`), glb)
  console.log(`${name}.glb  ${glb.length} bytes`)
}

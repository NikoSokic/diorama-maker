// The floating island every scene stands on, the water slab around it and the "which scenes share a place" rule.

import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, LatheGeometry, Vector2 } from 'three'
import type { PlanProp, StoryPlan } from '../../api/types'
import { hashString } from '../engine/easing'
import type { CompiledScene } from '../engine/timeline'
import type { EnvPreset, SceneryInput } from './environments'
import { shade } from './parts'

const DEPTH = 4.4

/** Adds the per-vertex attributes the scenery materials expect. */
function paint(geometry: BufferGeometry, colorAt: (x: number, y: number, z: number, out: Color) => void) {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const c = new Color()
  for (let i = 0; i < position.count; i++) {
    colorAt(position.getX(i), position.getY(i), position.getZ(i), c)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('sway', new BufferAttribute(new Float32Array(position.count), 1))
  return geometry
}

/** A chunk of land: flat top at y = 0, a rounded lip, and rock that narrows to a point underneath. */
export function buildIsland(env: EnvPreset, seed: number): BufferGeometry {
  const R = env.radius
  // Profile from the bottom tip up to the rim and in to the centre (this order gives outward-facing sides).
  const profile: [number, number][] = [
    [0.001, -DEPTH],
    [R * 0.16, -DEPTH + 0.35],
    [R * 0.34, -3.3],
    [R * 0.56, -2.4],
    [R * 0.78, -1.5],
    [R * 0.93, -0.92],
    [R * 0.985, -0.62],
    // Two rings close together make a crisp line between soil and the lip.
    [R * 0.995, -0.56],
    [R + 0.05, -0.4],
    [R + 0.05, -0.2],
    [R - 0.03, -0.07],
    [R - 0.2, -0.012],
    [R - 0.45, 0],
    [R * 0.5, 0],
    [0.001, 0],
  ]
  const geometry = new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 72)
  const position = geometry.getAttribute('position')
  const phase = (seed % 97) * 0.13

  // Rocky underside: push the rings in and out. Whole multiples of the angle keep the seam closed.
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    if (y > -0.6) continue
    const angle = Math.atan2(x, z)
    const depth = Math.min(1, (-y - 0.6) / 1.2)
    const n = Math.sin(angle * 5 + y * 2.1 + phase) * 0.55 + Math.sin(angle * 9 - y * 3.7 + phase * 2) * 0.3 + Math.sin(angle * 2 + phase) * 0.4
    const k = 1 + n * 0.11 * depth
    position.setXYZ(i, x * k, y + n * 0.18 * depth, z * k)
  }
  geometry.computeVertexNormals()

  const top = new Color(env.ground.top)
  const lip = new Color(env.ground.lip)
  const soil = new Color(env.ground.soil)
  const soilDark = new Color(env.ground.soilDark)
  const edge = new Color(shade(env.ground.top, -0.08))
  return paint(geometry, (x, y, z, out) => {
    if (y > -0.005) {
      // A slightly darker rim keeps the top from looking like a flat sticker.
      const r = Math.hypot(x, z) / R
      out.copy(top).lerp(edge, Math.max(0, (r - 0.8) / 0.2) * 0.6)
    } else if (y > -0.58) out.copy(lip)
    else {
      const band = Math.sin(y * 5.5 + Math.atan2(x, z) * 3) * 0.12
      out.copy(soil).lerp(soilDark, Math.min(1, Math.max(0, (-y - 0.6) / (DEPTH - 1.2) + band)))
    }
  })
}

/** A thick disc of toy water around the island; its top is a little below the grass. */
export function buildWaterSlab(env: EnvPreset): BufferGeometry {
  const geometry = new CylinderGeometry(env.waterRadius, env.waterRadius * 0.93, 1.5, 72, 1)
  geometry.translate(0, -0.75 - 0.2, 0)
  const surface = new Color(env.waterColor)
  const deep = new Color(shade(env.waterColor, -0.45))
  return paint(geometry, (_x, y, _z, out) => out.copy(surface).lerp(deep, Math.min(1, Math.max(0, (-y - 0.25) / 1.2))))
}

const MAX_PLAN_PROPS = 9

/**
 * Scenery input for the place a scene happens in. All scenes of the story with the same environment share
 * one layout (and all their props), so a fade between two scenes in the meadow never reshuffles the trees
 * and coming back to the meadow later shows the same meadow.
 */
export function placeInput(plan: StoryPlan, scenes: CompiledScene[], sceneIndex: number, lit: boolean, slug: string): SceneryInput {
  const environment = scenes[sceneIndex].scene.environment
  const props: PlanProp[] = []
  const seen = new Set<string>()
  const avoid: { x: number; z: number }[] = []

  for (const compiled of scenes) {
    if (compiled.scene.environment !== environment) continue
    for (const prop of compiled.scene.props ?? []) {
      const id = `${prop.type}:${Math.round(prop.x)}:${Math.round(prop.z)}`
      if (seen.has(id) || props.length >= MAX_PLAN_PROPS) continue
      seen.add(id)
      props.push(prop)
    }
    for (const key in compiled.tracks) {
      const track = compiled.tracks[key]
      if (track.initial.visible) avoid.push({ x: track.initial.x, z: track.initial.z })
      for (const segment of track.segments) {
        if (segment.from.visible) avoid.push({ x: segment.from.x, z: segment.from.z })
        avoid.push({ x: segment.to.x, z: segment.to.z })
      }
    }
  }

  return { environment, lit, palette: plan.palette, props, avoid, seed: hashString(`${slug}:${environment}`) }
}

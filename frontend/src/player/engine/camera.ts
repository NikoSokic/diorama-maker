// Cinematic camera: every shot type is a pure function of the scene, the characters' poses and time.
// The rig component damps towards the result, so a shot only has to say where it wants the camera.

import { clamp, clamp01, easeInOutSine, lerp } from './easing'
import type { Phase } from './store'
import type { ActorPose, CompiledScene } from './timeline'

export type V3 = [number, number, number]

export interface Shot {
  position: V3
  target: V3
  /** Vertical field of view in degrees. */
  fov: number
}

export interface ShotInput {
  scene: CompiledScene
  poses: Record<string, ActorPose>
  /** Standing height of each character in world units. */
  heights: Record<string, number>
  sceneTime: number
  /** Continuous time, for slow drifts that must not restart with the scene. */
  animTime: number
  /** Viewport width / height. */
  aspect: number
  phase: Phase
}

const BASE_FOV = 34
const WIDE_DISTANCE = 16.5

/** How much further back the camera must stand on a narrow (portrait) screen to keep the same width in view. */
export function fitFactor(aspect: number) {
  // Portrait screens frame the play area rather than the whole island, or everybody would be tiny.
  return clamp(0.62 + 0.45 / Math.max(aspect, 0.3), 1, 1.6)
}

function fovFor(aspect: number, base = BASE_FOV) {
  // Portrait screens get a wider lens as well, so the camera does not have to back off quite as far.
  return base + clamp((1.2 - aspect) * 14, 0, 12)
}

interface Subject {
  key: string
  x: number
  z: number
  height: number
}

function subjects(input: ShotInput): Subject[] {
  const list: Subject[] = []
  for (const key in input.poses) {
    const p = input.poses[key]
    if (!p.visible) continue
    list.push({ key, x: p.x, z: p.z, height: (input.heights[key] ?? 1.6) * p.scale })
  }
  return list
}

function centroid(list: Subject[]): { x: number; z: number; height: number } {
  if (list.length === 0) return { x: 0, z: 0, height: 1.6 }
  const sum = list.reduce((a, s) => ({ x: a.x + s.x, z: a.z + s.z, height: Math.max(a.height, s.height) }), { x: 0, z: 0, height: 0 })
  return { x: sum.x / list.length, z: sum.z / list.length, height: sum.height }
}

function wide(input: ShotInput, list: Subject[]): Shot {
  const c = centroid(list)
  const fit = fitFactor(input.aspect)
  // Alternate the side a little from scene to scene so two wide shots in a row are not the same picture.
  const side = input.scene.index % 2 === 0 ? -1 : 1
  return {
    position: [c.x * 0.25 + side * 2.4, 4.5 + (fit - 1) * 2.2, WIDE_DISTANCE * fit],
    target: [c.x * 0.4, 1.9, c.z * 0.3 - 0.6],
    fov: fovFor(input.aspect),
  }
}

function closeup(input: ShotInput, subject: Subject): Shot {
  const fit = Math.sqrt(fitFactor(input.aspect))
  const dist = Math.max(5, subject.height * 3.4) * fit
  // Stand on the side nearer the middle of the stage, so the backdrop stays behind the character.
  const side = subject.x > 0.3 ? -1 : 1
  return {
    position: [subject.x + side * dist * 0.36, subject.height * 0.8 + 0.7, subject.z + dist],
    target: [subject.x, subject.height * 0.6, subject.z],
    fov: fovFor(input.aspect, 30),
  }
}

function orbit(input: ShotInput, list: Subject[]): Shot {
  const c = centroid(list)
  const fit = fitFactor(input.aspect)
  // A slow arc across the front of the stage; never behind the backdrop.
  const angle = 0.72 * Math.sin(input.sceneTime * 0.2 - Math.PI / 2)
  const radius = 14 * fit
  return {
    position: [c.x * 0.4 + Math.sin(angle) * radius, 5.2 + (fit - 1) * 2, c.z * 0.4 + Math.cos(angle) * radius],
    target: [c.x * 0.5, 1.4, c.z * 0.5],
    fov: fovFor(input.aspect),
  }
}

function follow(input: ShotInput, subject: Subject): Shot {
  const fit = Math.pow(fitFactor(input.aspect), 0.8)
  return {
    position: [subject.x * 0.72, 3.1 + subject.height * 0.35, subject.z + 10 * fit],
    target: [subject.x, subject.height * 0.55, subject.z],
    fov: fovFor(input.aspect, 32),
  }
}

function dollyIn(input: ShotInput, list: Subject[], subject: Subject | undefined): Shot {
  const start = wide(input, list)
  const c = subject ?? centroid(list)
  const fit = Math.pow(fitFactor(input.aspect), 0.8)
  const end: Shot = {
    position: [c.x * 0.85, 2.6 + c.height * 0.4, c.z + 8 * fit],
    target: [c.x, c.height * 0.6, c.z],
    fov: fovFor(input.aspect, 31),
  }
  const k = easeInOutSine(clamp01(input.sceneTime / Math.max(1, input.scene.duration)))
  return {
    position: [lerp(start.position[0], end.position[0], k), lerp(start.position[1], end.position[1], k), lerp(start.position[2], end.position[2], k)],
    target: [lerp(start.target[0], end.target[0], k), lerp(start.target[1], end.target[1], k), lerp(start.target[2], end.target[2], k)],
    fov: lerp(start.fov, end.fov, k),
  }
}

function overShoulder(input: ShotInput, list: Subject[], subject: Subject): Shot {
  const others = list.filter((s) => s.key !== subject.key)
  if (others.length === 0) return closeup(input, subject)
  const o = centroid(others)
  let dx = subject.x - o.x
  let dz = subject.z - o.z
  const len = Math.hypot(dx, dz)
  if (len < 0.5) return closeup(input, subject)
  dx /= len
  dz /= len
  const fit = Math.sqrt(fitFactor(input.aspect))
  // Past the subject's shoulder, but kept on the audience side: the stage has no scenery in front.
  return {
    position: [subject.x + dx * 4.6 * fit, subject.height * 1.1 + 1.5, Math.max(subject.z + dz * 2 + 6.8 * fit, subject.z + 5.5)],
    target: [lerp(subject.x, o.x, 0.75), Math.max(o.height, subject.height) * 0.5, lerp(subject.z, o.z, 0.75)],
    fov: fovFor(input.aspect, 35),
  }
}

/** Slow establishing arc used behind the title card and the end card. */
function establishing(input: ShotInput, list: Subject[], near: boolean): Shot {
  const c = centroid(list)
  const fit = fitFactor(input.aspect)
  const angle = 0.5 * Math.sin(input.animTime * 0.13)
  // The title shot stands far enough back to show the whole floating island, rock underside included.
  const radius = (near ? 15 : 25) * fit
  return {
    position: [Math.sin(angle) * radius, (near ? 4.6 : 7.5) + (fit - 1) * 2.4, Math.cos(angle) * radius],
    target: [c.x * 0.3, near ? 1.7 : 0.4, 0],
    fov: fovFor(input.aspect),
  }
}

export function shotFor(input: ShotInput): Shot {
  const list = subjects(input)
  if (input.phase === 'title') return establishing(input, list, false)
  if (input.phase === 'ended') return establishing(input, list, true)

  const camera = input.scene.scene.camera
  const subject = list.find((s) => s.key === camera.targetKey) ?? list[0]
  // Nobody on stage (everyone still has to enter): show the place.
  if (!subject) return wide(input, list)

  switch (camera.type) {
    case 'closeup':
      return closeup(input, subject)
    case 'orbit':
      return orbit(input, list)
    case 'follow':
      return follow(input, subject)
    case 'dolly_in':
      return dollyIn(input, list, camera.targetKey ? subject : undefined)
    case 'over_shoulder':
      return overShoulder(input, list, subject)
    default:
      return wide(input, list)
  }
}

/** Tiny hand-held drift added on top of a shot; a sum of slow sines, so it never repeats visibly. */
export function handheld(time: number, amount: number): V3 {
  return [
    (Math.sin(time * 0.53) + Math.sin(time * 0.31 + 1.7) * 0.6) * amount,
    (Math.sin(time * 0.41 + 0.6) + Math.sin(time * 0.67 + 2.9) * 0.5) * amount * 0.7,
    Math.sin(time * 0.29 + 4.1) * amount * 0.5,
  ]
}

// Timeline engine: turns a StoryPlan into per-scene character tracks and samples a pose for any time.
// Pure functions (no three.js, no React) so the whole thing can be scrubbed, seeked and unit-tested.

import type { ActionType, Emotion, GridPoint, PlanAction, PlanScene, StoryPlan } from '../../api/types'
import { clamp, clamp01, easeInBack, easeInOutCubic, easeInOutSine, easeOutBack, lerp } from './easing'

/** Characters never walk further from the centre than this (the island is a bit larger). */
export const PLAY_RADIUS = 6.2
/** Where characters pop in and out when they enter / exit. */
export const ENTRY_RADIUS = 7.6
/** Minimum distance kept between two characters' resting places. */
export const MIN_SPACING = 1.5

const POP_TIME = 0.45

export type Motion = 'idle' | 'walk' | 'run' | 'jump' | 'spin' | 'wave' | 'dance' | 'celebrate'

/** The part of a character's state that carries over from action to action and scene to scene. */
export interface BaseState {
  x: number
  z: number
  /** Radians; 0 faces +z, towards the audience. */
  heading: number
  visible: boolean
  /** Multiplier from grow / shrink. */
  scale: number
  emotion: Emotion
}

export interface Segment {
  type: ActionType
  start: number
  /** Effective end: the planned end or the start of the character's next action, whichever is first. */
  end: number
  from: BaseState
  to: BaseState
  emotion: Emotion
  /** Number of hops / turns for jump and spin. */
  count: number
}

export interface Track {
  key: string
  initial: BaseState
  segments: Segment[]
}

export interface CompiledScene {
  index: number
  scene: PlanScene
  duration: number
  tracks: Record<string, Track>
}

export interface ActorPose extends BaseState {
  motion: Motion
  /** Seconds since the current motion started. */
  motionTime: number
  /** 0..1 inside the current action (0 while idle). */
  progress: number
  /** Ground distance covered inside the current action; drives the walk cycle without foot sliding. */
  travel: number
  /** Ground speed in units per second. */
  speed: number
  /** 0..1 pop-in / pop-out factor (enter, exit, appear, hide). */
  pop: number
  /** Jump height factor 0..1 (parabola per hop). */
  lift: number
  /** True while the heading is animated by the engine itself (spin) and must not be smoothed. */
  exactHeading: boolean
}

const MOVES: ReadonlySet<ActionType> = new Set(['enter', 'exit', 'walk_to', 'run_to'])

export function restHeading(x: number): number {
  // Face the audience, turned a little towards the middle of the stage.
  return Math.atan2(-x * 0.22, 1)
}

function headingBetween(fromX: number, fromZ: number, toX: number, toZ: number, fallback: number) {
  const dx = toX - fromX
  const dz = toZ - fromZ
  return Math.hypot(dx, dz) < 1e-3 ? fallback : Math.atan2(dx, dz)
}

function clampToRadius(p: GridPoint, radius: number): GridPoint {
  const r = Math.hypot(p.x, p.z)
  return r <= radius ? { x: p.x, z: p.z } : { x: (p.x / r) * radius, z: (p.z / r) * radius }
}

/** Point on the rim where a character pops in on its way to `to` (or out, coming from it). */
function rimPoint(to: GridPoint, sideHint: number): GridPoint {
  const side = Math.abs(to.x) > 0.4 ? Math.sign(to.x) : sideHint
  const dirX = side * Math.max(1, Math.abs(to.x))
  const dirZ = to.z * 0.45 - 0.6
  const len = Math.hypot(dirX, dirZ)
  return { x: (dirX / len) * ENTRY_RADIUS, z: (dirZ / len) * ENTRY_RADIUS }
}

function defaultSlot(index: number, count: number): GridPoint {
  return { x: (index - (count - 1) / 2) * 2.6, z: 0.6 }
}

/** Keeps a destination away from where the other characters stand. */
function separate(target: GridPoint, key: string, states: Map<string, BaseState>): GridPoint {
  let p = { ...target }
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const [otherKey, other] of states) {
      if (otherKey === key || !other.visible) continue
      const dx = p.x - other.x
      const dz = p.z - other.z
      const dist = Math.hypot(dx, dz)
      if (dist >= MIN_SPACING) continue
      // Push sideways; when exactly on top of each other pick a side from the key order.
      const nx = dist > 1e-3 ? dx / dist : key < otherKey ? -1 : 1
      const nz = dist > 1e-3 ? dz / dist : 0
      p = { x: other.x + nx * MIN_SPACING, z: other.z + nz * MIN_SPACING }
      moved = true
    }
    if (!moved) break
  }
  return clampToRadius(p, PLAY_RADIUS)
}

function firstActionType(plan: StoryPlan, key: string): ActionType | undefined {
  for (const scene of plan.scenes) {
    const first = [...scene.actions].filter((a) => a.characterKey === key).sort((a, b) => a.startAt - b.startAt)[0]
    if (first) return first.type
  }
  return undefined
}

interface Pending {
  action: PlanAction
  end: number
}

function compileScene(
  plan: StoryPlan,
  sceneIndex: number,
  initial: Map<string, BaseState>,
  environmentChanged: boolean,
  lookTargets?: (key: string, t: number) => GridPoint | undefined,
): CompiledScene {
  const scene = plan.scenes[sceneIndex]
  const duration = scene.durationSec
  const keys = plan.characters.map((c) => c.key)

  // Per character: actions in time order, each cut short by the next one.
  const pending: Pending[] = []
  for (const key of keys) {
    const own = scene.actions
      .filter((a) => a.characterKey === key)
      .map((a) => ({ ...a, startAt: clamp(a.startAt, 0, duration) }))
      .sort((a, b) => a.startAt - b.startAt)
    own.forEach((action, i) => {
      const plannedEnd = Math.min(duration, action.startAt + Math.max(0.2, action.duration))
      const end = i + 1 < own.length ? Math.min(plannedEnd, own[i + 1].startAt) : plannedEnd
      if (end - action.startAt > 0.05) pending.push({ action, end })
    })
  }
  pending.sort((a, b) => a.action.startAt - b.action.startAt)

  const states = new Map<string, BaseState>()
  const tracks: Record<string, Track> = {}
  for (const key of keys) {
    const start = { ...initial.get(key)! }
    // Arriving somewhere new with an "enter": do not stand around at the old spot before walking in.
    const first = pending.find((p) => p.action.characterKey === key)
    if (environmentChanged && first?.action.type === 'enter') start.visible = false
    states.set(key, start)
    tracks[key] = { key, initial: { ...start }, segments: [] }
  }

  for (const { action, end } of pending) {
    const key = action.characterKey
    const from = { ...states.get(key)! }
    const to = { ...from }
    const emotion = action.emotion ?? from.emotion
    to.emotion = emotion
    const index = keys.indexOf(key)
    const sideHint = index % 2 === 0 ? -1 : 1
    const length = end - action.startAt
    let type = action.type
    let count = 1

    // "enter" for somebody already on stage in the same place is just a walk.
    if (type === 'enter' && from.visible && !environmentChanged) type = 'walk_to'

    switch (type) {
      case 'enter': {
        const dest = separate(clampToRadius(action.to ?? defaultSlot(index, keys.length), PLAY_RADIUS), key, states)
        const rim = rimPoint(dest, sideHint)
        from.x = rim.x
        from.z = rim.z
        from.visible = true
        from.heading = headingBetween(rim.x, rim.z, dest.x, dest.z, 0)
        Object.assign(to, { x: dest.x, z: dest.z, visible: true, heading: from.heading })
        break
      }
      case 'exit': {
        const rim = rimPoint(action.to ?? { x: from.x, z: from.z }, sideHint)
        Object.assign(to, { x: rim.x, z: rim.z, visible: false })
        to.heading = headingBetween(from.x, from.z, rim.x, rim.z, from.heading)
        break
      }
      case 'walk_to':
      case 'run_to': {
        const dest = separate(clampToRadius(action.to ?? { x: from.x, z: from.z }, PLAY_RADIUS), key, states)
        to.x = dest.x
        to.z = dest.z
        to.heading = headingBetween(from.x, from.z, dest.x, dest.z, from.heading)
        break
      }
      case 'jump': {
        count = Math.max(1, Math.round(length / 0.85))
        if (action.to) {
          const dest = separate(clampToRadius(action.to, PLAY_RADIUS), key, states)
          if (Math.hypot(dest.x - from.x, dest.z - from.z) > 0.4) {
            to.x = dest.x
            to.z = dest.z
            to.heading = headingBetween(from.x, from.z, dest.x, dest.z, from.heading)
          }
        }
        break
      }
      case 'spin':
        count = Math.max(1, Math.round(length / 1.3))
        break
      case 'look_at': {
        const target = (action.targetKey && lookTargets?.(action.targetKey, (action.startAt + end) / 2)) || action.to
        if (target) to.heading = headingBetween(from.x, from.z, target.x, target.z, from.heading)
        break
      }
      case 'grow':
        to.scale = clamp(from.scale * 1.6, 0.35, 2.6)
        break
      case 'shrink':
        to.scale = clamp(from.scale * 0.55, 0.35, 2.6)
        break
      case 'hide':
        to.visible = false
        break
      case 'appear': {
        if (action.to) {
          const dest = separate(clampToRadius(action.to, PLAY_RADIUS), key, states)
          from.x = to.x = dest.x
          from.z = to.z = dest.z
        }
        if (!from.visible) from.heading = to.heading = restHeading(to.x)
        to.visible = true
        break
      }
      default:
        break
    }

    tracks[key].segments.push({ type, start: action.startAt, end, from, to, emotion, count })
    // Whoever has arrived somewhere turns back to the audience; the next action starts from that pose,
    // not from the direction of travel.
    const arrived = to.visible && (MOVES.has(type) || type === 'jump')
    states.set(key, arrived ? { ...to, heading: restHeading(to.x) } : { ...to })
  }

  return { index: sceneIndex, scene, duration, tracks }
}

/** Compiles every scene. Character state carries over from one scene to the next. */
export function compileStory(plan: StoryPlan): CompiledScene[] {
  const keys = plan.characters.map((c) => c.key)
  const compiled: CompiledScene[] = []
  let carry = new Map<string, BaseState>()

  keys.forEach((key, i) => {
    const slot = defaultSlot(i, keys.length)
    const first = firstActionType(plan, key)
    carry.set(key, {
      x: slot.x,
      z: slot.z,
      heading: restHeading(slot.x),
      visible: !(first === 'enter' || first === 'appear'),
      scale: 1,
      emotion: 'neutral',
    })
  })

  plan.scenes.forEach((scene, index) => {
    const environmentChanged = index > 0 && plan.scenes[index - 1].environment !== scene.environment
    // Pass 1 gives positions, pass 2 resolves look_at against them (look_at never moves anybody).
    const draft = compileScene(plan, index, carry, environmentChanged)
    const final = compileScene(plan, index, carry, environmentChanged, (key, t) => {
      const track = draft.tracks[key]
      return track ? samplePose(track, t) : undefined
    })
    compiled.push(final)

    const next = new Map<string, BaseState>()
    for (const key of keys) {
      const track = final.tracks[key]
      const last = track.segments[track.segments.length - 1]
      const end = last ? last.to : track.initial
      // Emotions do not leak into the next scene; a new scene starts calm.
      next.set(key, { ...end, heading: end.visible ? restHeading(end.x) : end.heading, emotion: 'neutral' })
    }
    carry = next
  })

  return compiled
}

function idlePose(state: BaseState, since: number): ActorPose {
  return {
    ...state,
    motion: 'idle',
    motionTime: Math.max(0, since),
    progress: 0,
    travel: 0,
    speed: 0,
    pop: state.visible ? 1 : 0,
    lift: 0,
    exactHeading: false,
  }
}

const MOTION_OF: Partial<Record<ActionType, Motion>> = {
  enter: 'walk',
  exit: 'walk',
  walk_to: 'walk',
  run_to: 'run',
  jump: 'jump',
  spin: 'spin',
  wave: 'wave',
  dance: 'dance',
  celebrate: 'celebrate',
}

function sampleSegment(seg: Segment, t: number): ActorPose {
  const length = seg.end - seg.start
  const local = t - seg.start
  const p = clamp01(local / length)
  const pose = idlePose({ ...seg.from, emotion: seg.emotion }, local)
  pose.visible = true
  pose.pop = seg.from.visible ? 1 : 0
  pose.progress = p
  pose.motion = MOTION_OF[seg.type] ?? 'idle'

  const dist = Math.hypot(seg.to.x - seg.from.x, seg.to.z - seg.from.z)
  const moveAlong = (eased: number) => {
    pose.x = lerp(seg.from.x, seg.to.x, eased)
    pose.z = lerp(seg.from.z, seg.to.z, eased)
    pose.travel = dist * eased
    pose.heading = seg.to.heading
  }

  if (MOVES.has(seg.type)) {
    const eased = easeInOutSine(p)
    moveAlong(eased)
    // Derivative of easeInOutSine, so the walk cycle slows down with the character.
    pose.speed = (dist / length) * (Math.PI / 2) * Math.sin(Math.PI * p)
    if (dist < 0.05) pose.motion = 'idle'
  }

  switch (seg.type) {
    case 'enter':
      pose.pop = easeOutBack(local / POP_TIME)
      break
    case 'exit':
      pose.pop = 1 - easeInBack((local - (length - POP_TIME)) / POP_TIME)
      break
    case 'jump': {
      const phase = (p * seg.count) % 1
      pose.lift = p >= 1 ? 0 : 4 * phase * (1 - phase)
      if (dist > 0) moveAlong(p)
      break
    }
    case 'spin':
      pose.heading = seg.from.heading + Math.PI * 2 * seg.count * easeInOutCubic(p)
      pose.exactHeading = true
      break
    case 'look_at':
      pose.heading = seg.to.heading
      break
    case 'grow':
    case 'shrink':
      pose.scale = lerp(seg.from.scale, seg.to.scale, easeOutBack(p))
      break
    case 'hide':
      pose.pop = 1 - easeInBack(local / Math.min(length, POP_TIME * 1.4))
      break
    case 'appear':
      pose.pop = easeOutBack(local / Math.min(length, POP_TIME * 1.4))
      break
    default:
      break
  }

  pose.pop = clamp(pose.pop, 0, 1.25)
  pose.visible = pose.pop > 0.01
  return pose
}

/** Pose of one character at scene time `t` (seconds). */
export function samplePose(track: Track, t: number): ActorPose {
  let current: Segment | undefined
  for (const seg of track.segments) {
    if (seg.start <= t) current = seg
    else break
  }
  if (!current) return idlePose(track.initial, t)
  if (t < current.end) return sampleSegment(current, t)

  // After an action: stand where it ended and turn back towards the audience.
  const pose = idlePose(current.to, t - current.end)
  if (pose.visible && current.type !== 'look_at') pose.heading = restHeading(pose.x)
  return pose
}

export function sampleScene(scene: CompiledScene, t: number): Record<string, ActorPose> {
  const poses: Record<string, ActorPose> = {}
  for (const key in scene.tracks) poses[key] = samplePose(scene.tracks[key], t)
  return poses
}

/** Total running time of the planned scenes (narration can stretch a scene while playing). */
export function totalDuration(scenes: CompiledScene[]): number {
  return scenes.reduce((sum, s) => sum + s.duration, 0)
}

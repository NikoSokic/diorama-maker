import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { characterHeight } from '../characters/height'
import { handheld, shotFor } from '../engine/camera'
import { damp } from '../engine/easing'
import { usePlayer, usePlayerStore } from '../engine/store'

/** Fraction of the screen height the picture is lifted by. */
const LIFT = 0.06

/**
 * Drives the camera from the shot presets while the story plays (damped, with a little hand-held sway)
 * and hands it to the viewer for free orbiting while the story is paused.
 */
export function CameraRig() {
  const store = usePlayerStore()
  const plan = usePlayer((s) => s.plan)
  const controls = useRef<CameraControls>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const position = useRef(new Vector3(0, 7, 18))
  const target = useRef(new Vector3(0, 1.2, 0))
  const fov = useRef(34)
  const lastCut = useRef(-1)
  const wasFree = useRef(false)
  const viewSize = useRef({ w: 0, h: 0 })

  const heights = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of plan.characters) map[c.key] = characterHeight(c.relativeSize)
    return map
  }, [plan])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.minDistance = 4
    c.maxDistance = 60
    c.minPolarAngle = 0.35
    // Never below the ground.
    c.maxPolarAngle = Math.PI / 2 - 0.06
    c.smoothTime = 0.18
    c.draggingSmoothTime = 0.1
  }, [])

  useFrame(({ size }, dt) => {
    const c = controls.current
    if (!c) return
    const state = store.getState()
    const { clock } = state
    // Subtitles and buttons live in the lower part of the screen: render a window of the frustum that
    // sits a little lower, which lifts the stage towards the upper two thirds of the picture.
    if (viewSize.current.w !== size.width || viewSize.current.h !== size.height) {
      viewSize.current = { w: size.width, h: size.height }
      camera.setViewOffset(size.width, size.height, 0, size.height * LIFT, size.width, size.height)
    }

    const snap = lastCut.current !== clock.cut
    lastCut.current = clock.cut
    // A cut always places the camera, even while paused (seeking, opening a story at a given moment).
    const free = state.phase === 'playing' && !state.playing && !state.curtain && !snap
    c.enabled = free

    if (free) {
      wasFree.current = true
      return
    }
    if (wasFree.current) {
      // Coming back from the viewer's own angle: glide from where they left the camera.
      wasFree.current = false
      c.getPosition(position.current)
      c.getTarget(target.current)
    }

    const shot = shotFor({
      scene: state.scenes[state.sceneIndex],
      poses: clock.poses,
      heights,
      sceneTime: clock.sceneTime,
      animTime: clock.animTime,
      aspect: size.width / Math.max(1, size.height),
      phase: state.phase,
    })

    const step = Math.min(dt, 0.1)
    const kp = snap ? 1 : damp(2.4, step)
    const kt = snap ? 1 : damp(3.6, step)
    position.current.x += (shot.position[0] - position.current.x) * kp
    position.current.y += (shot.position[1] - position.current.y) * kp
    position.current.z += (shot.position[2] - position.current.z) * kp
    target.current.x += (shot.target[0] - target.current.x) * kt
    target.current.y += (shot.target[1] - target.current.y) * kt
    target.current.z += (shot.target[2] - target.current.z) * kt
    fov.current += (shot.fov - fov.current) * (snap ? 1 : damp(2.2, step))

    if (Math.abs(camera.fov - fov.current) > 0.01) {
      camera.fov = fov.current
      camera.updateProjectionMatrix()
    }

    const sway = handheld(clock.animTime, 0.05)
    void c.setLookAt(
      position.current.x + sway[0],
      position.current.y + sway[1],
      position.current.z + sway[2],
      target.current.x + sway[0] * 0.3,
      target.current.y + sway[1] * 0.3,
      target.current.z,
      false,
    )
    c.update(0)
  })

  return <CameraControls ref={controls} makeDefault enabled={false} />
}

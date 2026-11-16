import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  Group,
  LoopRepeat,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Mesh,
  type Object3D,
  type Sprite,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Emotion, PlanCharacter, StoryCharacter } from '../../api/types'
import { CanvasErrorBoundary } from '../../components/CanvasErrorBoundary'
import { clamp, damp, easeOutBack, lerpAngle } from '../engine/easing'
import { usePlayerStore } from '../engine/store'
import type { ActorPose, Motion } from '../engine/timeline'
import { ENVIRONMENT_PRESETS } from '../scene/environments'
import { Blob } from './Blob'
import { BASE_HEIGHT, characterHeight } from './height'
import { bodyOffset } from './procedural'


const CLIP_PREFERENCE: Record<Motion, string[]> = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['run', 'walk'],
  jump: ['jump', 'idle'],
  spin: ['idle'],
  wave: ['celebrate', 'idle'],
  dance: ['celebrate', 'idle'],
  celebrate: ['celebrate', 'jump', 'idle'],
}

/** Motions a clip really performs (as opposed to a clip that is only a stand-in pose). */
const CLIP_COVERS: Record<string, Motion[]> = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['run'],
  jump: [],
  celebrate: ['dance', 'celebrate', 'wave'],
}

interface ModelProps {
  url: string
  clips: { name: string; clip: string }[]
  height: number
  pose: RefObject<ActorPose | null>
  covered: RefObject<Set<Motion>>
}

/** Scales the model to `height`, centres it and puts its feet on the ground. */
function normalize(model: Object3D, height: number): Group {
  const wrapper = new Group()
  model.updateMatrixWorld(true)
  const box = new Box3().setFromObject(model, true)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  // Mostly by height, but a long low animal must not become a giant.
  const dimension = Math.max(size.y, Math.max(size.x, size.z) * 0.7, 1e-3)
  const s = height / dimension
  model.scale.multiplyScalar(s)
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s)
  wrapper.add(model)
  return wrapper
}

function GlbModel({ url, clips, height, pose, covered }: ModelProps) {
  const gltf = useGLTF(url)
  const store = usePlayerStore()

  const rig = useMemo(() => {
    const model = cloneSkinned(gltf.scene)
    model.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Skinned meshes are culled by their bind-pose bounds, which animation leaves behind.
      mesh.frustumCulled = false
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) {
          // Toy look: no mirror-like metal, soft highlights.
          material.metalness = Math.min(material.metalness, 0.1)
          material.roughness = Math.max(material.roughness, 0.55)
        }
      }
    })

    const mixer = new AnimationMixer(model)
    const actions = new Map<string, AnimationAction>()
    for (const { name, clip } of clips) {
      const found: AnimationClip | undefined = gltf.animations.find((c) => c.name === clip)
      if (!found || actions.has(name)) continue
      const action = mixer.clipAction(found)
      action.setLoop(LoopRepeat, Infinity)
      actions.set(name, action)
    }

    // Measure in the pose the character will actually stand in.
    const rest = actions.get('idle') ?? actions.get('walk')
    if (rest) {
      rest.play()
      mixer.setTime(0)
    }
    const object = normalize(model, height)
    rest?.stop()

    const covers = new Set<Motion>()
    for (const name of actions.keys()) for (const m of CLIP_COVERS[name] ?? []) covers.add(m)
    return { object, mixer, actions, covers }
  }, [gltf, clips, height])

  const current = useRef<{ action: AnimationAction; name: string } | null>(null)

  useEffect(() => {
    covered.current = rig.covers
    current.current = null
    return () => {
      rig.mixer.stopAllAction()
      covered.current = new Set()
    }
  }, [rig, covered])

  useFrame((_, dt) => {
    const p = pose.current
    if (!p || rig.actions.size === 0) return
    const state = store.getState()
    const running = state.playing || state.phase !== 'playing'

    const wanted = CLIP_PREFERENCE[p.motion].find((n) => rig.actions.has(n))
    // No idle clip (quadrupeds only have "walk"): stand in the first frame of the walk.
    const name = wanted ?? 'walk'
    const action = rig.actions.get(name) ?? rig.actions.values().next().value
    if (!action) return
    const frozen = !wanted

    if (current.current?.action !== action) {
      const previous = current.current?.action
      action.reset().setEffectiveWeight(1).fadeIn(previous ? 0.28 : 0).play()
      previous?.fadeOut(0.28)
      current.current = { action, name }
    }

    let speed = 1
    if (frozen) speed = 0
    else if (p.motion === 'walk' || p.motion === 'run') {
      const natural = (name === 'run' ? 3.2 : 1.5) * (height / BASE_HEIGHT)
      speed = clamp(p.speed / natural, 0.35, 1.9)
    }
    action.timeScale += (speed - action.timeScale) * damp(8, dt)
    if (running) rig.mixer.update(Math.min(dt, 0.1))
  })

  return <primitive object={rig.object} />
}

const BUBBLES: Partial<Record<Emotion, string>> = {
  happy: '💛',
  excited: '✨',
  sad: '💧',
  scared: '💦',
  surprised: '❗',
  angry: '💢',
  sleepy: '💤',
}

const bubbleTextures = new Map<string, CanvasTexture>()

function bubbleTexture(symbol: string): CanvasTexture {
  let texture = bubbleTextures.get(symbol)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(255, 252, 244, 0.96)'
    ctx.beginPath()
    ctx.arc(64, 60, 50, 0, Math.PI * 2)
    ctx.fill()
    // Speech-bubble tail.
    ctx.beginPath()
    ctx.moveTo(48, 102)
    ctx.lineTo(64, 126)
    ctx.lineTo(80, 102)
    ctx.fill()
    ctx.font = '58px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(symbol, 64, 64)
    texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    bubbleTextures.set(symbol, texture)
  }
  return texture
}

let shadowTexture: CanvasTexture | null = null

function contactShadowTexture(): CanvasTexture {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
    shadowTexture = new CanvasTexture(canvas)
  }
  return shadowTexture
}

interface ActorProps {
  plan: PlanCharacter
  character: StoryCharacter | undefined
  color: string
  index: number
}

export function Actor({ plan, character, color, index }: ActorProps) {
  const store = usePlayerStore()
  const outer = useRef<Group>(null)
  const body = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const bubble = useRef<Sprite>(null)
  const pose = useRef<ActorPose | null>(null)
  const covered = useRef<Set<Motion>>(new Set())
  const heading = useRef<number | null>(null)
  const lastCut = useRef(-1)
  const emotion = useRef<{ value: Emotion; since: number }>({ value: 'neutral', since: 0 })

  const height = characterHeight(plan.relativeSize)
  const phase = index * 1.37
  const model = character?.status === 'PLACEHOLDER' ? undefined : character?.model
  const animated = model && model.animations.length > 0
  const url = model ? (animated ? model.animations[0].url : model.glbUrl) : undefined
  const clips = useMemo(
    () => (animated ? model.animations.map((a) => ({ name: a.name, clip: a.clip })) : []),
    [animated, model],
  )

  useFrame((_, dt) => {
    const state = store.getState()
    const { clock } = state
    const p = clock.poses[plan.key]
    pose.current = p ?? null
    if (!outer.current || !body.current || !p) return
    outer.current.visible = p.visible
    if (!p.visible) return

    const env = ENVIRONMENT_PRESETS[state.scenes[state.sceneIndex].scene.environment]
    const snap = lastCut.current !== clock.cut || heading.current === null || p.exactHeading
    lastCut.current = clock.cut
    heading.current = snap ? p.heading : lerpAngle(heading.current!, p.heading, damp(9, dt))

    const o = bodyOffset(p, clock.animTime, {
      skeletal: covered.current.has(p.motion),
      phase,
      bounce: env.bounce,
    })
    // Under water everybody drifts a little above the sand.
    const hover = env.hover > 0 ? env.hover + 0.07 * Math.sin(clock.animTime * 1.3 + phase) : 0

    outer.current.position.set(p.x, 0, p.z)
    outer.current.rotation.y = heading.current
    const size = p.scale * p.pop
    body.current.position.set(o.x * height, (o.y + hover) * height * p.scale, 0)
    body.current.rotation.set(o.pitch, o.yaw, o.roll)
    body.current.scale.set(o.squash * size, o.stretch * size, o.squash * size)

    if (shadow.current) {
      const lift = clamp(1 - (o.y + hover) * 1.2, 0.35, 1)
      const s = height * 0.95 * p.scale * Math.min(1, p.pop) * lift
      shadow.current.scale.set(s, s, s)
    }

    if (bubble.current) {
      if (emotion.current.value !== p.emotion) emotion.current = { value: p.emotion, since: clock.animTime }
      const symbol = BUBBLES[p.emotion]
      bubble.current.visible = !!symbol && p.pop > 0.9
      if (symbol) {
        const texture = bubbleTexture(symbol)
        if (bubble.current.material.map !== texture) {
          bubble.current.material.map = texture
          bubble.current.material.needsUpdate = true
        }
        const age = clock.animTime - emotion.current.since
        const s = 0.62 * easeOutBack(age / 0.45) * clamp(height / BASE_HEIGHT, 0.8, 1.4)
        bubble.current.scale.set(s, s, s)
        bubble.current.position.y = height * p.scale * (1 + o.y) + 0.48 + 0.05 * Math.sin(clock.animTime * 2.4 + phase)
      }
    }
  })

  const placeholder = <Blob color={color} height={height} phase={phase} />

  return (
    <group ref={outer} visible={false}>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#241a3a"
          alphaMap={contactShadowTexture()}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={body}>
        {url ? (
          <CanvasErrorBoundary fallback={placeholder}>
            <Suspense fallback={placeholder}>
              <GlbModel url={url} clips={clips} height={height} pose={pose} covered={covered} />
            </Suspense>
          </CanvasErrorBoundary>
        ) : (
          placeholder
        )}
      </group>
      <sprite ref={bubble} visible={false} renderOrder={5}>
        <spriteMaterial transparent depthWrite={false} toneMapped={false} fog={false} />
      </sprite>
    </group>
  )
}

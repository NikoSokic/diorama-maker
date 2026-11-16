import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import type { Weather } from '../../api/types'
import { seededRandom } from '../engine/easing'
import { usePlayer, usePlayerStore } from '../engine/store'
import type { Atmosphere } from './atmosphere'
import { buildScenery, ENVIRONMENT_PRESETS } from './environments'
import { buildIsland, buildWaterSlab, placeInput } from './island'
import { createSceneryMaterials } from './materials'
import { PartBuilder } from './parts'
import * as P from './props'

const WIND: Record<Weather, number> = { clear: 2.2, rain: 5, snow: 2.6, fog: 1.2, stars: 1.8, fireflies: 1.4 }

/** The island, its water and everything standing on it for the current scene. */
export function Scenery({ atmosphere }: { atmosphere: Atmosphere }) {
  const store = usePlayerStore()
  const plan = usePlayer((s) => s.plan)
  const scenes = usePlayer((s) => s.scenes)
  const slug = usePlayer((s) => s.story.slug)
  const sceneIndex = usePlayer((s) => s.sceneIndex)
  const environment = scenes[sceneIndex].scene.environment
  const weather = scenes[sceneIndex].scene.weather
  const env = ENVIRONMENT_PRESETS[environment]
  const lit = atmosphere.lit
  const foam = useRef<Mesh>(null)

  const materials = useMemo(() => createSceneryMaterials(), [])
  useEffect(() => () => materials.dispose(), [materials])

  // Rebuilt only when the place (or its lamps) changes; scenes in the same place share the geometry.
  const built = useMemo(() => {
    const input = placeInput(plan, scenes, sceneIndex, lit, slug)
    return {
      scenery: buildScenery(input),
      island: buildIsland(ENVIRONMENT_PRESETS[input.environment], input.seed),
      slab: ENVIRONMENT_PRESETS[input.environment].waterRadius > 0 ? buildWaterSlab(ENVIRONMENT_PRESETS[input.environment]) : null,
    }
    // sceneIndex is deliberately left out: `environment` is what decides the layout.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, scenes, slug, environment, lit])
  useEffect(
    () => () => {
      built.scenery.solid?.dispose()
      built.scenery.glow?.dispose()
      built.scenery.water?.dispose()
      built.island.dispose()
      built.slab?.dispose()
    },
    [built],
  )

  useFrame(() => {
    const t = store.getState().clock.animTime
    materials.uniforms.uTime.value = t
    materials.uniforms.uWind.value = WIND[weather]
    if (foam.current) {
      // The shore line breathes in and out.
      const s = 1 + 0.012 * Math.sin(t * 1.3)
      foam.current.scale.set(s, s, 1)
      ;(foam.current.material as MeshBasicMaterial).opacity = 0.42 + 0.14 * Math.sin(t * 1.3 + 1)
    }
  })

  return (
    <group>
      <mesh geometry={built.island} material={materials.solid} receiveShadow />
      {built.scenery.solid && <mesh geometry={built.scenery.solid} material={materials.solid} castShadow receiveShadow />}
      {built.scenery.glow && <mesh geometry={built.scenery.glow} material={materials.glow} />}
      {built.scenery.water && <mesh geometry={built.scenery.water} material={materials.water} receiveShadow />}
      {built.slab && (
        <>
          <mesh geometry={built.slab} material={materials.water} receiveShadow renderOrder={1} />
          <mesh ref={foam} rotation-x={-Math.PI / 2} position-y={-0.185} renderOrder={2}>
            <ringGeometry args={[env.radius - 0.1, env.radius + 0.42, 72]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

interface CloudSpec {
  x: number
  y: number
  z: number
  scale: number
  speed: number
  variant: number
}

const CLOUD_SPAN = 44

/** Puffy toy clouds drifting behind and above the island. */
export function Clouds({ atmosphere }: { atmosphere: Atmosphere }) {
  const store = usePlayerStore()
  const group = useRef<Group>(null)

  const geometries = useMemo(() => {
    const random = seededRandom(23)
    return [0, 1].map(() => {
      const b = new PartBuilder()
      P.cloud(b, random, { leaf: [], trunk: '', rock: '', flower: [], accent: [], snow: false, lit: false })
      return b.build().solid!
    })
  }, [])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])

  const count = Math.round(atmosphere.cloudAmount * 6)
  const clouds = useMemo<CloudSpec[]>(() => {
    const random = seededRandom(5)
    return Array.from({ length: 12 }, (_, i) => ({
      x: random() * CLOUD_SPAN,
      // The first few sit high and far; the overcast extras fill the gaps lower down.
      y: i < 6 ? 7.5 + random() * 4.5 : 6.2 + random() * 5,
      z: -19 + random() * 13,
      scale: 1.1 + random() * 1.3,
      speed: 0.12 + random() * 0.16,
      variant: i % 2,
    }))
  }, [])

  const color = useMemo(() => new Color(atmosphere.cloudColor), [atmosphere.cloudColor])

  useFrame(() => {
    if (!group.current) return
    const t = store.getState().clock.animTime
    group.current.children.forEach((child, i) => {
      const c = clouds[i]
      child.position.x = ((c.x + t * c.speed) % CLOUD_SPAN) - CLOUD_SPAN / 2
    })
  })

  if (count === 0) return null
  return (
    <group ref={group}>
      {clouds.slice(0, count).map((c, i) => (
        <mesh key={i} geometry={geometries[c.variant]} position={[c.x - CLOUD_SPAN / 2, c.y, c.z]} scale={[c.scale, c.scale * 0.9, c.scale]}>
          <meshStandardMaterial vertexColors color={color} roughness={1} emissive={color} emissiveIntensity={0.22} />
        </mesh>
      ))}
    </group>
  )
}

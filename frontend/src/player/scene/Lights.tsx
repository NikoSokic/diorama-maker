import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, FogExp2, Vector3, type DirectionalLight } from 'three'
import type { Quality } from '../engine/store'
import type { Atmosphere } from './atmosphere'

const SHADOW_SIZE: Record<Quality, number> = { low: 512, medium: 1024, high: 2048 }

/** Three-point lighting (key with shadows, sky fill, rim from behind) plus the fog of the scene. */
export function Lights({ atmosphere, quality }: { atmosphere: Atmosphere; quality: Quality }) {
  const scene = useThree((s) => s.scene)
  const key = useRef<DirectionalLight>(null)
  const keyPosition = useMemo(() => new Vector3(...atmosphere.keyPosition).normalize().multiplyScalar(30), [atmosphere.keyPosition])

  useEffect(() => {
    const fog = new FogExp2(new Color(atmosphere.fogColor), atmosphere.fogDensity)
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, atmosphere.fogColor, atmosphere.fogDensity])

  useEffect(() => {
    // The shadow map is reallocated only when its size really changes.
    const light = key.current
    if (!light) return
    const size = SHADOW_SIZE[quality]
    if (light.shadow.mapSize.x !== size) {
      light.shadow.mapSize.set(size, size)
      light.shadow.map?.dispose()
      light.shadow.map = null
    }
  }, [quality])

  return (
    <>
      <hemisphereLight args={[atmosphere.hemiSky, atmosphere.hemiGround, atmosphere.hemiIntensity]} />
      <directionalLight
        ref={key}
        position={keyPosition}
        color={atmosphere.keyColor}
        intensity={atmosphere.keyIntensity}
        castShadow={quality !== 'low'}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={5}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-camera-left={-12.5}
        shadow-camera-right={12.5}
        shadow-camera-top={12.5}
        shadow-camera-bottom={-12.5}
      />
      <directionalLight position={[4, 7, -12]} color={atmosphere.rimColor} intensity={atmosphere.rimIntensity} />
      {atmosphere.fillIntensity > 0 && <directionalLight position={[-2, 5, 12]} color="#ffdcb8" intensity={atmosphere.fillIntensity} />}
    </>
  )
}

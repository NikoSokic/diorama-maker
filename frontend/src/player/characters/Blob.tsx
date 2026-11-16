import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, type Group } from 'three'
import { usePlayerStore } from '../engine/store'

/**
 * The stand-in character: a round toy with eyes, tinted with a palette colour. Used while a model loads,
 * when a model fails to load, and for characters the backend marked PLACEHOLDER.
 */
export function Blob({ color, height, phase = 0 }: { color: string; height: number; phase?: number }) {
  const eyes = useRef<Group>(null)
  const store = usePlayerStore()
  const tones = useMemo(() => {
    const body = new Color(color)
    const hsl = { h: 0, s: 0, l: 0 }
    body.getHSL(hsl)
    // Keep the toy pastel whatever the palette says.
    body.setHSL(hsl.h, Math.min(0.75, Math.max(0.45, hsl.s)), Math.min(0.72, Math.max(0.58, hsl.l)))
    const dark = body.clone().multiplyScalar(0.72)
    const belly = body.clone().lerp(new Color('#ffffff'), 0.55)
    return { body, dark, belly }
  }, [color])

  useFrame(() => {
    if (!eyes.current) return
    // Blink: a quick squeeze every few seconds.
    const t = (store.getState().clock.animTime + phase * 1.7) % 3.6
    eyes.current.scale.y = t < 0.12 ? 0.15 : 1
  })

  const s = height / 1.3
  return (
    <group scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.62, 0]} scale={[1.08, 1.16, 1]}>
        <sphereGeometry args={[0.5, 32, 24]} />
        <meshStandardMaterial color={tones.body} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.5, 0.2]} scale={[0.78, 0.74, 0.7]}>
        <sphereGeometry args={[0.5, 24, 16]} />
        <meshStandardMaterial color={tones.belly} roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh castShadow position={[side * 0.24, 0.07, 0.08]} scale={[0.3, 0.16, 0.38]}>
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshStandardMaterial color={tones.dark} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[side * 0.52, 0.62, 0.05]} scale={[0.2, 0.34, 0.22]} rotation={[0, 0, side * 0.5]}>
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshStandardMaterial color={tones.body} roughness={0.55} />
          </mesh>
          <mesh position={[side * 0.3, 0.66, 0.42]} scale={[0.16, 0.09, 0.05]}>
            <sphereGeometry args={[0.5, 12, 8]} />
            <meshStandardMaterial color="#ff9db0" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <group ref={eyes} position={[0, 0.82, 0]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.17, 0, 0.42]}>
            <mesh scale={[0.2, 0.22, 0.12]}>
              <sphereGeometry args={[0.5, 16, 12]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[side * -0.012, -0.01, 0.045]} scale={[0.11, 0.12, 0.06]}>
              <sphereGeometry args={[0.5, 12, 10]} />
              <meshStandardMaterial color="#2b2233" roughness={0.2} />
            </mesh>
            <mesh position={[side * -0.012 + 0.025, 0.025, 0.075]} scale={0.035}>
              <sphereGeometry args={[0.5, 8, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, 0.66, 0.5]} scale={[0.1, 0.05, 0.04]}>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshStandardMaterial color="#2b2233" roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.28, 0]} scale={[0.05, 0.2, 0.05]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        <meshStandardMaterial color={tones.dark} />
      </mesh>
      <mesh castShadow position={[0, 1.4, 0]} scale={0.14}>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color="#ffd54a" roughness={0.4} emissive="#ffb300" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

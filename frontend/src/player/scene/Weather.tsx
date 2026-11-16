// Weather and ambient particles. Every system is one draw call of GPU points; all motion happens in the vertex
// shader as a function of time, so particles cost nothing on the CPU and can be scrubbed like everything else.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial } from 'three'
import type { Weather } from '../../api/types'
import { seededRandom } from '../engine/easing'
import { usePlayerStore, type Quality } from '../engine/store'
import type { AmbientParticles } from './environments'

type Kind = 'rain' | 'snow' | 'fireflies' | 'mist' | 'pollen' | 'dust' | 'bubbles' | 'leaves'

interface Spec {
  count: number
  /** Point size in pixels at 1 unit distance on a 720 px high view. */
  size: number
  color: string
  opacity: number
  additive: boolean
  /** Integer handed to the shaders to pick motion and sprite shape. */
  mode: number
}

const SPECS: Record<Kind, Spec> = {
  rain: { count: 1100, size: 520, color: '#d9ecff', opacity: 0.5, additive: false, mode: 0 },
  snow: { count: 800, size: 120, color: '#ffffff', opacity: 0.92, additive: false, mode: 1 },
  fireflies: { count: 70, size: 260, color: '#eaff8f', opacity: 1, additive: true, mode: 2 },
  mist: { count: 22, size: 6000, color: '#ffffff', opacity: 0.1, additive: false, mode: 3 },
  pollen: { count: 70, size: 70, color: '#fff7d6', opacity: 0.7, additive: false, mode: 4 },
  dust: { count: 90, size: 60, color: '#ffe9c9', opacity: 0.5, additive: false, mode: 4 },
  bubbles: { count: 130, size: 190, color: '#e6fbff', opacity: 0.8, additive: false, mode: 5 },
  leaves: { count: 36, size: 150, color: '#ffffff', opacity: 0.95, additive: false, mode: 6 },
}

const VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform int uMode;
  varying float vAlpha;
  varying vec4 vSeed;

  void main() {
    vec3 p = position;
    float size = uSize;
    vAlpha = 1.0;
    vSeed = aSeed;

    if (uMode == 0) {
      // Rain: fast, slightly slanted.
      float fall = uTime * (17.0 + aSeed.x * 7.0);
      p.y = mod(p.y - fall, 16.0) - 1.0;
      p.x += (p.y - 8.0) * 0.07;
      size *= 0.7 + aSeed.y * 0.6;
    } else if (uMode == 1) {
      // Snow: slow, swaying.
      float fall = uTime * (0.9 + aSeed.x * 0.9);
      p.y = mod(p.y - fall, 14.0) - 0.5;
      p.x += sin(uTime * (0.5 + aSeed.y) + aSeed.z * 6.28) * 0.6;
      p.z += cos(uTime * (0.4 + aSeed.z) + aSeed.y * 6.28) * 0.4;
      size *= 0.5 + aSeed.w;
    } else if (uMode == 2) {
      // Fireflies: wander near the ground and blink.
      p.y = 0.4 + aSeed.x * 2.6 + sin(uTime * (0.6 + aSeed.y) + aSeed.z * 6.28) * 0.35;
      p.x += sin(uTime * (0.35 + aSeed.z * 0.4) + aSeed.w * 6.28) * 1.1;
      p.z += cos(uTime * (0.3 + aSeed.w * 0.4) + aSeed.x * 6.28) * 1.1;
      float blink = 0.5 + 0.5 * sin(uTime * (1.4 + aSeed.y * 2.0) + aSeed.x * 20.0);
      vAlpha = 0.25 + 0.75 * blink * blink;
      size *= 0.6 + 0.6 * blink;
    } else if (uMode == 3) {
      // Mist: big soft puffs drifting low.
      p.y = 0.3 + aSeed.x * 1.6;
      float drift = uTime * (0.25 + aSeed.y * 0.25);
      p.x = mod(p.x + drift + 14.0, 28.0) - 14.0;
      vAlpha = (0.6 + 0.4 * sin(uTime * 0.3 + aSeed.z * 6.28)) * smoothstep(14.0, 9.0, abs(p.x));
      size *= 0.7 + aSeed.w * 0.6;
    } else if (uMode == 4) {
      // Pollen / dust: float upwards lazily.
      p.y = mod(p.y * 0.4 + uTime * (0.08 + aSeed.x * 0.12), 5.0) + 0.2;
      p.x += sin(uTime * (0.3 + aSeed.y * 0.5) + aSeed.z * 6.28) * 0.7;
      p.z += cos(uTime * (0.25 + aSeed.z * 0.5) + aSeed.w * 6.28) * 0.7;
      vAlpha = 0.4 + 0.6 * sin(uTime * (0.8 + aSeed.w) + aSeed.x * 9.0) * sin(uTime * 0.37 + aSeed.y * 5.0);
      vAlpha = clamp(vAlpha, 0.0, 1.0) * smoothstep(0.2, 1.0, p.y) * smoothstep(5.2, 3.6, p.y);
      size *= 0.6 + aSeed.w * 0.8;
    } else if (uMode == 5) {
      // Bubbles: rise and wobble.
      p.y = mod(p.y + uTime * (0.7 + aSeed.x * 1.1), 13.0) - 0.5;
      p.x += sin(uTime * (1.2 + aSeed.y) + aSeed.z * 6.28) * 0.22;
      p.z += cos(uTime * (1.0 + aSeed.z) + aSeed.w * 6.28) * 0.22;
      vAlpha = smoothstep(-0.5, 1.0, p.y) * smoothstep(12.5, 10.0, p.y);
      size *= 0.35 + aSeed.w * aSeed.w * 1.1;
    } else {
      // Leaves: tumble down slowly.
      float fall = uTime * (0.5 + aSeed.x * 0.5);
      p.y = mod(p.y - fall, 9.0);
      p.x += sin(uTime * (0.7 + aSeed.y) + aSeed.z * 6.28) * 1.0 + uTime * 0.1;
      p.x = mod(p.x + 9.0, 18.0) - 9.0;
      p.z += cos(uTime * (0.6 + aSeed.z) + aSeed.w * 6.28) * 0.6;
      vAlpha = smoothstep(0.0, 0.6, p.y) * smoothstep(9.0, 7.5, p.y);
      size *= 0.6 + aSeed.w * 0.6;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(size * uScale / max(0.5, -mv.z), 1024.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform int uMode;
  varying float vAlpha;
  varying vec4 vSeed;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float alpha = 0.0;
    vec3 color = uColor;

    if (uMode == 0) {
      // A thin streak, brighter at its lower end.
      float line = smoothstep(0.035, 0.0, abs(p.x + p.y * 0.07));
      alpha = line * smoothstep(0.5, 0.2, abs(p.y)) * (0.5 + gl_PointCoord.y * 0.5);
    } else if (uMode == 2) {
      alpha = smoothstep(0.5, 0.0, d);
      alpha = alpha * alpha;
      color *= 2.4;
    } else if (uMode == 3) {
      alpha = smoothstep(0.5, 0.0, d);
      alpha = alpha * alpha * (3.0 - 2.0 * alpha);
    } else if (uMode == 5) {
      // Ring with a highlight: a bubble.
      float ring = smoothstep(0.5, 0.44, d) * smoothstep(0.3, 0.46, d);
      float glint = smoothstep(0.12, 0.0, length(p - vec2(-0.16, -0.18)));
      alpha = ring * 0.9 + glint * 0.9 + smoothstep(0.5, 0.0, d) * 0.12;
    } else if (uMode == 6) {
      // Leaf: a rotating ellipse, green to orange.
      float a = uTime * (1.0 + vSeed.x * 2.0) + vSeed.y * 6.28;
      vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
      alpha = smoothstep(0.25, 0.2, length(q * vec2(1.0, 2.2 + sin(a * 0.7))));
      color = mix(vec3(0.45, 0.78, 0.32), vec3(1.0, 0.62, 0.2), step(0.6, vSeed.z));
    } else {
      alpha = smoothstep(0.5, 0.15, d);
    }

    alpha *= uOpacity * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function ParticleField({ kind, density }: { kind: Kind; density: number }) {
  const store = usePlayerStore()
  const spec = SPECS[kind]
  const material = useRef<ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const random = seededRandom(spec.mode * 97 + 11)
    const count = Math.max(8, Math.round(spec.count * density))
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * (kind === 'mist' ? 13 : 11.5)
      positions.set([Math.cos(a) * radius, random() * 14, Math.sin(a) * radius], i * 3)
      seeds.set([random(), random(), random(), random()], i * 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new BufferAttribute(seeds, 4))
    return g
  }, [kind, spec, density])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScale: { value: 1 },
      uSize: { value: spec.size },
      uMode: { value: spec.mode },
      uColor: { value: new Color(spec.color) },
      uOpacity: { value: spec.opacity },
    }),
    [spec],
  )

  useFrame(({ size, viewport }) => {
    if (!material.current) return
    material.current.uniforms.uTime.value = store.getState().clock.animTime
    material.current.uniforms.uScale.value = (size.height / 720) * viewport.dpr
  })

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial
        ref={material}
        key={kind}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={spec.additive ? AdditiveBlending : NormalBlending}
        fog={false}
      />
    </points>
  )
}

const DENSITY: Record<Quality, number> = { low: 0.45, medium: 0.75, high: 1 }

export function WeatherEffects({ weather, ambient, quality }: { weather: Weather; ambient: AmbientParticles; quality: Quality }) {
  const density = DENSITY[quality]
  return (
    <>
      {weather === 'rain' && <ParticleField kind="rain" density={density} />}
      {weather === 'snow' && <ParticleField kind="snow" density={density} />}
      {weather === 'fog' && <ParticleField kind="mist" density={1} />}
      {weather === 'fireflies' && <ParticleField kind="fireflies" density={1} />}
      {ambient !== 'none' && weather !== 'rain' && weather !== 'snow' && <ParticleField kind={ambient} density={density} />}
    </>
  )
}

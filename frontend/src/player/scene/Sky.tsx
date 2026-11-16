import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from 'three'
import { seededRandom } from '../engine/easing'
import { usePlayerStore } from '../engine/store'
import type { Atmosphere } from './atmosphere'

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uDiscDirection;
  uniform vec3 uDiscColor;
  uniform float uDiscSize;
  uniform float uDiscGlow;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    vec3 color = h > 0.0
      ? mix(uHorizon, uTop, pow(h, 0.6))
      : mix(uHorizon, uBottom, pow(-h, 0.55));

    float d = max(dot(dir, uDiscDirection), 0.0);
    float disc = smoothstep(cos(uDiscSize) - 0.0016, cos(uDiscSize), d) * step(0.0001, uDiscSize);
    // Wide soft halo plus a tight bright one.
    float halo = pow(d, 6.0) * 0.22 + pow(d, 48.0) * 0.5;
    color += uDiscColor * halo * uDiscGlow;
    color = mix(color, uDiscColor * 1.6, disc);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function SkyDome({ atmosphere }: { atmosphere: Atmosphere }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uBottom: { value: new Color() },
          uDiscDirection: { value: new Vector3(0, 1, 0) },
          uDiscColor: { value: new Color() },
          uDiscSize: { value: 0 },
          uDiscGlow: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uTop.value.set(atmosphere.skyTop)
    u.uHorizon.value.set(atmosphere.skyHorizon)
    u.uBottom.value.set(atmosphere.skyBottom)
    u.uDiscDirection.value.set(...atmosphere.discDirection).normalize()
    u.uDiscColor.value.set(atmosphere.discColor)
    u.uDiscSize.value = atmosphere.discSize
    u.uDiscGlow.value = atmosphere.discGlow
  }, [atmosphere, material])

  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[150, 32, 20]} />
    </mesh>
  )
}

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aPhase * 1.7) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale * (0.7 + 0.3 * vTwinkle);
  }
`

const STAR_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    // Soft dot with a faint four-point sparkle.
    float core = smoothstep(0.5, 0.0, d);
    float rays = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.2)
               + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.2);
    float alpha = (core * core + rays * 0.35) * uOpacity * vTwinkle;
    gl_FragColor = vec4(uColor * 1.8, alpha);
  }
`

/** Twinkling stars on the sky dome. `opacity` 0 hides them completely. */
export function Stars({ opacity }: { opacity: number }) {
  const store = usePlayerStore()
  const material = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const random = seededRandom(7)
    const count = 420
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Mostly above the horizon, a few below so the island seems to float among them.
      const y = random() * 1.25 - 0.25
      const a = random() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      positions.set([Math.cos(a) * r * 140, y * 140, Math.sin(a) * r * 140], i * 3)
      sizes[i] = random() < 0.08 ? 3.4 + random() * 2 : 1 + random() * 1.6
      phases[i] = random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(positions, 3))
    g.setAttribute('aSize', new BufferAttribute(sizes, 1))
    g.setAttribute('aPhase', new BufferAttribute(phases, 1))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 0 }, uColor: { value: new Color('#fff6d8') } }),
    [],
  )

  useFrame(({ size, viewport }) => {
    if (!material.current) return
    material.current.uniforms.uTime.value = store.getState().clock.animTime
    material.current.uniforms.uScale.value = (size.height / 720) * viewport.dpr * 2.2
    material.current.uniforms.uOpacity.value = opacity
  })

  if (opacity <= 0.01) return null
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={-9}>
      <shaderMaterial
        ref={material}
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        fog={false}
      />
    </points>
  )
}

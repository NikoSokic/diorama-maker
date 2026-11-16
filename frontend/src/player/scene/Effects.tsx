import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { usePlayerStore, type Quality } from '../engine/store'

/**
 * ACES tone mapping, a little bloom on the bright bits and a soft vignette. On low quality only the tone
 * mapping stays, so the picture keeps its colours on slow phones.
 */
export function Effects({ quality, bloom }: { quality: Quality; bloom: number }) {
  if (quality === 'low') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={bloom} luminanceThreshold={1.05} luminanceSmoothing={0.3} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* ACES mutes colours a little; give the toys their candy colours back. */}
      <HueSaturation saturation={0.16} />
      <BrightnessContrast contrast={0.06} />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  )
}

/** Advances the story clock once per frame, before anything reads it. */
export function Ticker() {
  const store = usePlayerStore()
  useFrame((_, dt) => store.getState().tick(dt), -2)
  return null
}

/** Hands a PNG of the frame to whoever asked for one; runs right after the composer has drawn. */
export function Capture() {
  const store = usePlayerStore()
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    const { clock } = store.getState()
    const request = clock.captureRequest
    if (!request) return
    clock.captureRequest = null
    try {
      request(gl.domElement.toDataURL('image/png'))
    } catch {
      request('')
    }
  }, 2)
  return null
}

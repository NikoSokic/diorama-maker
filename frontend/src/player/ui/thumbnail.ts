// The gallery picture: one frame of the story, taken once the stage is really showing something.

import { useProgress } from '@react-three/drei'
import { useEffect } from 'react'
import type { PlayerStore } from '../engine/store'
import { captureFrame } from './share'

export const THUMB_WIDTH = 480
export const THUMB_HEIGHT = 270
/** Seconds into a scene: the curtain is open and the characters have entered. */
export const SETTLE_SECONDS = 2.2

/** True when a frame taken now would show the story: playing, curtain open, models loaded, scene settled. */
export function readyForThumbnail(store: PlayerStore, loading: boolean): boolean {
  const s = store.getState()
  return s.phase === 'playing' && s.playing && !s.curtain && !loading && s.clock.sceneTime >= SETTLE_SECONDS
}

/** Scales a PNG data URL to a 480x270 JPEG (centre-cropped), the size the backend stores. */
export async function toThumbnailJpeg(dataUrl: string): Promise<Blob | null> {
  if (!dataUrl) return null
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const scale = Math.max(THUMB_WIDTH / image.width, THUMB_HEIGHT / image.height)
  const w = image.width * scale
  const h = image.height * scale
  ctx.drawImage(image, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85))
}

/** Calls `onThumbnail` once with a JPEG of the first settled frame (the HUD is HTML, so it is never in it). */
export function useThumbnailCapture(store: PlayerStore, onThumbnail?: (jpeg: Blob) => void) {
  useEffect(() => {
    if (!onThumbnail) return
    let done = false
    const timer = setInterval(() => {
      if (done || !readyForThumbnail(store, useProgress.getState().active)) return
      done = true
      clearInterval(timer)
      void captureFrame(store)
        .then(toThumbnailJpeg)
        .then((jpeg) => jpeg && onThumbnail(jpeg))
        .catch(() => {})
    }, 400)
    return () => clearInterval(timer)
  }, [store, onThumbnail])
}

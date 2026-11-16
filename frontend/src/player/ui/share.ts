// Share helpers: copy link, Web Share API, save the current frame as a PNG.

import type { PlayerStore } from '../engine/store'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers and non-secure origins: the hidden-textarea way.
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function webShare(data: { title: string; text: string; url: string }): Promise<boolean> {
  if (!canWebShare()) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    // The viewer closed the share sheet.
    return false
  }
}

/** Asks the render loop for the next frame as a PNG data URL ('' when the canvas cannot be read). */
export function captureFrame(store: PlayerStore): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), 1500)
    store.getState().clock.captureRequest = (dataUrl) => {
      clearTimeout(timer)
      resolve(dataUrl)
    }
  })
}

/** A story title as a safe file name (letters and digits joined by dashes). */
export function fileName(title: string): string {
  return title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'diorama'
}

export async function saveScreenshot(store: PlayerStore, name: string): Promise<boolean> {
  const dataUrl = await captureFrame(store)
  if (!dataUrl) return false
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${fileName(name)}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}

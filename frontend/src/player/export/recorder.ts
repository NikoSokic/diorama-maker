// "Download video": the story is played once more from the start while a 2D canvas copies every rendered frame,
// draws the subtitle and the curtain fade on top (both are HTML in the player, so a plain canvas capture would
// lose them) and MediaRecorder records that canvas together with the sound engine's output.

/** Containers in order of preference; mp4 plays everywhere, webm is the fallback most browsers can write. */
export const MIME_CANDIDATES = [
  // avc1.42E01F: H.264 baseline level 3.1, enough for 720p at 30 fps (3.0 is not)
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export const MAX_WIDTH = 1280
/** The player's subtitle face (self-hosted through @fontsource-variable). */
export const SUBTITLE_FONT = "'Fredoka Variable', 'Fredoka', 'Nunito Variable', system-ui, sans-serif"
export const FPS = 30

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const type of MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      // some browsers throw for unknown codec strings
    }
  }
  return null
}

/** The recording format this browser can produce, or null when it cannot record a canvas at all. */
export function recordingSupport(): { mimeType: string; extension: 'mp4' | 'webm' } | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null
  if (typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null
  const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) return null
  return { mimeType, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' }
}

/** The video size for a canvas: its own aspect, at most 1280 wide, even numbers (encoders need them). */
export function videoSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / Math.max(1, width))
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/** Splits a subtitle into lines that fit `maxWidth` (measured by `measure`). */
export function wrap(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export interface Overlay {
  subtitle: string
  /** 0 = scene fully visible, 1 = covered by the curtain colour. */
  curtain: number
}

export class StoryRecorder {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly recorder: MediaRecorder
  private readonly chunks: Blob[] = []
  private readonly done: Promise<Blob>
  private cancelled = false

  constructor(source: HTMLCanvasElement, audio: MediaStream | null, mimeType: string) {
    const size = videoSize(source.width, source.height)
    this.canvas = document.createElement('canvas')
    this.canvas.width = size.width
    this.canvas.height = size.height
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('no 2D canvas')
    this.ctx = ctx
    const stream = this.canvas.captureStream(FPS)
    for (const track of audio?.getAudioTracks() ?? []) stream.addTrack(track)
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 })
    this.done = new Promise((resolve, reject) => {
      this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data)
      this.recorder.onstop = () => {
        for (const track of stream.getVideoTracks()) track.stop()
        if (this.cancelled) reject(new Error('cancelled'))
        // the type the recorder really wrote, which may differ from the one asked for
        else resolve(new Blob(this.chunks, { type: (this.recorder.mimeType || mimeType).split(';')[0] }))
      }
      this.recorder.onerror = () => reject(new Error('recorder error'))
    })
    // Draw one frame before starting so the first video frame is never empty.
    this.ctx.fillStyle = '#1d1533'
    this.ctx.fillRect(0, 0, size.width, size.height)
    this.recorder.start(1000)
  }

  /** File extension for what was actually recorded. */
  get extension(): 'mp4' | 'webm' {
    return (this.recorder.mimeType || '').startsWith('video/mp4') ? 'mp4' : 'webm'
  }

  get active(): boolean {
    return this.recorder.state === 'recording'
  }

  /** Copies the frame that was just rendered and paints the subtitle and curtain over it. */
  draw(source: HTMLCanvasElement, overlay: Overlay) {
    if (!this.active) return
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height
    ctx.fillStyle = '#1d1533' // opaque under the frame, in case the GL canvas has alpha
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(source, 0, 0, w, h)
    if (overlay.subtitle && overlay.curtain < 0.5) this.subtitle(overlay.subtitle, w, h)
    if (overlay.curtain > 0) {
      ctx.fillStyle = `rgb(29 21 51 / ${Math.min(1, overlay.curtain)})`
      ctx.fillRect(0, 0, w, h)
    }
  }

  /** Same look as the player's subtitle card: cream box, plum rounded text, bottom centre. */
  private subtitle(text: string, w: number, h: number) {
    const { ctx } = this
    const size = Math.round(h * 0.042)
    ctx.font = `500 ${size}px ${SUBTITLE_FONT}`
    const lines = wrap(text, w * 0.62, (s) => ctx.measureText(s).width).slice(0, 3)
    const lineHeight = size * 1.3
    const boxW = Math.min(w * 0.7, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 2)
    const boxH = lines.length * lineHeight + size * 1.1
    const x = (w - boxW) / 2
    const y = h - boxH - h * 0.04
    ctx.fillStyle = 'rgb(255 247 232 / 0.93)'
    ctx.beginPath()
    ctx.roundRect(x, y, boxW, boxH, size * 0.9)
    ctx.fill()
    ctx.fillStyle = '#3a2a4d'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + size * 0.55 + lineHeight * (i + 0.5)))
  }

  /** Finishes the file. */
  stop(): Promise<Blob> {
    if (this.recorder.state !== 'inactive') this.recorder.stop()
    return this.done
  }

  cancel() {
    this.cancelled = true
    if (this.recorder.state !== 'inactive') this.recorder.stop()
    this.done.catch(() => {})
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

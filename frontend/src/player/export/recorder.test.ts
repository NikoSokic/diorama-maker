import { describe, expect, it } from 'vitest'
import { COVER_MS, REVEAL_MS } from '../engine/store'
import { MAX_WIDTH, pickMimeType, recordingSupport, videoSize, wrap } from './recorder'
import { curtainAt, subtitleAt } from './videoExport'

describe('video recording', () => {
  it('prefers mp4, falls back to webm, and reports when nothing works', () => {
    expect(pickMimeType(() => true)).toMatch(/^video\/mp4;codecs=avc1\.42E01F/)
    expect(pickMimeType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus')
    expect(pickMimeType((t) => t === 'video/webm')).toBe('video/webm')
    expect(
      pickMimeType(() => {
        throw new Error('unknown codec')
      }),
    ).toBeNull()
    expect(pickMimeType(() => false)).toBeNull()
  })

  it('says "unsupported" where there is no MediaRecorder (here: Node)', () => {
    expect(recordingSupport()).toBeNull()
  })

  it('keeps the aspect, at most 1280 wide, in even pixels', () => {
    expect(videoSize(2560, 1440)).toEqual({ width: MAX_WIDTH, height: 720 })
    expect(videoSize(1001, 563)).toEqual({ width: 1002, height: 564 })
    expect(videoSize(800, 451).height % 2).toBe(0)
  })

  it('wraps subtitles by measured width', () => {
    const measure = (s: string) => s.length * 10
    expect(wrap('the fox flies a red kite', 100, measure)).toEqual(['the fox', 'flies a', 'red kite'])
    expect(wrap('', 100, measure)).toEqual([])
    expect(wrap('supercalifragilistic', 50, measure)).toEqual(['supercalifragilistic'])
  })

  it('reveals subtitle words at the player pace and fades the curtain in and out', () => {
    const text = 'A little fox flies a red kite over the meadow.'
    expect(subtitleAt(text, 0)).toBe('')
    expect(subtitleAt(text, 0.4)).toBe('A')
    expect(subtitleAt(text, 30)).toBe(text)
    expect(subtitleAt('', 3)).toBe('')

    expect(curtainAt(null, 100)).toBe(0)
    expect(curtainAt({ kind: 'fade', stage: 'cover' }, COVER_MS / 2)).toBeCloseTo(0.5)
    expect(curtainAt({ kind: 'iris', stage: 'cover' }, COVER_MS * 2)).toBe(1)
    expect(curtainAt({ kind: 'fade', stage: 'reveal' }, 0)).toBe(1)
    expect(curtainAt({ kind: 'fade', stage: 'reveal' }, REVEAL_MS)).toBe(0)
  })
})

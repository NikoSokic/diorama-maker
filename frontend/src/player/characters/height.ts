import { clamp } from '../engine/easing'

/** Height in world units of a character with relativeSize 1. */
export const BASE_HEIGHT = 1.7

export function characterHeight(relativeSize: number) {
  // Compress the range: a mouse next to an elephant must still be visible, and the elephant must fit the frame.
  return clamp(BASE_HEIGHT * Math.pow(clamp(relativeSize, 0.3, 3), 0.7), 0.75, 3.4)
}

import { describe, expect, it } from 'vitest'
import { weathersFor } from './TweakPanel'

describe('tweak panel', () => {
  it('offers stars and fireflies only for the evening (or when the time is kept)', () => {
    expect(weathersFor('day')).not.toContain('stars')
    expect(weathersFor('morning')).not.toContain('fireflies')
    expect(weathersFor('night')).toEqual(expect.arrayContaining(['stars', 'fireflies', 'rain']))
    expect(weathersFor('sunset')).toContain('fireflies')
    expect(weathersFor('')).toContain('stars')
  })
})

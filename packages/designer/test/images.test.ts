import { describe, expect, it } from 'vitest'
import { dataUrlKb, fitWithin } from '../src/images'

describe('image helpers', () => {
  it('fits within the maximum edge and never upscales', () => {
    expect(fitWithin(4960, 3508, 2480)).toEqual({ w: 2480, h: 1754 })
    expect(fitWithin(3000, 6000, 2480)).toEqual({ w: 1240, h: 2480 })
    expect(fitWithin(800, 600, 2480)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(10000, 1, 2480)).toEqual({ w: 2480, h: 1 })
  })

  it('computes the decoded size of a data URL', () => {
    const bytes = 3000
    const b64 = Buffer.alloc(bytes).toString('base64')
    expect(dataUrlKb(`data:image/png;base64,${b64}`)).toBeCloseTo(bytes / 1024, 5)
    expect(dataUrlKb(`data:image/png;base64,${Buffer.alloc(2).toString('base64')}`)).toBeCloseTo(2 / 1024, 5)
  })
})

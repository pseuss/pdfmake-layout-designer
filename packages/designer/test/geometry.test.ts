import { describe, expect, it } from 'vitest'
import { boxToRect, moveRect, rectToBox, resizeRect, snapValue } from '../src/geometry'

const o = { grid: 5, snap: true, minSize: 2 }

describe('geometry', () => {
  it('snaps values to the grid only when enabled', () => {
    expect(snapValue(12.4, 5, true)).toBe(10)
    expect(snapValue(12.6, 5, true)).toBe(15)
    expect(snapValue(12.4, 5, false)).toBe(12.4)
    expect(snapValue(12.4, 0, true)).toBe(12.4)
  })

  it('moves a rect and snaps its origin', () => {
    expect(moveRect({ x: 10, y: 10, w: 20, h: 20 }, 7, 3, 5, true)).toEqual({ x: 15, y: 15, w: 20, h: 20 })
    expect(moveRect({ x: 10, y: 10, w: 20, h: 20 }, 7.123, 3, 5, false)).toEqual({ x: 17.12, y: 13, w: 20, h: 20 })
  })

  it('resizes by edge and corner handles', () => {
    const r = { x: 10, y: 10, w: 30, h: 20 }
    expect(resizeRect(r, 'e', 10, 99, o)).toEqual({ x: 10, y: 10, w: 40, h: 20 })
    expect(resizeRect(r, 's', 99, 10, o)).toEqual({ x: 10, y: 10, w: 30, h: 30 })
    expect(resizeRect(r, 'nw', -5, -5, o)).toEqual({ x: 5, y: 5, w: 35, h: 25 })
    expect(resizeRect(r, 'se', 5, 5, o)).toEqual({ x: 10, y: 10, w: 35, h: 25 })
  })

  it('never goes below the minimum size or flips', () => {
    const r = { x: 10, y: 10, w: 30, h: 20 }
    const small = resizeRect(r, 'e', -100, 0, o)
    expect(small.w).toBe(2)
    expect(small.x).toBe(10)
    expect(resizeRect(r, 'nw', 100, 100, o)).toMatchObject({ w: 2, h: 2, x: 38, y: 28 })
  })

  it('keeps the aspect ratio on corner handles', () => {
    const r = { x: 0, y: 0, w: 40, h: 20 }
    const a = resizeRect(r, 'se', 20, 0, { ...o, aspect: 2 })
    expect(a.w / a.h).toBeCloseTo(2, 5)
    expect(a).toMatchObject({ x: 0, y: 0, w: 60, h: 30 })
    const b = resizeRect(r, 'nw', -10, 0, { ...o, aspect: 2, snap: false })
    expect(b.w / b.h).toBeCloseTo(2, 5)
    expect(b.x + b.w).toBe(40) // opposite corner stays
    expect(b.y + b.h).toBe(20)
  })

  it('converts between margins and rectangles', () => {
    const page = { w: 210, h: 297 }
    const box = { top: 95, bottom: 30, left: 25, right: 20 }
    const rect = boxToRect(box, page)
    expect(rect).toEqual({ x: 25, y: 95, w: 165, h: 172 })
    expect(rectToBox(rect, page)).toEqual(box)
  })
})

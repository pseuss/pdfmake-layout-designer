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

import { alignDeltas, guideTargets, snapMoveToGuides, snapResizeToGuides } from '../src/geometry'

describe('snapping guides', () => {
  const page = { w: 210, h: 297 }
  const targets = guideTargets([{ x: 50, y: 40, w: 30, h: 20 }], page, { x: 25, y: 95, w: 165, h: 172 })

  it('collects edges and centres of elements, page and content box', () => {
    expect(targets.xs).toEqual(expect.arrayContaining([0, 105, 210, 25, 190, 50, 65, 80]))
    expect(targets.ys).toEqual(expect.arrayContaining([0, 148.5, 297, 95, 267, 40, 50, 60]))
  })

  it('snaps a moved rect to an edge, centre or page centre within the threshold and reports the guide', () => {
    const s = snapMoveToGuides({ x: 80.9, y: 100, w: 30, h: 10 }, targets, 1.5)
    expect(s.rect.x).toBe(80) // left edge meets the right edge of the other element
    expect(s.x).toContain(80)
    const c = snapMoveToGuides({ x: 91, y: 10, w: 30, h: 10 }, targets, 1.5)
    expect(c.rect.x + 15).toBe(105) // centre meets the page centre
    expect(snapMoveToGuides({ x: 120, y: 200, w: 10, h: 10 }, targets, 1.5)).toMatchObject({ x: [], y: [] })
  })

  it('snaps only the dragged edges when resizing', () => {
    const s = snapResizeToGuides({ x: 100, y: 100, w: 90.8, h: 20 }, 'e', targets, 1.5, 2)
    expect(s.rect).toEqual({ x: 100, y: 100, w: 90, h: 20 })
    expect(s.rect.y).toBe(100)
    const keep = snapResizeToGuides({ x: 100, y: 99.5, w: 40, h: 20 }, 'e', targets, 1.5, 2)
    expect(keep.rect.y).toBe(99.5)
  })

  it('aligns rects to their common bounds', () => {
    const rects = [{ x: 10, y: 10, w: 20, h: 10 }, { x: 40, y: 30, w: 10, h: 30 }]
    expect(alignDeltas(rects, 'left')).toEqual([{ dx: 0, dy: 0 }, { dx: -30, dy: 0 }])
    expect(alignDeltas(rects, 'right')).toEqual([{ dx: 20, dy: 0 }, { dx: 0, dy: 0 }])
    expect(alignDeltas(rects, 'center')).toEqual([{ dx: 10, dy: 0 }, { dx: -15, dy: 0 }])
    expect(alignDeltas(rects, 'top')).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: -20 }])
    expect(alignDeltas(rects, 'bottom')).toEqual([{ dx: 0, dy: 40 }, { dx: 0, dy: 0 }])
    expect(alignDeltas(rects, 'middle')).toEqual([{ dx: 0, dy: 20 }, { dx: 0, dy: -10 }])
  })
})

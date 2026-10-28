import type { Box } from '@pdf-layouter/core'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Rounds to 0.01 mm so layouts do not fill up with floating point noise. */
export const round = (n: number): number => Math.round(n * 100) / 100

export function snapValue(value: number, grid: number, enabled: boolean): number {
  return enabled && grid > 0 ? Math.round(value / grid) * grid : value
}

export function moveRect(rect: Rect, dx: number, dy: number, grid: number, snap: boolean): Rect {
  return { ...rect, x: round(snapValue(rect.x + dx, grid, snap)), y: round(snapValue(rect.y + dy, grid, snap)) }
}

export interface ResizeOptions {
  grid: number
  snap: boolean
  minSize: number
  /** Width / height to keep when set (corner handles only). */
  aspect?: number
}

/** Resizes by dragging a handle by (dx, dy) mm; edges snap to the grid and the rect never gets smaller than `minSize`. */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, o: ResizeOptions): Rect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  const s = (v: number) => snapValue(v, o.grid, o.snap)

  if (handle.includes('w')) left = Math.min(s(left + dx), right - o.minSize)
  if (handle.includes('e')) right = Math.max(s(right + dx), left + o.minSize)
  if (handle.includes('n')) top = Math.min(s(top + dy), bottom - o.minSize)
  if (handle.includes('s')) bottom = Math.max(s(bottom + dy), top + o.minSize)

  if (o.aspect && handle.length === 2) {
    // keep the proportions: the dominant change wins, the opposite corner stays fixed
    const width = right - left
    const height = bottom - top
    const byWidth = Math.abs(width - rect.w) / rect.w >= Math.abs(height - rect.h) / rect.h
    const w = byWidth ? width : height * o.aspect
    const h = byWidth ? width / o.aspect : height
    if (handle.includes('w')) left = right - w
    else right = left + w
    if (handle.includes('n')) top = bottom - h
    else bottom = top + h
  }
  return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) }
}

export function boxToRect(box: Box, page: { w: number; h: number }): Rect {
  return { x: box.left, y: box.top, w: page.w - box.left - box.right, h: page.h - box.top - box.bottom }
}

export function rectToBox(rect: Rect, page: { w: number; h: number }): Box {
  return { left: round(rect.x), top: round(rect.y), right: round(page.w - rect.x - rect.w), bottom: round(page.h - rect.y - rect.h) }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ---- snapping guides ----------------------------------------------------------------------

export interface GuideTargets {
  xs: number[]
  ys: number[]
}

/** Edges and centres other elements, the page and the content box offer for alignment (mm). */
export function guideTargets(rects: Rect[], page: { w: number; h: number }, box: Rect, userGuides: { x?: number[]; y?: number[] } = {}): GuideTargets {
  const xs = new Set<number>([0, page.w / 2, page.w, box.x, box.x + box.w, ...(userGuides.x ?? [])])
  const ys = new Set<number>([0, page.h / 2, page.h, box.y, box.y + box.h, ...(userGuides.y ?? [])])
  for (const r of rects) {
    ;[r.x, r.x + r.w / 2, r.x + r.w].forEach((v) => xs.add(round(v)))
    ;[r.y, r.y + r.h / 2, r.y + r.h].forEach((v) => ys.add(round(v)))
  }
  return { xs: [...xs], ys: [...ys] }
}

function nearest(value: number, targets: number[], threshold: number): number | undefined {
  let best: number | undefined
  for (const t of targets) if (Math.abs(t - value) <= threshold && (best === undefined || Math.abs(t - value) < Math.abs(best - value))) best = t
  return best
}

export interface GuideSnap {
  rect: Rect
  /** Guide lines that were hit, in mm. */
  x: number[]
  y: number[]
}

/** Moves a rect so that its left/centre/right and top/middle/bottom align with a target within `threshold`. */
export function snapMoveToGuides(rect: Rect, t: GuideTargets, threshold: number): GuideSnap {
  let dx = 0
  let dy = 0
  const hitX: number[] = []
  const hitY: number[] = []
  let bestX = Infinity
  let bestY = Infinity
  for (const a of [rect.x, rect.x + rect.w / 2, rect.x + rect.w]) {
    const hit = nearest(a, t.xs, threshold)
    if (hit !== undefined && Math.abs(hit - a) < bestX) {
      bestX = Math.abs(hit - a)
      dx = hit - a
    }
  }
  for (const a of [rect.y, rect.y + rect.h / 2, rect.y + rect.h]) {
    const hit = nearest(a, t.ys, threshold)
    if (hit !== undefined && Math.abs(hit - a) < bestY) {
      bestY = Math.abs(hit - a)
      dy = hit - a
    }
  }
  const moved = { ...rect, x: round(rect.x + dx), y: round(rect.y + dy) }
  for (const a of [moved.x, moved.x + moved.w / 2, moved.x + moved.w]) if (t.xs.some((v) => Math.abs(v - a) < 0.01)) hitX.push(round(a))
  for (const a of [moved.y, moved.y + moved.h / 2, moved.y + moved.h]) if (t.ys.some((v) => Math.abs(v - a) < 0.01)) hitY.push(round(a))
  return { rect: moved, x: [...new Set(hitX)], y: [...new Set(hitY)] }
}

/** Snaps only the edges a resize handle is dragging. */
export function snapResizeToGuides(rect: Rect, handle: Handle, t: GuideTargets, threshold: number, minSize: number): GuideSnap {
  let left = rect.x
  let right = rect.x + rect.w
  let top = rect.y
  let bottom = rect.y + rect.h
  const hitX: number[] = []
  const hitY: number[] = []
  const pick = (v: number, targets: number[], hits: number[]) => {
    const hit = nearest(v, targets, threshold)
    if (hit === undefined) return v
    hits.push(hit)
    return hit
  }
  if (handle.includes('w')) left = Math.min(pick(left, t.xs, hitX), right - minSize)
  if (handle.includes('e')) right = Math.max(pick(right, t.xs, hitX), left + minSize)
  if (handle.includes('n')) top = Math.min(pick(top, t.ys, hitY), bottom - minSize)
  if (handle.includes('s')) bottom = Math.max(pick(bottom, t.ys, hitY), top + minSize)
  return { rect: { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) }, x: hitX, y: hitY }
}

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Aligns rects to the bounding box of all of them; returns the (dx, dy) each one has to move. */
export function alignDeltas(rects: Rect[], align: Align): { dx: number; dy: number }[] {
  const left = Math.min(...rects.map((r) => r.x))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return rects.map((r) => {
    switch (align) {
      case 'left':
        return { dx: round(left - r.x), dy: 0 }
      case 'right':
        return { dx: round(right - (r.x + r.w)), dy: 0 }
      case 'center':
        return { dx: round((left + right) / 2 - (r.x + r.w / 2)), dy: 0 }
      case 'top':
        return { dx: 0, dy: round(top - r.y) }
      case 'bottom':
        return { dx: 0, dy: round(bottom - (r.y + r.h)) }
      case 'middle':
        return { dx: 0, dy: round((top + bottom) / 2 - (r.y + r.h / 2)) }
    }
  })
}

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

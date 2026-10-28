import type { FlowBlock, StaticElement } from '@pdf-layouter/core'
import { alignDeltas, round, type Align, type Rect } from './geometry'
import { ADDRESS_PRESETS } from '@pdf-layouter/core'
import type { Store } from './store'


/** Bounding box in mm; text boxes have no stored height, so a nominal one is used. */
export function staticRect(el: StaticElement): Rect {
  switch (el.type) {
    case 'line':
      return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) }
    case 'text':
      return { x: el.x, y: el.y, w: el.w, h: 5 }
    case 'address':
      return { ...ADDRESS_PRESETS[el.preset] }
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h }
  }
}

/** Address fields are fixed by their DIN preset and never move. */
const movable = (el: StaticElement) => el.type !== 'address'

function translate(el: StaticElement, dx: number, dy: number): void {
  if (el.type === 'line') {
    el.x1 = round(el.x1 + dx)
    el.x2 = round(el.x2 + dx)
    el.y1 = round(el.y1 + dy)
    el.y2 = round(el.y2 + dy)
  } else if (el.type !== 'address') {
    el.x = round(el.x + dx)
    el.y = round(el.y + dy)
  }
}

/** Moves the given static elements by (dx, dy) mm in one undo step. */
export function moveStatic(store: Store, ids: string[], dx: number, dy: number, source = 'canvas'): void {
  store.update((d) => {
    for (const el of d.static) if (ids.includes(el.id)) translate(el, dx, dy)
  }, source)
}

export function alignSelection(store: Store, align: Align): void {
  const ids = store.selectedStaticIds()
  const els = store.layout.static.filter((e) => ids.includes(e.id) && movable(e))
  if (els.length < 2) return
  const deltas = alignDeltas(els.map(staticRect), align)
  store.update((d) => {
    els.forEach((el, i) => {
      const target = d.static.find((e) => e.id === el.id)
      if (target) translate(target, deltas[i]!.dx, deltas[i]!.dy)
    })
  })
}

export function moveLayer(store: Store, id: string, direction: -1 | 1): void {
  const index = store.layout.static.findIndex((e) => e.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= store.layout.static.length) return
  store.update((d) => {
    const [el] = d.static.splice(index, 1)
    d.static.splice(target, 0, el!)
  })
}

export function moveFlow(store: Store, from: number, to: number): void {
  const n = store.layout.flow.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return
  store.update((d) => {
    const [block] = d.flow.splice(from, 1)
    d.flow.splice(to, 0, block!)
  })
  store.select({ kind: 'flow', index: to })
}

export function duplicateSelection(store: Store): void {
  const sel = store.selection
  if (sel.kind === 'static' || sel.kind === 'multi') {
    const sources = store.layout.static.filter((e) => store.selectedStaticIds().includes(e.id))
    if (!sources.length) return
    const copies = sources.map((source) => {
      const copy = structuredClone(source) as StaticElement
      copy.id = ''
      return copy
    })
    const used = new Set(store.layout.static.map((e) => e.id))
    const ids: string[] = []
    for (const copy of copies) {
      let n = used.size + 1
      while (used.has(`${copy.type}_${n}`)) n++
      copy.id = `${copy.type}_${n}`
      used.add(copy.id)
      ids.push(copy.id)
      translate(copy, 5, 5)
    }
    store.update((d) => void d.static.push(...copies))
    store.select(ids.length === 1 ? { kind: 'static', id: ids[0]! } : { kind: 'multi', ids })
  } else if (sel.kind === 'flow') {
    const source = store.layout.flow[sel.index]
    if (!source) return
    store.update((d) => {
      d.flow.splice(sel.index + 1, 0, structuredClone(source) as FlowBlock)
    })
    store.select({ kind: 'flow', index: sel.index + 1 })
  }
}

export function deleteSelection(store: Store): void {
  const sel = store.selection
  if (sel.kind === 'static' || sel.kind === 'multi') {
    const ids = store.selectedStaticIds()
    store.update((d) => void (d.static = d.static.filter((e) => !ids.includes(e.id))))
  } else if (sel.kind === 'flow') store.update((d) => void d.flow.splice(sel.index, 1))
  else return
  store.select({ kind: 'none' })
}

/** Moves the selected static elements by (dx, dy) mm. */
export function nudgeSelection(store: Store, dx: number, dy: number): void {
  const ids = store.selectedStaticIds()
  if (ids.length) moveStatic(store, ids, dx, dy)
}

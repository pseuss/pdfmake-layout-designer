import type { FlowBlock, StaticElement } from '@pdf-layouter/core'
import { round } from './geometry'
import type { Store } from './store'

const prefixFor = (el: StaticElement) => el.type

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
  if (sel.kind === 'static') {
    const source = store.layout.static.find((e) => e.id === sel.id)
    if (!source) return
    const id = store.uniqueId(prefixFor(source))
    store.update((d) => {
      const copy = structuredClone(source) as StaticElement
      copy.id = id
      if (copy.type === 'line') {
        copy.x1 = round(copy.x1 + 5)
        copy.y1 = round(copy.y1 + 5)
        copy.x2 = round(copy.x2 + 5)
        copy.y2 = round(copy.y2 + 5)
      } else if (copy.type !== 'address') {
        copy.x = round(copy.x + 5)
        copy.y = round(copy.y + 5)
      }
      d.static.push(copy)
    })
    store.select({ kind: 'static', id })
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
  if (sel.kind === 'static') store.update((d) => void (d.static = d.static.filter((e) => e.id !== sel.id)))
  else if (sel.kind === 'flow') store.update((d) => void d.flow.splice(sel.index, 1))
  else return
  store.select({ kind: 'none' })
}

/** Moves the selected static element by (dx, dy) mm. */
export function nudgeSelection(store: Store, dx: number, dy: number): void {
  const sel = store.selection
  if (sel.kind !== 'static') return
  store.update((d) => {
    const el = d.static.find((e) => e.id === sel.id)
    if (!el) return
    if (el.type === 'line') {
      el.x1 = round(el.x1 + dx)
      el.x2 = round(el.x2 + dx)
      el.y1 = round(el.y1 + dy)
      el.y2 = round(el.y2 + dy)
    } else if (el.type !== 'address') {
      el.x = round(el.x + dx)
      el.y = round(el.y + dy)
    }
  }, 'canvas')
}

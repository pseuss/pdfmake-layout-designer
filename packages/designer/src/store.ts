import { parseLayout, pruneAssets, type Data, type Layout } from '@pdf-layouter/core'
import type { PlaceholderCatalog } from './warnings'

export type Selection = { kind: 'none' } | { kind: 'static'; id: string } | { kind: 'flow'; index: number } | { kind: 'contentBox' }
export type View = 'first' | 'follow'
export type StoreEvent = 'layout' | 'selection' | 'view' | 'data'

export interface LayoutChange {
  /** Who caused the change; panels ignore their own edits so inputs keep focus. */
  source: string
}

type Listener = (change: LayoutChange) => void

export class Store {
  layout: Layout
  sampleData: Data = {}
  catalog: PlaceholderCatalog | undefined
  selection: Selection = { kind: 'none' }
  view: View = 'first'
  zoom = 1
  grid = 5
  snap = true
  showGrid = true
  private listeners: Record<StoreEvent, Set<Listener>> = { layout: new Set(), selection: new Set(), view: new Set(), data: new Set() }

  constructor(layout: Layout) {
    this.layout = layout
  }

  on(event: StoreEvent, fn: Listener): () => void {
    this.listeners[event].add(fn)
    return () => this.listeners[event].delete(fn)
  }

  private emit(event: StoreEvent, change: LayoutChange = { source: 'api' }): void {
    for (const fn of [...this.listeners[event]]) fn(change)
  }

  /** The current Layout without unused assets; always a copy. */
  getLayout(): Layout {
    return structuredClone(pruneAssets(this.layout))
  }

  setLayout(input: unknown, source = 'api'): void {
    this.layout = parseLayout(input)
    this.selection = { kind: 'none' }
    this.emit('layout', { source })
    this.emit('selection')
  }

  update(mutate: (draft: Layout) => void, source = 'ui'): void {
    const draft = structuredClone(this.layout)
    mutate(draft)
    this.layout = draft
    this.emit('layout', { source })
  }

  setSampleData(data: Data): void {
    this.sampleData = data
    this.emit('data')
  }

  select(selection: Selection): void {
    this.selection = selection
    this.emit('selection')
  }

  setView(view: View): void {
    this.view = view
    this.emit('view')
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(4, Math.max(0.25, Math.round(zoom * 100) / 100))
    this.emit('view')
  }

  setGrid(options: Partial<Pick<Store, 'grid' | 'snap' | 'showGrid'>>): void {
    Object.assign(this, options)
    this.emit('view')
  }

  uniqueId(prefix: string): string {
    const used = new Set(this.layout.static.map((e) => e.id))
    let n = used.size + 1
    while (used.has(`${prefix}_${n}`)) n++
    return `${prefix}_${n}`
  }

  uniqueAssetId(): string {
    let n = Object.keys(this.layout.assets).length + 1
    while (this.layout.assets[`img_${n}`]) n++
    return `img_${n}`
  }
}

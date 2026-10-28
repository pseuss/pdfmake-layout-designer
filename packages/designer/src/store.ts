import { parseLayout, pruneAssets, type Data, type Layout } from '@pdf-layouter/core'
import type { PlaceholderCatalog } from './warnings'

export type Selection = { kind: 'none' } | { kind: 'static'; id: string } | { kind: 'multi'; ids: string[] } | { kind: 'flow'; index: number } | { kind: 'contentBox' }
export type View = 'first' | 'follow'
const MAX_HISTORY = 100

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
  showGuideLines = true
  private past: Layout[] = []
  private future: Layout[] = []
  private lastEdit = { source: '', key: '', at: 0 }
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
    this.past = []
    this.future = []
    this.selection = { kind: 'none' }
    this.emit('layout', { source })
    this.emit('selection')
  }

  update(mutate: (draft: Layout) => void, source = 'ui'): void {
    // Assets are never modified in place, so snapshots share them instead of copying megabytes of Base64.
    const { assets, ...rest } = this.layout
    const draft: Layout = { ...structuredClone(rest), assets: { ...assets } }
    mutate(draft)
    this.remember(source)
    this.layout = draft
    this.future = []
    this.emit('layout', { source })
  }

  /** Pushes the current layout to the undo stack; consecutive edits of one field in a panel count as one step. */
  private remember(source: string): void {
    const key = JSON.stringify(this.selection)
    const now = Date.now()
    const coalesce = source.startsWith('panel') && this.lastEdit.source === source && this.lastEdit.key === key && now - this.lastEdit.at < 1500
    this.lastEdit = { source, key, at: now }
    if (coalesce) return
    this.past.push(this.layout)
    if (this.past.length > MAX_HISTORY) this.past.shift()
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(this.layout)
    this.restore(previous)
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.layout)
    this.restore(next)
  }

  private restore(layout: Layout): void {
    this.layout = layout
    this.lastEdit = { source: '', key: '', at: 0 }
    const sel = this.selection
    const exists = (id: string) => layout.static.some((e) => e.id === id)
    let gone = (sel.kind === 'static' && !exists(sel.id)) || (sel.kind === 'flow' && sel.index >= layout.flow.length)
    if (sel.kind === 'multi') {
      const ids = sel.ids.filter(exists)
      gone = ids.length !== sel.ids.length
      this.selection = ids.length === 0 ? { kind: 'none' } : ids.length === 1 ? { kind: 'static', id: ids[0]! } : { kind: 'multi', ids }
    } else if (gone) this.selection = { kind: 'none' }
    this.emit('layout', { source: 'history' })
    if (gone) this.emit('selection')
  }

  setSampleData(data: Data): void {
    this.sampleData = data
    this.emit('data')
  }

  select(selection: Selection): void {
    this.selection = selection
    this.emit('selection')
  }

  /** Ids of all selected static elements (one or several). */
  selectedStaticIds(): string[] {
    const s = this.selection
    return s.kind === 'static' ? [s.id] : s.kind === 'multi' ? s.ids : []
  }

  /** Adds the element to the selection or removes it (shift/ctrl click). */
  toggleStatic(id: string): void {
    const ids = this.selectedStaticIds()
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    this.select(next.length === 0 ? { kind: 'none' } : next.length === 1 ? { kind: 'static', id: next[0]! } : { kind: 'multi', ids: next })
  }

  setView(view: View): void {
    this.view = view
    this.emit('view')
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(4, Math.max(0.25, Math.round(zoom * 100) / 100))
    this.emit('view')
  }

  setGrid(options: Partial<Pick<Store, 'grid' | 'snap' | 'showGrid' | 'showGuideLines'>>): void {
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

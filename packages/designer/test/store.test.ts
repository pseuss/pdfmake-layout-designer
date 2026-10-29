import { describe, expect, it, vi } from 'vitest'
import { createEmptyLayout } from 'pdfmake-layout-designer-core'
import { Store } from '../src/store'
import { createTranslator, MESSAGES } from '../src/i18n'

describe('Store', () => {
  it('updates immutably, emits with the source and returns pruned copies', () => {
    const store = new Store(createEmptyLayout())
    const spy = vi.fn()
    store.on('layout', spy)
    const before = store.layout
    store.update((d) => void (d.assets.unused = { data: 'data:image/png;base64,AAAA' }), 'panel')
    expect(store.layout).not.toBe(before)
    expect(before.assets).toEqual({})
    expect(spy).toHaveBeenCalledWith({ source: 'panel' })
    expect(store.layout.assets.unused).toBeDefined()
    expect(store.getLayout().assets).toEqual({})
    expect(store.getLayout()).not.toBe(store.getLayout())
  })

  it('generates unique ids and asset keys', () => {
    const store = new Store(createEmptyLayout())
    store.update((d) => void d.static.push({ id: 'rect_1', type: 'rect', pages: 'all', x: 0, y: 0, w: 1, h: 1, radius: 0 }))
    expect(store.uniqueId('rect')).toBe('rect_2')
    expect(store.uniqueId('text')).toBe('text_2')
    store.update((d) => void (d.assets.img_1 = { data: 'x' }))
    expect(store.uniqueAssetId()).toBe('img_2')
  })

  it('clamps the zoom and resets the selection on setLayout', () => {
    const store = new Store(createEmptyLayout())
    store.setZoom(10)
    expect(store.zoom).toBe(4)
    store.setZoom(0.01)
    expect(store.zoom).toBe(0.25)
    store.select({ kind: 'flow', index: 3 })
    store.setLayout({ schemaVersion: 1 })
    expect(store.selection).toEqual({ kind: 'none' })
  })

  it('rejects invalid layouts without changing state', () => {
    const store = new Store(createEmptyLayout())
    expect(() => store.setLayout({ schemaVersion: 1, page: { size: 'B9' } })).toThrow(/Invalid layout/)
    expect(store.layout.page.size).toBe('A4')
  })
})

describe('Store history', () => {
  const rect = (id: string) => ({ id, type: 'rect' as const, pages: 'all' as const, x: 0, y: 0, w: 1, h: 1, radius: 0 })

  it('undoes and redoes edits and clears the redo stack on a new edit', () => {
    const store = new Store(createEmptyLayout())
    const changes: string[] = []
    store.on('layout', (c) => changes.push(c.source))
    store.update((d) => void d.static.push(rect('a')))
    store.update((d) => void d.static.push(rect('b')))
    expect([store.canUndo, store.canRedo]).toEqual([true, false])
    store.undo()
    expect(store.layout.static.map((e) => e.id)).toEqual(['a'])
    store.undo()
    expect(store.layout.static).toEqual([])
    expect(store.canUndo).toBe(false)
    store.redo()
    expect(store.layout.static.map((e) => e.id)).toEqual(['a'])
    store.update((d) => void d.static.push(rect('c')))
    expect(store.canRedo).toBe(false)
    expect(changes.filter((c) => c === 'history')).toHaveLength(3)
  })

  it('merges quick consecutive edits of one panel into one step but not other sources', () => {
    const store = new Store(createEmptyLayout())
    store.update((d) => void d.static.push(rect('a')))
    for (let i = 1; i <= 5; i++) store.update((d) => void (d.static[0]!.pages = i % 2 ? 'first' : 'all'), 'panel')
    store.update((d) => void d.static.push(rect('b')), 'canvas')
    store.undo() // removes b
    expect(store.layout.static).toHaveLength(1)
    store.undo() // all five panel edits at once
    expect(store.layout.static[0]!.pages).toBe('all')
    store.undo() // the add
    expect(store.layout.static).toEqual([])
  })

  it('drops the selection when its element disappears and resets history on setLayout', () => {
    const store = new Store(createEmptyLayout())
    store.update((d) => void d.static.push(rect('a')))
    store.select({ kind: 'static', id: 'a' })
    store.undo()
    expect(store.selection).toEqual({ kind: 'none' })
    store.update((d) => void d.static.push(rect('x')))
    store.setLayout({ schemaVersion: 1 })
    expect([store.canUndo, store.canRedo]).toEqual([false, false])
  })

  it('keeps at most 100 steps and shares assets between snapshots', () => {
    const store = new Store(createEmptyLayout())
    store.update((d) => void (d.assets.big = { data: 'x'.repeat(1000) }))
    for (let i = 0; i < 120; i++) store.update((d) => void d.static.push(rect(`r${i}`)))
    let steps = 0
    while (store.canUndo) {
      store.undo()
      steps++
    }
    expect(steps).toBe(100)
    expect(store.layout.assets.big).toBeDefined()
  })
})

describe('i18n', () => {
  it('has the same keys in German and English and interpolates variables', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.de).sort())
    expect(createTranslator('en')('image.tooLarge', { kb: 1500 })).toContain('1500 KB')
    expect(createTranslator('de')('add.rect')).toBe('Rechteck')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createEmptyLayout } from '@pdf-layouter/core'
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

describe('i18n', () => {
  it('has the same keys in German and English and interpolates variables', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.de).sort())
    expect(createTranslator('en')('image.tooLarge', { kb: 1500 })).toContain('1500 KB')
    expect(createTranslator('de')('add.rect')).toBe('Rechteck')
  })
})

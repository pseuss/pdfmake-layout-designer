import { describe, expect, it } from 'vitest'
import { parseLayout } from 'pdfmake-layout-designer-core'
import { collectWarnings, previewText, type PlaceholderCatalog } from '../src/warnings'

const catalog: PlaceholderCatalog = {
  groups: [{ key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }] }],
  lists: [{ key: 'positionen', label: 'Positionen', fields: [{ key: 'menge', label: 'Menge' }] }],
}

const layout = parseLayout({
  schemaVersion: 1,
  static: [{ id: 't', type: 'text', x: 0, y: 0, w: 50, content: '{{kunde.name}} {{kunde.fehlt}}' }],
  flow: [
    { type: 'text', content: [{ text: 'Seite {{page}} {{x.y}}' }] },
    { type: 'table', source: 'positionen', columns: [{ field: 'menge' }, { field: 'preis' }] },
    { type: 'table', source: 'unbekannt', columns: [{ field: 'a' }] },
    { type: 'totals', rows: [{ label: 'Netto', value: '{{summen.netto | currency}}' }] },
  ],
  page: { footer: { content: 'Seite {{page}} von {{pages}}' } },
})

describe('collectWarnings', () => {
  it('reports placeholders outside the catalog, unknown lists and columns', () => {
    const w = collectWarnings(layout, { kunde: { name: 'A' } }, catalog)
    expect(w.map((x) => `${x.code}:${x.where}`).sort()).toEqual(
      ['unknown-column:flow:1', 'unknown-list:flow:2', 'unknown-placeholder:flow:0', 'unknown-placeholder:flow:3', 'unknown-placeholder:t'].sort(),
    )
  })

  it('reports placeholders without sample value when no catalog is given, and ignores page/pages', () => {
    const w = collectWarnings(layout, { kunde: { name: 'A' } })
    expect(w.every((x) => x.code === 'no-sample-value')).toBe(true)
    expect(w.map((x) => x.message).join(' ')).not.toMatch(/\{\{pages?\}\}/)
    expect(w).toHaveLength(3)
  })

  it('is silent when everything is covered', () => {
    const l = parseLayout({ schemaVersion: 1, static: [{ id: 't', type: 'text', x: 0, y: 0, w: 5, content: '{{kunde.name}}' }] })
    expect(collectWarnings(l, { kunde: { name: 'A' } }, catalog)).toEqual([])
  })
})

describe('content box warnings', () => {
  it('explains the limits of different first/follow boxes', () => {
    const l = parseLayout({ schemaVersion: 1, page: { contentBox: { first: { top: 20, bottom: 10, left: 30, right: 10 }, follow: { top: 40, bottom: 20, left: 20, right: 10 } } } })
    expect(collectWarnings(l, {}).map((w) => w.code)).toEqual(['content-box', 'content-box', 'content-box'])
    expect(collectWarnings(parseLayout({ schemaVersion: 1 }), {})).toEqual([])
  })
})

describe('previewText', () => {
  it('substitutes known values and keeps unknown placeholders visible', () => {
    const format = (v: unknown, f: string | undefined) => (f ? `${f}(${v})` : String(v))
    expect(previewText('{{a}} / {{b | date}} / {{c}}', { a: 1, b: '2026-01-01' }, format)).toBe('1 / date(2026-01-01) / {{c}}')
  })
})

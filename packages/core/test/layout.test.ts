import { describe, expect, it } from 'vitest'
import { createEmptyLayout, LayoutError, migrateLayout, parseLayout, pruneAssets, toBlocks } from '@pdf-layouter/core'

describe('parseLayout', () => {
  it('fills defaults for a minimal layout', () => {
    const layout = parseLayout({ schemaVersion: 1 })
    expect(layout.page.size).toBe('A4')
    expect(layout.page.contentBox.first.top).toBe(95)
    expect(layout.page.defaults.font).toBe('Roboto')
    expect(layout.locale).toBe('de-DE')
    expect(layout.static).toEqual([])
    expect(layout.flow).toEqual([])
  })

  it('treats a missing schemaVersion as version 1 and rejects newer versions', () => {
    expect(parseLayout({}).schemaVersion).toBe(1)
    expect(() => parseLayout({ schemaVersion: 2 })).toThrow(/newer than supported/)
    expect(() => parseLayout({ schemaVersion: 0 })).toThrow(LayoutError)
    expect(() => migrateLayout([])).toThrow(/JSON object/)
    expect(() => migrateLayout(null)).toThrow(LayoutError)
  })

  it('reports readable validation issues', () => {
    try {
      parseLayout({ schemaVersion: 1, static: [{ id: 'a', type: 'rect', x: 0, y: 0, w: -5, h: 5, fill: 'red' }] })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutError)
      expect((e as LayoutError).issues.join('\n')).toMatch(/static\.0\.w/)
      expect((e as LayoutError).issues.join('\n')).toMatch(/static\.0\.fill/)
    }
  })

  it('rejects duplicate element ids and unknown assets', () => {
    const rect = { type: 'rect', x: 0, y: 0, w: 1, h: 1 }
    expect(() => parseLayout({ schemaVersion: 1, static: [{ id: 'a', ...rect }, { id: 'a', ...rect }] })).toThrow(/duplicate element id/)
    expect(() => parseLayout({ schemaVersion: 1, static: [{ id: 'i', type: 'image', asset: 'nope', x: 0, y: 0, w: 1, h: 1 }] })).toThrow(/unknown asset/)
  })

  it('is idempotent on its own output', () => {
    const once = parseLayout({ schemaVersion: 1, flow: [{ type: 'text', content: 'Hallo\n\nWelt' }] })
    expect(parseLayout(once)).toEqual(once)
  })

  it('defaults the address field to the first page and the other elements to all pages', () => {
    const layout = parseLayout({
      schemaVersion: 1,
      static: [
        { id: 'a', type: 'address', content: 'x' },
        { id: 'b', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      ],
    })
    expect(layout.static.map((e) => e.pages)).toEqual(['first', 'all'])
  })

  it('does not share default objects between parses', () => {
    const a = parseLayout({})
    a.page.contentBox.first.top = 1
    expect(parseLayout({}).page.contentBox.first.top).toBe(95)
  })
})

describe('visibleWhen schema', () => {
  const rect = { id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 1 }
  it('accepts leaves, nested groups and not, and keeps them intact', () => {
    const visibleWhen = { all: [{ path: 'a', op: 'gt', value: 1 }, { any: [{ path: 'b' }, { not: { path: 'c', op: 'equals', value: 'x' } }] }] }
    const layout = parseLayout({ schemaVersion: 1, static: [{ ...rect, visibleWhen }], flow: [{ type: 'pageBreak', visibleWhen: { path: 'p' } }] })
    expect((layout.static[0] as { visibleWhen: unknown }).visibleWhen).toEqual({ all: [{ path: 'a', op: 'gt', value: 1 }, { any: [{ path: 'b', op: 'exists' }, { not: { path: 'c', op: 'equals', value: 'x' } }] }] })
    expect(parseLayout(layout)).toEqual(layout)
  })
  it('rejects empty groups, missing paths and unknown operators', () => {
    for (const visibleWhen of [{ all: [] }, { path: '' }, { path: 'a', op: 'matches' }, { any: [{ nope: 1 }] }]) {
      expect(() => parseLayout({ schemaVersion: 1, static: [{ ...rect, visibleWhen }] })).toThrow(/Invalid layout/)
    }
  })
})

describe('rich text normalisation', () => {
  it('accepts a string, a run array or blocks', () => {
    expect(toBlocks('a\n\nb')).toEqual([
      { type: 'paragraph', runs: [{ text: 'a' }] },
      { type: 'paragraph', runs: [{ text: 'b' }] },
    ])
    expect(toBlocks([{ text: 'x', bold: true }])).toEqual([{ type: 'paragraph', runs: [{ text: 'x', bold: true }] }])
    const blocks = [{ type: 'list' as const, ordered: true, items: [[{ text: 'one' }]] }]
    expect(toBlocks(blocks)).toBe(blocks)
  })

  it('normalises text blocks while parsing', () => {
    const layout = parseLayout({ schemaVersion: 1, flow: [{ type: 'text', content: [{ text: '{{baustein.einleitung}}' }] }] })
    expect(layout.flow[0]).toMatchObject({ type: 'text', content: [{ type: 'paragraph', runs: [{ text: '{{baustein.einleitung}}' }] }] })
  })
})

describe('layout helpers', () => {
  it('creates an empty layout', () => {
    expect(createEmptyLayout().page.size).toBe('A4')
    expect(createEmptyLayout({ locale: 'en-US' }).locale).toBe('en-US')
  })

  it('prunes assets that no element references', () => {
    const layout = parseLayout({
      schemaVersion: 1,
      assets: { keep: { data: 'data:image/png;base64,AAAA' }, drop: { data: 'data:image/png;base64,BBBB' } },
      static: [{ id: 'i', type: 'image', asset: 'keep', x: 0, y: 0, w: 10, h: 10 }],
    })
    expect(Object.keys(pruneAssets(layout).assets)).toEqual(['keep'])
  })
})

describe('guides', () => {
  it('are optional, kept in the layout and ignored by the PDF output', async () => {
    expect(parseLayout({ schemaVersion: 1 }).guides).toBeUndefined()
    const layout = parseLayout({ schemaVersion: 1, guides: { x: [30, 63.5], y: [100] } })
    expect(layout.guides).toEqual({ x: [30, 63.5], y: [100] })
    expect(parseLayout({ schemaVersion: 1, guides: { x: [] } }).guides).toEqual({ x: [], y: [] })
    expect(() => parseLayout({ schemaVersion: 1, guides: { x: ['a'] } })).toThrow(/Invalid layout/)
    const { generate } = await import('@pdf-layouter/core')
    expect((await generate(layout, {})).length).toBe((await generate({ schemaVersion: 1 }, {})).length)
  })
})

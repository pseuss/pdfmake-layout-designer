import { describe, expect, it } from 'vitest'
import { compile, mmToPt, toDocDefinition, type Warning } from '@pdf-layouter/core'
import { invoiceData, invoiceLayout, serialRecords, serialLayout } from '../../../fixtures/data'
import { loadAssets } from '../../../fixtures/node'

const assets = loadAssets()
const bg = (doc: ReturnType<typeof toDocDefinition>, page: number) => doc.background(page) as { stack: Record<string, unknown>[] } | null

describe('compile', () => {
  it('maps the content box to pdfmake page margins and a first-page spacer (mm to pt)', () => {
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(3)])
    expect(docDefinition.pageSize.width).toBeCloseTo(595.28, 1)
    expect(docDefinition.pageSize.height).toBeCloseTo(841.89, 1)
    expect(docDefinition.pageMargins).toEqual([mmToPt(25), mmToPt(30), mmToPt(20), mmToPt(30)])
    expect(docDefinition.content[0].stack[0].margin[1]).toBeCloseTo(mmToPt(65), 5)
  })

  it('swaps the page size for landscape and supports other formats', () => {
    const { docDefinition } = compile({ schemaVersion: 1, page: { size: 'A5', orientation: 'landscape' } }, [{}])
    expect(docDefinition.pageSize.width).toBeCloseTo(mmToPt(210), 3)
    expect(docDefinition.pageSize.height).toBeCloseTo(mmToPt(148), 3)
  })

  it('warns when first and follow content boxes cannot be represented exactly', () => {
    const warnings: Warning[] = []
    compile({ schemaVersion: 1, page: { contentBox: { first: { top: 20, bottom: 10, left: 30, right: 10 }, follow: { top: 40, bottom: 10, left: 20, right: 10 } } } }, [{}], { onWarning: (w) => warnings.push(w) })
    expect(warnings.filter((w) => w.code === 'layout')).toHaveLength(2)
  })

  it('applies page rules to the static layer', () => {
    const pageMap = { records: [{ start: 1, end: 3 }] }
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(3)], { pageMap })
    const types = (page: number) => bg(docDefinition, page)!.stack.map((n) => ('image' in n ? 'image' : 'canvas' in n ? 'canvas' : 'columns' in n ? 'text' : '?'))
    // bg(first) logo(all) bar(notFirst) sep(first) addr(first) meta(first) end(last)
    expect(types(1)).toEqual(['image', 'image', 'canvas', 'text', 'text'])
    expect(types(2)).toEqual(['image', 'canvas'])
    expect(types(3)).toEqual(['image', 'canvas', 'text'])
  })

  it('treats a one-page record as both first and last page', () => {
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(3)], { pageMap: { records: [{ start: 1, end: 1 }] } })
    expect(bg(docDefinition, 1)!.stack).toHaveLength(6) // all but the notFirst bar
  })

  it('draws static elements per record using that record’s data', () => {
    const records = serialRecords(3)
    const { docDefinition } = compile(serialLayout(assets), records, { pageMap: { records: [{ start: 1, end: 1 }, { start: 2, end: 3 }, { start: 4, end: 4 }] } })
    const addressOf = (page: number) => JSON.stringify(bg(docDefinition, page))
    expect(addressOf(1)).toContain('Nummer 01 Müller')
    expect(addressOf(2)).toContain('Nummer 02 Müller')
    expect(bg(docDefinition, 3)).toBeNull() // follow page of record 2: everything is first-page only
    expect(addressOf(4)).toContain('Nummer 03 Müller')
  })

  it('creates shapes with correct geometry', () => {
    const doc = toDocDefinition({
      schemaVersion: 1,
      static: [
        { id: 'r', type: 'rect', x: 10, y: 20, w: 30, h: 40, fill: '#FF0000', stroke: { color: '#000000', width: 2 }, radius: 3 },
        { id: 'l', type: 'line', x1: 10, y1: 100, x2: 110, y2: 100, width: 2, color: '#00FF00', dash: 'dashed' },
      ],
    }, {}) as { background: (p: number) => { stack: Record<string, any>[] } }
    const [rect, line] = doc.background(1).stack
    expect(rect!.absolutePosition).toEqual({ x: mmToPt(10), y: mmToPt(20) })
    expect(rect!.canvas[0]).toMatchObject({ type: 'rect', w: mmToPt(30), h: mmToPt(40), r: mmToPt(3), color: '#FF0000', lineColor: '#000000', lineWidth: 2 })
    expect(line!.canvas[0]).toMatchObject({ type: 'line', x2: mmToPt(100), y2: 0, lineWidth: 2, lineColor: '#00FF00', dash: { length: 4, space: 3 } })
  })

  it('uses the SVG node for svg assets and shared image keys for bitmaps', () => {
    const { docDefinition } = compile(serialLayout(assets), [serialRecords(1)[0]!], { pageMap: { records: [{ start: 1, end: 1 }] } })
    expect(JSON.stringify(docDefinition.background(1))).toContain('"svg"')
    const inv = compile(invoiceLayout(assets), [invoiceData(2)], { pageMap: { records: [{ start: 1, end: 1 }] } }).docDefinition
    expect(Object.keys(inv.images)).toEqual(['asset:img_bg', 'asset:img_logo'])
  })

  it('builds tables from lists with widths, alignment, formats and a repeating header', () => {
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(5)])
    const table = docDefinition.content[0].stack.find((n: any) => n.table?.body.length === 6)
    expect(table.table.headerRows).toBe(1)
    expect(table.table.widths).toEqual([mmToPt(12), '*', mmToPt(18), mmToPt(24), mmToPt(28)])
    expect(table.table.body[0].map((c: any) => c.text)).toEqual(['Pos', 'Leistung', 'Menge', 'Einzel', 'Gesamt'])
    expect(table.table.body[1][4]).toMatchObject({ alignment: 'right', text: expect.stringContaining('€') })
  })

  it('warns and skips tables whose list is missing', () => {
    const warnings: Warning[] = []
    const data = { ...invoiceData(2) }
    delete (data as Record<string, unknown>).reisekosten
    const { docDefinition } = compile(invoiceLayout(assets), [data], { onWarning: (w) => warnings.push(w) })
    expect(warnings.some((w) => w.code === 'missing-list' && w.message.includes('reisekosten'))).toBe(true)
    expect(JSON.stringify(docDefinition.content)).not.toContain('Bahnfahrt')
  })

  it('renders dynamic sections in the given order and skips invalid ones', () => {
    const warnings: Warning[] = []
    const data = { ...invoiceData(1), abschnitte: [{ type: 'text', content: 'EINS' }, { type: 'bogus' }, { type: 'table', columns: [{ field: 'a', title: 'A' }], rows: [{ a: 'ZWEI' }] }, { type: 'text', content: 'DREI' }] }
    const { docDefinition } = compile(invoiceLayout(assets), [data], { onWarning: (w) => warnings.push(w) })
    const json = JSON.stringify(docDefinition.content)
    expect(json.indexOf('EINS')).toBeLessThan(json.indexOf('ZWEI'))
    expect(json.indexOf('ZWEI')).toBeLessThan(json.indexOf('DREI'))
    expect(warnings.some((w) => w.code === 'invalid-value')).toBe(true)
  })

  it('builds a totals block with the last row emphasised', () => {
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(2)])
    const totals = docDefinition.content[0].stack.find((n: any) => n.columns?.[1]?.table?.body.length === 3)
    const rows = totals.columns[1].table.body
    expect(rows[2][0]).toMatchObject({ text: 'Gesamt', bold: true })
    expect(rows[2][1].text).toMatch(/€/)
    expect(totals.columns[1].layout.hLineWidth(2)).toBeGreaterThan(0)
    expect(totals.columns[1].layout.hLineWidth(1)).toBe(0)
  })

  it('creates one record block per data record, separated by page breaks', () => {
    const { docDefinition } = compile(serialLayout(assets), serialRecords(3), { pageMap: { records: [{ start: 1, end: 1 }, { start: 2, end: 2 }, { start: 3, end: 3 }] } })
    expect(docDefinition.content.map((c: any) => c.pageBreak)).toEqual([undefined, 'before', 'before'])
  })

  it('reports that a page map is needed for last-page rules and batches', () => {
    expect(compile(invoiceLayout(assets), [invoiceData(1)]).needsPageMap).toBe(true)
    expect(compile({ schemaVersion: 1 }, [{}]).needsPageMap).toBe(false)
    expect(compile({ schemaVersion: 1 }, [{}, {}]).needsPageMap).toBe(true)
  })

  it('numbers footer pages per record when a page map is known', () => {
    const { docDefinition } = compile(invoiceLayout(assets), [invoiceData(1), invoiceData(1)], { pageMap: { records: [{ start: 1, end: 2 }, { start: 3, end: 5 }] } })
    expect(docDefinition.footer(1, 5).text).toBe('Seite 1 von 2')
    expect(docDefinition.footer(4, 5).text).toBe('Seite 2 von 3')
    expect(docDefinition.footer(5, 5).text).toBe('Seite 3 von 3')
  })

  it('deduplicates warnings and does not mutate its inputs', () => {
    const layout = invoiceLayout(assets)
    const before = JSON.stringify(layout)
    const data = invoiceData(2)
    const dataBefore = JSON.stringify(data)
    const { warnings } = compile(layout, [data])
    expect(JSON.stringify(layout)).toBe(before)
    expect(JSON.stringify(data)).toBe(dataBefore)
    expect(new Set(warnings.map((w) => w.message)).size).toBe(warnings.length)
  })

  it('places the DIN 5008 address windows per preset', () => {
    const doc = (preset: string) => toDocDefinition({ schemaVersion: 1, static: [{ id: 'a', type: 'address', preset, content: 'X' }] }, {}) as { background: (p: number) => { stack: Record<string, any>[] } }
    const a = doc('DIN5008-A').background(1).stack[0]!
    const b = doc('DIN5008-B').background(1).stack[0]!
    expect(a.absolutePosition).toEqual({ x: mmToPt(20), y: mmToPt(27) })
    expect(b.absolutePosition).toEqual({ x: mmToPt(20), y: mmToPt(45) })
    expect(a.columns[0].width).toBeCloseTo(mmToPt(85), 5)
  })
})

import { describe, expect, it } from 'vitest'
import { generate, generateBatch, mmToPt, RecordOverflowError, type LayoutInput, type Warning } from '@pdf-layouter/core'
import { invoiceData, invoiceLayout, serialLayout, serialRecords } from '../../../fixtures/data'
import { loadAssets, nodeFontRegistry } from '../../../fixtures/node'
import { readPdf } from './pdf'

const assets = loadAssets()
const fonts = nodeFontRegistry()
const PAGE_H = 841.89
const topMm = (y: number) => ((PAGE_H - y) / 72) * 25.4
const leftMm = (x: number) => (x / 72) * 25.4

describe('Use case 1: invoices and quotes (R1–R9)', () => {
  it('R1/R2: renders stationery as background on the first page and a logo on every page', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(70), { fonts }))
    expect(info.numPages).toBe(4)
    expect(info.pages.map((p) => p.images)).toEqual([2, 1, 1, 1]) // page 1: background + logo; others: logo
  })

  it('R2: works with only a logo and no background', async () => {
    const layout = invoiceLayout(assets, { static: [{ id: 'logo', type: 'image', asset: 'img_logo', x: 150, y: 15, w: 45, h: 15, pages: 'all' }] })
    const info = await readPdf(await generate(layout, invoiceData(3), { fonts }))
    expect(info.pages.map((p) => p.images)).toEqual(info.pages.map(() => 1)) // just the logo, no background
  })

  it('R3: places text boxes at the given position with resolved placeholders', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(3), { fonts }))
    const meta = info.pages[0]!.items.find((i) => i.str.startsWith('Rechnung RE-2026-0042'))!
    expect(meta).toBeTruthy()
    expect(topMm(meta.y)).toBeGreaterThan(50)
    expect(topMm(meta.y)).toBeLessThan(58)
    expect(info.pages[0]!.text).toContain('Datum: 28.10.2026')
  })

  it('R3: honours text alignment inside the box', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(3), { fonts }))
    const meta = info.pages[0]!.items.find((i) => i.str.startsWith('Datum'))!
    // right-aligned in a box spanning 125–190 mm: the text starts right of the box start
    expect(leftMm(meta.x)).toBeGreaterThan(140)
  })

  it('R4/R5: draws lines and rectangles without error', async () => {
    const layout: LayoutInput = {
      schemaVersion: 1,
      static: [
        { id: 'r', type: 'rect', x: 10, y: 10, w: 50, h: 20, fill: '#336699', radius: 2 },
        { id: 'l', type: 'line', x1: 10, y1: 40, x2: 100, y2: 40, width: 3, color: '#FF0000', dash: 'dotted' },
      ],
      flow: [{ type: 'text', content: 'ok' }],
    }
    const info = await readPdf(await generate(layout, {}))
    expect(info.numPages).toBe(1)
    expect(info.pages[0]!.colors).toContain('#336699') // rectangle fill
    expect(info.pages[0]!.colors).toContain('#ff0000') // line colour
  })

  it('R6: fills a table from a list and repeats the header on every page', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(70), { fonts }))
    const positions = info.pages.flatMap((p) => p.items.filter((i) => /^Beratung|Konzeption|Entwicklung|Qualit|Projektleitung|Schulung|Wartung|Übersetzung|Reisezeit|Dokumentation/.test(i.str)))
    expect(positions).toHaveLength(70)
    for (const page of info.pages.slice(0, 3)) expect(page.text).toContain('Pos Leistung Menge Einzel Gesamt')
    expect(info.pages[0]!.text).toMatch(/45,00\s€/)
  })

  it('R6: breaks a table across pages without splitting rows', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(70), { fonts }))
    const rowsPerPage = info.pages.map((p) => p.items.filter((i) => /Modul \d+ \(äöü ß\)/.test(i.str)).length)
    expect(rowsPerPage.slice(0, 3).every((n) => n > 15)).toBe(true)
    expect(rowsPerPage.reduce((a, b) => a + b, 0)).toBe(70)
  })

  it('R7: renders a totals block with the emphasised grand total', async () => {
    const data = invoiceData(10)
    const info = await readPdf(await generate(invoiceLayout(assets), data, { fonts }))
    const text = info.pages.map((p) => p.text).join(' ')
    expect(text).toContain('Netto')
    expect(text).toContain('USt 19 %')
    const brutto = (data.summen as { brutto: number }).brutto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }).replace(' ', ' ')
    expect(text.replace(/ /g, ' ')).toContain(brutto.replace(/\./g, '.'))
  })

  it('R8: renders several tables from different lists in one document', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(10), { fonts }))
    const text = info.pages.map((p) => p.text).join(' ')
    expect(text).toContain('Bahnfahrt München – Berlin')
    expect(text).toContain('Beratung Modul 1')
    expect(text.indexOf('Beratung Modul 1')).toBeLessThan(text.indexOf('Bahnfahrt'))
  })

  it('R8/R9: interleaves dynamic text and tables in the order the Host App gives', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(10), { fonts }))
    const text = info.pages.map((p) => p.text).join(' ')
    const from = text.indexOf('Leistungszeitraum')
    const order = ['Leistungszeitraum Oktober 2026', 'Grundpauschale', 'Zusätzlich angefallene', 'Bahn 189,90', 'Hotel 264,00'].map((s) => text.indexOf(s, from))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('R9: swapping the order of dynamic sections changes the output order', async () => {
    const data = invoiceData(2)
    const sections = data.abschnitte as unknown[]
    const swapped = { ...data, abschnitte: [...sections].reverse() }
    const text = (await readPdf(await generate(invoiceLayout(assets), swapped, { fonts }))).pages.map((p) => p.text).join(' ')
    expect(text.lastIndexOf('Hotel')).toBeLessThan(text.indexOf('Leistungszeitraum Oktober 2026'))
  })

  it('first-page and follow-up content boxes: content starts below the letterhead on page 1 and higher later', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(70), { fonts }))
    const firstFlow = info.pages[0]!.items.find((i) => i.str.startsWith('Sehr geehrte'))!
    expect(topMm(firstFlow.y)).toBeGreaterThan(95)
    expect(topMm(firstFlow.y)).toBeLessThan(105)
    const header = info.pages[1]!.items.find((i) => i.str === 'Pos')!
    expect(topMm(header.y)).toBeGreaterThan(30)
    expect(topMm(header.y)).toBeLessThan(40)
    expect(leftMm(header.x)).toBeGreaterThan(24)
  })

  it('draws "last" page elements only on the final page and numbers the footer', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(70), { fonts }))
    expect(info.pages.map((p) => p.text.includes('Vielen Dank für Ihr Vertrauen'))).toEqual([false, false, false, true])
    expect(info.pages.map((p) => /Seite (\d) von 4/.exec(p.text)?.[1])).toEqual(['1', '2', '3', '4'])
  })

  it('DIN 5008: the recipient block sits in the window of the chosen form', async () => {
    const info = await readPdf(await generate(invoiceLayout(assets), invoiceData(3), { fonts }))
    const name = info.pages[0]!.items.find((i) => i.str === 'Muster GmbH')!
    expect(leftMm(name.x)).toBeGreaterThan(19.5)
    expect(leftMm(name.x)).toBeLessThan(21)
    expect(topMm(name.y)).toBeGreaterThan(57.7) // recipient zone of form B starts at 45 + 12.7 mm
    expect(topMm(name.y)).toBeLessThan(72.3)
    const ret = info.pages[0]!.items.find((i) => i.str.startsWith('Beispiel AG'))!
    expect(topMm(ret.y)).toBeLessThan(topMm(name.y))
  })
})

describe('Use case 2: form letters (S1–S3)', () => {
  it('S1–S3: one page per record in a single PDF, each with its own address', async () => {
    const records = serialRecords(25)
    const info = await readPdf(await generateBatch(serialLayout(assets), records, { fonts, onePagePerRecord: true }))
    expect(info.numPages).toBe(25)
    info.pages.forEach((page, i) => {
      expect(page.text).toContain(`Nummer ${String(i + 1).padStart(2, '0')} Müller`)
      expect(page.text).toContain(`Einladung Nr. ${i + 1}`)
      expect(page.text).toContain('28. Oktober 2026')
    })
  })

  it('applies first-page rules to the first page of every record, not only of the document', async () => {
    const layout = serialLayout(assets)
    const long = Array.from({ length: 60 }, (_, i) => `Absatz ${i + 1}`).join('\n\n')
    const records = serialRecords(3).map((r, i) => (i === 1 ? { ...r, extra: long } : r))
    layout.flow = [...(layout.flow ?? []), { type: 'text', content: '{{extra}}' }]
    const info = await readPdf(await generateBatch(layout, records, { fonts }))
    expect(info.numPages).toBeGreaterThanOrEqual(4)
    const addressPages = info.pages.flatMap((p, i) => (p.text.includes('Nummer') && /Gartenweg \d+/.test(p.text) ? [i] : []))
    expect(addressPages).toHaveLength(3)
    // record 2 spans several pages, so record 3 starts later than page 3
    expect(addressPages[2]!).toBeGreaterThan(2)
  })

  it('numbers footer pages per record', async () => {
    const layout = serialLayout(assets)
    layout.page = { ...layout.page, footer: { content: 'Blatt {{page}}/{{pages}}', align: 'center' } }
    const records = serialRecords(2).map((r, i) => (i === 0 ? { ...r, extra: Array.from({ length: 60 }, (_, k) => `Zeile ${k}`).join('\n\n') } : r))
    layout.flow = [...(layout.flow ?? []), { type: 'text', content: '{{extra}}' }]
    const info = await readPdf(await generateBatch(layout, records, { fonts }))
    const footers = info.pages.map((p) => /Blatt (\d+)\/(\d+)/.exec(p.text)!.slice(1).join('/'))
    expect(footers[0]).toMatch(/^1\/\d+$/)
    expect(footers.at(-1)).toBe('1/1')
  })

  it('onePagePerRecord throws a RecordOverflowError for overlong letters, or warns on request', async () => {
    const layout = serialLayout(assets)
    layout.flow = [...(layout.flow ?? []), { type: 'text', content: '{{extra}}' }]
    const records = [{ ...serialRecords(1)[0]!, extra: Array.from({ length: 80 }, (_, k) => `Zeile ${k}`).join('\n\n') }]
    await expect(generateBatch(layout, records, { fonts, onePagePerRecord: true })).rejects.toBeInstanceOf(RecordOverflowError)
    const warnings: Warning[] = []
    await generateBatch(layout, records, { fonts, onePagePerRecord: true, overflow: 'warn', onWarning: (w) => warnings.push(w) })
    expect(warnings.some((w) => w.code === 'overflow')).toBe(true)
  })

  it('rejects an empty record list', async () => {
    await expect(generateBatch(serialLayout(assets), [], { fonts })).rejects.toThrow(/at least one record/)
  })

  it('a bitmap background appears once per record page', async () => {
    const layout = serialLayout(assets)
    layout.assets = { ...layout.assets, img_bg: { data: assets.background } }
    layout.static = [{ id: 'bg', type: 'image', asset: 'img_bg', x: 0, y: 0, w: 210, h: 297, pages: 'all' }, ...(layout.static ?? [])]
    const info = await readPdf(await generateBatch(layout, serialRecords(4), { fonts }))
    expect(info.pages.map((p) => p.images)).toEqual([1, 1, 1, 1])
  })
})

describe('A-series: generator behaviour', () => {
  it('A2: produces a valid PDF as Uint8Array', async () => {
    const pdf = await generate({ schemaVersion: 1, flow: [{ type: 'text', content: 'Hallo' }] }, {})
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-')
  })

  it('A5: replaces placeholders from the data and warns about missing ones', async () => {
    const warnings: Warning[] = []
    const info = await readPdf(await generate({ schemaVersion: 1, flow: [{ type: 'text', content: 'Hi {{name}} / {{fehlt}}' }] }, { name: 'Anna' }, { onWarning: (w) => warnings.push(w) }))
    expect(info.pages[0]!.text).toContain('Hi Anna /')
    expect(warnings.map((w) => w.code)).toEqual(['missing-value'])
  })

  it('A6: is stateless — alternating layouts do not influence each other', async () => {
    const a: LayoutInput = { schemaVersion: 1, page: { defaults: { font: 'Roboto', size: 10, color: '#222222' } }, flow: [{ type: 'text', content: 'LAYOUT-A' }] }
    const b: LayoutInput = { schemaVersion: 1, flow: [{ type: 'text', content: 'LAYOUT-B' }] }
    const results = await Promise.all([generate(a, {}), generate(b, {}), generate(a, {})])
    const texts = await Promise.all(results.map(async (r) => (await readPdf(r)).pages[0]!.text))
    expect(texts).toEqual(['LAYOUT-A', 'LAYOUT-B', 'LAYOUT-A'])
  })

  it('embeds the Host App fonts and falls back to Roboto for unknown families (with a warning)', async () => {
    const warnings: Warning[] = []
    const layout = invoiceLayout(assets, { page: { ...(invoiceLayout(assets).page as object), defaults: { font: 'Inter', size: 10, color: '#222222' } } as never })
    const inter = await readPdf(await generate(layout, invoiceData(3), { fonts }))
    expect(inter.raw).toMatch(/\+Inter-Regular/)
    const unknown = await readPdf(await generate({ ...layout, page: { ...(layout.page as object), defaults: { font: 'Nonexistent', size: 10, color: '#222222' } } as never }, invoiceData(3), { fonts, onWarning: (w) => warnings.push(w) }))
    expect(unknown.raw).toMatch(/\+Roboto-Regular/)
    expect(warnings.some((w) => w.code === 'unknown-font' && w.message.includes('Nonexistent'))).toBe(true)
  })

  it('uses a font family from the registry for static text boxes and the regular file for missing styles', async () => {
    const layout: LayoutInput = {
      schemaVersion: 1,
      static: [{ id: 't', type: 'text', x: 20, y: 20, w: 100, content: 'Serif fett', font: 'Merriweather', bold: true, italic: true }],
      flow: [],
    }
    // Merriweather registered with only a regular file: bold/italic must fall back instead of throwing
    const regularOnly = [{ family: 'Merriweather', files: { normal: fonts[1]!.files.normal } }]
    const info = await readPdf(await generate(layout, {}, { fonts: regularOnly }))
    expect(info.pages[0]!.text).toContain('Serif fett')
    expect(info.raw).toMatch(/\+Merriweather-Regular/)
  })

  it('supports rich text blocks: bold runs, lists and underline', async () => {
    const layout: LayoutInput = {
      schemaVersion: 1,
      flow: [
        { type: 'text', content: [{ type: 'paragraph', runs: [{ text: 'Normal ' }, { text: 'fett', bold: true }, { text: ' kursiv', italic: true }, { text: ' unterstrichen', underline: true }] }] },
        { type: 'text', content: [{ type: 'list', ordered: false, items: [[{ text: 'Eins' }], [{ text: 'Zwei {{x}}' }]] }, { type: 'list', ordered: true, items: [[{ text: 'Erst' }]] }] },
      ],
    }
    const text = (await readPdf(await generate(layout, { x: 'X' }))).pages[0]!.text
    expect(text).toContain('Normal')
    expect(text).toContain('Eins')
    expect(text).toContain('Zwei X')
    expect(text).toContain('Erst')
  })

  it('supports manual page breaks', async () => {
    const layout: LayoutInput = { schemaVersion: 1, flow: [{ type: 'text', content: 'Seite eins' }, { type: 'pageBreak' }, { type: 'text', content: 'Seite zwei' }] }
    const info = await readPdf(await generate(layout, {}))
    expect(info.numPages).toBe(2)
    expect(info.pages[1]!.text).toContain('Seite zwei')
  })

  it('rejects invalid layouts with a readable error', async () => {
    await expect(generate({ schemaVersion: 1, page: { size: 'B7' } }, {})).rejects.toThrow(/Invalid layout/)
  })

  it('supports PDF/A and embedded attachments (ZUGFeRD-style)', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>'
    const pdf = await generate({ schemaVersion: 1, flow: [{ type: 'text', content: 'PDF/A' }] }, {}, {
      pdfa: 'PDF/A-3b',
      attachments: [{ filename: 'factur-x.xml', data: xml, mimeType: 'text/xml', relationship: 'Alternative', description: 'Factur-X' }],
    })
    const info = await readPdf(pdf)
    expect(info.raw).toContain('EmbeddedFile')
    expect(info.raw).toContain('factur-x.xml')
    expect(info.raw).toContain('Alternative')
    expect(info.raw).toMatch(/pdfaid|PDF\/A/)
  })

  it('mm units are converted exactly', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10)
  })
})

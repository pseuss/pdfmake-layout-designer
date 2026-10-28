import { describe, expect, it } from 'vitest'
import { defineFonts, generate, pdfResponse } from '@pdf-layouter/core'
import { nodeFontRegistry } from '../../../fixtures/node'

describe('defineFonts: one declaration, a registry per side', () => {
  const fonts = defineFonts([{ family: 'Inter', files: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' } }])

  it('resolves the files against a URL prefix for the browser', () => {
    expect(fonts.at('/fonts')).toEqual([{ family: 'Inter', files: { normal: '/fonts/Inter-Regular.ttf', bold: '/fonts/Inter-Bold.ttf' } }])
    expect(fonts.at('/fonts/')[0]!.files.normal).toBe('/fonts/Inter-Regular.ttf')
  })

  it('resolves the same files against a directory for the server', () => {
    expect(fonts.at('/srv/app/public/fonts')[0]!.files.bold).toBe('/srv/app/public/fonts/Inter-Bold.ttf')
  })

  it('keeps absolute URLs and paths as they are', () => {
    const mixed = defineFonts([{ family: 'X', files: { normal: 'https://cdn.example/x.ttf', bold: '/abs/x-bold.ttf' } }])
    expect(mixed.at('/fonts')[0]!.files).toEqual({ normal: 'https://cdn.example/x.ttf', bold: '/abs/x-bold.ttf' })
  })

  it('produces a registry the Generator accepts', async () => {
    const dir = new URL('../../../fixtures/fonts', import.meta.url).pathname
    const registry = defineFonts([{ family: 'Inter', files: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-BoldItalic.ttf' } }]).at(dir)
    expect(registry).toEqual(nodeFontRegistry().filter((f) => f.family === 'Inter'))
    const warnings: string[] = []
    const pdf = await generate({ schemaVersion: 1, page: { defaults: { font: 'Inter' } }, flow: [{ type: 'text', content: 'x' }] }, {}, { fonts: registry, onWarning: (w) => warnings.push(w.message) })
    expect(warnings).toEqual([])
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })
})

describe('pdfResponse', () => {
  it('wraps the bytes in a standard Response with PDF headers', async () => {
    const res = pdfResponse(new Uint8Array([37, 80, 68, 70]), { filename: 'RE-1.pdf' })
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="RE-1.pdf"')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]))
  })

  it('can force a download and never lets a file name break the header', () => {
    const res = pdfResponse(new Uint8Array(), { filename: 'a"b\r\nc.pdf', download: true })
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="a_b__c.pdf"')
    expect(pdfResponse(new Uint8Array()).headers.get('content-disposition')).toBeNull()
  })
})

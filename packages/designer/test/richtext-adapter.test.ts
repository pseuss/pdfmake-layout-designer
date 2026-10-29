import { describe, expect, it } from 'vitest'
import type { RichBlock } from 'pdfmake-layout-designer-core'
import { blocksToDoc, docToBlocks, fontSizeToPt } from '../src/richtext-adapter'

describe('rich text adapter', () => {
  const blocks: RichBlock[] = [
    { type: 'paragraph', runs: [{ text: 'Hallo ' }, { text: 'fett', bold: true }, { text: ' kursiv', italic: true }, { text: ' unter', underline: true }, { text: 'alles', bold: true, italic: true, underline: true }] },
    { type: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b', bold: true }]] },
    { type: 'list', ordered: true, items: [[{ text: '1' }]] },
  ]

  it('round-trips blocks through the editor document format', () => {
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks)
  })

  it('round-trips run colour and size and paragraph alignment', () => {
    const styled: RichBlock[] = [
      { type: 'paragraph', align: 'center', runs: [{ text: 'rot ', color: '#ff0000' }, { text: 'groß', size: 18, bold: true }, { text: 'beides', color: '#00aa00', size: 7.5 }] },
      { type: 'paragraph', align: 'right', runs: [{ text: 'rechts' }] },
      { type: 'paragraph', align: 'justify', runs: [{ text: 'Blocksatz' }] },
      { type: 'list', ordered: false, items: [[{ text: 'Punkt', color: '#0000ff' }]] },
    ]
    expect(docToBlocks(blocksToDoc(styled))).toEqual(styled)
  })

  it('treats left alignment as the default and ignores invalid colours', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'left' }, content: [{ type: 'text', text: 'a', marks: [{ type: 'textStyle', attrs: { color: 'red', fontSize: null } }] }] }] }
    expect(docToBlocks(doc)).toEqual([{ type: 'paragraph', runs: [{ text: 'a' }] }])
  })

  it('converts font sizes from pt and px', () => {
    expect(fontSizeToPt('12pt')).toBe(12)
    expect(fontSizeToPt('16px')).toBe(12)
    expect(fontSizeToPt('7.5')).toBe(7.5)
    expect(fontSizeToPt('')).toBeUndefined()
    expect(fontSizeToPt('abc')).toBeUndefined()
  })

  it('creates an empty paragraph for no blocks', () => {
    expect(blocksToDoc([])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(docToBlocks({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([{ type: 'paragraph', runs: [] }])
  })

  it('keeps hard breaks as newlines and ignores unknown nodes', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }, { type: 'blockquote' }] }
    expect(docToBlocks(doc)).toEqual([{ type: 'paragraph', runs: [{ text: 'a' }, { text: '\n' }, { text: 'b' }] }])
  })
})

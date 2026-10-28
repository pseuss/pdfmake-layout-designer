import { describe, expect, it } from 'vitest'
import type { RichBlock } from '@pdf-layouter/core'
import { blocksToDoc, docToBlocks } from '../src/richtext-adapter'

describe('rich text adapter', () => {
  const blocks: RichBlock[] = [
    { type: 'paragraph', runs: [{ text: 'Hallo ' }, { text: 'fett', bold: true }, { text: ' kursiv', italic: true }, { text: ' unter', underline: true }, { text: 'alles', bold: true, italic: true, underline: true }] },
    { type: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b', bold: true }]] },
    { type: 'list', ordered: true, items: [[{ text: '1' }]] },
  ]

  it('round-trips blocks through the editor document format', () => {
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks)
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

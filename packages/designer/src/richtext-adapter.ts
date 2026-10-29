import type { RichBlock, Run } from 'pdfmake-layout-designer-core'

// Minimal structural types for the parts of the ProseMirror JSON the editor produces.
export interface PmMark {
  type: string
  attrs?: { color?: string | null; fontSize?: string | null }
}
export interface PmNode {
  type: string
  text?: string
  attrs?: { textAlign?: string | null }
  marks?: PmMark[]
  content?: PmNode[]
}

const PT_PER_PX = 0.75

/** `12pt`, `16px` or `12` to points. */
export function fontSizeToPt(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round((/px\s*$/i.test(value) ? n * PT_PER_PX : n) * 100) / 100
}

function runsToPm(runs: Run[]): PmNode[] {
  return runs
    .filter((r) => r.text !== '')
    .map((r) => {
      const marks: PmMark[] = []
      if (r.bold) marks.push({ type: 'bold' })
      if (r.italic) marks.push({ type: 'italic' })
      if (r.underline) marks.push({ type: 'underline' })
      if (r.color || r.size) marks.push({ type: 'textStyle', attrs: { color: r.color ?? null, fontSize: r.size ? `${r.size}pt` : null } })
      return { type: 'text', text: r.text, ...(marks.length ? { marks } : {}) }
    })
}

/** Layout rich text blocks to an editor document. */
export function blocksToDoc(blocks: RichBlock[]): PmNode {
  const content: PmNode[] = blocks.map((b) => {
    if (b.type === 'paragraph') return { type: 'paragraph', ...(b.align ? { attrs: { textAlign: b.align } } : {}), content: runsToPm(b.runs) }
    return {
      type: b.ordered ? 'orderedList' : 'bulletList',
      content: b.items.map((runs) => ({ type: 'listItem', content: [{ type: 'paragraph', content: runsToPm(runs) }] })),
    }
  })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function pmToRuns(nodes: PmNode[] = []): Run[] {
  const runs: Run[] = []
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      runs.push({ text: '\n' })
      continue
    }
    if (n.type !== 'text' || n.text === undefined) continue
    const marks = n.marks ?? []
    const has = (type: string) => marks.some((m) => m.type === type)
    const style = marks.find((m) => m.type === 'textStyle')?.attrs
    const run: Run = { text: n.text }
    if (has('bold')) run.bold = true
    if (has('italic')) run.italic = true
    if (has('underline')) run.underline = true
    if (style?.color && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(style.color)) run.color = style.color
    const size = fontSizeToPt(style?.fontSize)
    if (size) run.size = size
    runs.push(run)
  }
  return runs
}

const ALIGNS = new Set(['left', 'center', 'right', 'justify'])

/** Editor document back to Layout rich text blocks. */
export function docToBlocks(doc: PmNode): RichBlock[] {
  const blocks: RichBlock[] = []
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') {
      const align = node.attrs?.textAlign
      blocks.push({ type: 'paragraph', runs: pmToRuns(node.content), ...(align && align !== 'left' && ALIGNS.has(align) ? { align: align as 'center' | 'right' | 'justify' } : {}) })
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? []).map((li) => (li.content ?? []).flatMap((p) => pmToRuns(p.content)))
      blocks.push({ type: 'list', ordered: node.type === 'orderedList', items })
    }
  }
  return blocks
}

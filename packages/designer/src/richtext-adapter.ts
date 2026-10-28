import type { RichBlock, Run } from '@pdf-layouter/core'

// Minimal structural types for the parts of the ProseMirror JSON the editor produces.
export interface PmMark {
  type: string
}
export interface PmNode {
  type: string
  text?: string
  marks?: PmMark[]
  content?: PmNode[]
}

function runsToPm(runs: Run[]): PmNode[] {
  return runs
    .filter((r) => r.text !== '')
    .map((r) => {
      const marks: PmMark[] = []
      if (r.bold) marks.push({ type: 'bold' })
      if (r.italic) marks.push({ type: 'italic' })
      if (r.underline) marks.push({ type: 'underline' })
      return { type: 'text', text: r.text, ...(marks.length ? { marks } : {}) }
    })
}

/** Layout rich text blocks to an editor document. */
export function blocksToDoc(blocks: RichBlock[]): PmNode {
  const content: PmNode[] = blocks.map((b) => {
    if (b.type === 'paragraph') return { type: 'paragraph', content: runsToPm(b.runs) }
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
    const types = new Set((n.marks ?? []).map((m) => m.type))
    const run: Run = { text: n.text }
    if (types.has('bold')) run.bold = true
    if (types.has('italic')) run.italic = true
    if (types.has('underline')) run.underline = true
    runs.push(run)
  }
  return runs
}

/** Editor document back to Layout rich text blocks. */
export function docToBlocks(doc: PmNode): RichBlock[] {
  const blocks: RichBlock[] = []
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') blocks.push({ type: 'paragraph', runs: pmToRuns(node.content) })
    else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? []).map((li) => (li.content ?? []).flatMap((p) => pmToRuns(p.content)))
      blocks.push({ type: 'list', ordered: node.type === 'orderedList', items })
    }
  }
  return blocks
}

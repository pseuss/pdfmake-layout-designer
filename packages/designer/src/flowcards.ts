import { fitColumnWidths, applyFormatter, lookup, ROW_GAP_MM, rowWidthsMm, toBlocks, totalsRowLine, type Data, type FlowBlock, type Layout } from 'pdfmake-layout-designer-core'
import { h } from './dom'
import { cssFontFamily } from './fonts'
import type { Translator } from './i18n'
import { previewText } from './warnings'

const PT_PX = 96 / 72
const FLOW_HEIGHT_MM: Record<FlowBlock['type'], number> = { text: 14, table: 40, totals: 20, dynamicSections: 30, pageBreak: 6 }
/** Blocks of these types can share a row (same rule as the Generator). */
const ROW_TYPES = new Set<FlowBlock['type']>(['text', 'table', 'totals'])
const SAMPLE_ROWS = 4

/** What the flow cards need from the canvas: data, scale and selection. */
export interface FlowContext {
  layout: Layout
  sampleData: Data
  zoom: number
  /** Millimetres to a CSS pixel length at the current zoom. */
  px: (mm: number) => string
  t: Translator
  selectedIndex: number | undefined
  onSelect: (index: number) => void
}

export const FLOW_LABEL_KEYS = { text: 'flow.text', table: 'flow.table', totals: 'flow.totals', dynamicSections: 'flow.dynamicSections', pageBreak: 'flow.pageBreak' } as const

/** Name of a Flow Block for lists, cards and panel titles. */
export function flowBlockLabel(t: Translator, block: FlowBlock): string {
  const name = t(FLOW_LABEL_KEYS[block.type])
  return block.type === 'table' || block.type === 'dynamicSections' ? `${name}: ${block.source}` : name
}

const formatValue = (layout: Layout) => (value: unknown, formatter: string | undefined) => applyFormatter(value, formatter, { locale: layout.locale, currency: layout.currency })

/** The Content Box's blocks as DOM: blocks that share a row are drawn side by side, with the Generator's widths. */
export function renderFlowRows(c: FlowContext, boxMm: number): HTMLElement[] {
  const flow = c.layout.flow
  const rows: number[][] = []
  flow.forEach((block, index) => {
    const previous = rows[rows.length - 1]
    const joins = 'sameRow' in block && block.sameRow && previous && ROW_TYPES.has(block.type) && previous.every((i) => ROW_TYPES.has(flow[i]!.type))
    if (joins) previous.push(index)
    else rows.push([index])
  })
  return rows.map((row) => {
    const widths = row.length > 1 ? rowWidthsMm(row.map((i) => flow[i]!), boxMm) : [boxMm]
    const cards = row.map((index, n) => renderFlowCard(c, flow[index]!, index, row.length > 1 ? widths[n]! : undefined, boxMm))
    return row.length === 1 ? cards[0]! : h('div', { class: 'pld-flowrow', 'data-testid': `flowrow-${row[0]}`, style: { gap: c.px(ROW_GAP_MM) } }, ...cards)
  })
}

function renderFlowCard(c: FlowContext, block: FlowBlock, index: number, sharedMm: number | undefined, boxMm: number): HTMLElement {
  const { layout, px } = c
  const selected = c.selectedIndex === index
  const fmt = formatValue(layout)
  const font = cssFontFamily(('font' in block && block.font) || layout.page.defaults.font)
  const pt = (size: number) => `${size * PT_PX * c.zoom}px`
  const card = h(
    'div',
    { class: `pld-flowcard${selected ? ' is-selected' : ''}${block.type === 'pageBreak' ? ' is-break' : ''}`, 'data-testid': `flowcard-${index}`, 'data-type': block.type },
    h('div', { class: 'pld-flowcard-label' }, flowBlockLabel(c.t, block)),
  )
  if (block.type === 'pageBreak') card.style.height = px(FLOW_HEIGHT_MM.pageBreak)
  else if (block.type === 'dynamicSections') card.style.height = px(FLOW_HEIGHT_MM.dynamicSections)
  // a width in millimetres is true to scale, '*' shares what is left of the row
  const width = 'width' in block ? block.width : undefined
  const margin = ('margin' in block && block.margin) || undefined
  const sides = margin ? margin.left + margin.right : 0
  const availMm = Math.max(0, (sharedMm ?? boxMm) - sides)
  if (margin) card.style.margin = `${px(margin.top)} ${px(margin.right)} ${px(margin.bottom)} ${px(margin.left)}`
  if (sharedMm !== undefined) Object.assign(card.style, { width: px(availMm), flex: 'none', maxWidth: '100%' })
  else if (typeof width === 'number' && block.type === 'totals') Object.assign(card.style, { width: px(Math.min(width, boxMm - sides)), flex: 'none' })

  const body = h('div', { class: 'pld-flowbody', style: { fontFamily: font, fontSize: pt(layout.page.defaults.size), color: layout.page.defaults.color } })
  const text = (text: string, into: HTMLElement) => {
    const parts = previewText(text, c.sampleData, fmt).split(/(\{\{[^{}]*\}\})/)
    for (const part of parts) into.append(part.startsWith('{{') ? h('span', { class: 'pld-missing' }, part) : part)
  }
  const bodies: { [K in FlowBlock['type']]?: (block: Extract<FlowBlock, { type: K }>) => void } = {
    text: (block) => {
      for (const rich of toBlocks(block.content)) {
        const para = h('div', { class: 'pld-flowpara' })
        if (rich.type === 'paragraph') {
          para.style.textAlign = rich.align ?? 'left'
          for (const run of rich.runs) {
            const span = h('span', {})
            Object.assign(span.style, {
              fontWeight: run.bold ? '700' : '',
              fontStyle: run.italic ? 'italic' : '',
              textDecoration: run.underline ? 'underline' : '',
              color: run.color ?? '',
              fontSize: run.size ? pt(run.size) : '',
            })
            text(run.text, span)
            para.append(span)
          }
        } else {
          rich.items.forEach((runs, i) => {
            const li = h('div', { class: 'pld-flowli' }, rich.ordered ? `${i + 1}.` : '•', ' ')
            for (const run of runs) text(run.text, li)
            para.append(li)
          })
        }
        body.append(para)
      }
    },
    table: (block) => body.append(tableMock(c, block, fmt, availMm)),
    totals: (block) => {
      const table = h('div', { class: 'pld-flowtotals' })
      block.rows.forEach((row, rowIndex) => {
        const line = h('div', { class: `pld-flowtotals-row${row.bold ? ' is-bold' : ''}${totalsRowLine(row, rowIndex) ? ' has-line' : ''}` }, h('span', {}, ''), h('span', {}, ''))
        text(row.label, line.children[0] as HTMLElement)
        text(row.value, line.children[1] as HTMLElement)
        table.append(line)
      })
      body.append(table)
    },
  }
  ;(bodies[block.type] as ((block: FlowBlock) => void) | undefined)?.(block)
  if (body.childNodes.length) card.append(body)
  card.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    c.onSelect(index)
  })
  return card
}

/** A true-to-scale mock-up of a table: column widths, titles, alignment, formats, zebra and borders. */
function tableMock(fc: FlowContext, block: Extract<FlowBlock, { type: 'table' }>, fmt: (value: unknown, formatter: string | undefined) => string, availMm: number): HTMLElement {
  const { layout, px } = fc
  const style = block.style
  const rows = lookup(fc.sampleData, block.source)
  const real = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
  const shown = real.slice(0, SAMPLE_ROWS)
  const cols = block.columns
  const wrap = h('div', { class: `pld-flowtable is-${style.borders}`, style: { fontSize: `${(style.size ?? layout.page.defaults.size) * PT_PX * fc.zoom}px`, borderColor: style.borderColor } })
  const grid = h('div', { class: 'pld-flowtable-grid', style: { gridTemplateColumns: fitColumnWidths(cols, availMm).map((w) => (typeof w === 'number' ? px(w) : w === 'auto' ? 'auto' : 'minmax(0, 1fr)')).join(' ') } })
  const cell = (content: string, c: (typeof cols)[number], extra: Partial<CSSStyleDeclaration> = {}, cls = '') => {
    const el = h('div', { class: `pld-flowcell ${cls}`, style: { textAlign: c.align, borderColor: style.borderColor } }, content)
    Object.assign(el.style, extra)
    grid.append(el)
  }
  for (const c of cols) cell(c.title || c.field, c, { background: style.headerFill ?? '', color: style.headerColor ?? '', fontWeight: '700' }, 'is-head')
  const count = shown.length || SAMPLE_ROWS
  for (let r = 0; r < count; r++) {
    const zebra = style.zebra && r % 2 === 1 ? style.zebraFill : ''
    for (const c of cols) {
      const raw = shown.length ? lookup(shown[r], c.field) : undefined
      const content = shown.length ? (raw === undefined || raw === null ? '' : fmt(raw, c.format)) : ''
      cell(content, c, { background: zebra }, shown.length ? '' : 'is-dummy')
    }
  }
  wrap.append(grid)
  if (real.length > shown.length) wrap.append(h('div', { class: 'pld-flowtable-more' }, `… +${real.length - shown.length}`))
  else if (!shown.length) wrap.append(h('div', { class: 'pld-flowtable-more' }, fc.t('flow.noRows')))
  return wrap
}


import { isSvgAsset, pageRuleMatches, pageSizeMm, parseLayout } from './layout'
import {
  applyFormatter,
  evaluateCondition,
  lookup,
  resolvePageTemplate,
  parseTemplate,
  resolveTemplate,
  type Data,
  type FormatContext,
  type Warning,
} from './placeholders'
import {
  ColumnSchema,
  ADDRESS_PRESETS,
  RichBlockSchema,
  RunSchema,
  TableStyleSchema,
  toBlocks,
  type Box,
  type Column,
  type FlowBlock,
  type Layout,
  type LayoutInput,
  type PageRule,
  type RichBlock,
  type Run,
  type StaticElement,
  type TableStyle,
} from './schema'
import { z } from 'zod'

// pdfmake document definitions are open-ended; the library only relies on the shapes it builds itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocDefinition = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

const PT_PER_MM = 72 / 25.4
export const mmToPt = (mm: number): number => mm * PT_PER_MM

/** First and last page (1-based, inclusive) of every record in the rendered document. */
export interface PageMap {
  records: { start: number; end: number }[]
}

export interface CompileOptions {
  pageMap?: PageMap
  onWarning?: (w: Warning) => void
  /** Leave the Static Layer out; used for the measuring pass, which only needs page positions. */
  omitStatic?: boolean
}

export interface CompileResult {
  docDefinition: DocDefinition
  warnings: Warning[]
  /** Font families referenced by the Layout, for building the font table. */
  fonts: string[]
  /** Whether page rules or per-record data need the page map from a measuring pass. */
  needsPageMap: boolean
}

export const startMarkerId = (record: number): string => `plr-${record}-start`
export const endMarkerId = (record: number): string => `plr-${record}-end`

const DynamicItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.union([z.string(), z.array(RunSchema), z.array(RichBlockSchema)]) }),
  z.object({
    type: z.literal('table'),
    columns: z.array(ColumnSchema).min(1),
    rows: z.array(z.record(z.string(), z.unknown())),
    style: TableStyleSchema.partial().optional(),
  }),
])

export function collectFonts(layout: Layout): string[] {
  const fonts = new Set<string>([layout.page.defaults.font])
  for (const el of layout.static) if ('font' in el && el.font) fonts.add(el.font)
  for (const block of layout.flow) if ('font' in block && block.font) fonts.add(block.font)
  return [...fonts]
}

/**
 * pdfmake has one set of page margins per document. The Content Box is therefore mapped to the
 * margins of the follow-up pages plus a spacer on the first page of every record (see ADR 0001).
 */
function computeMargins(first: Box, follow: Box, warn: (w: Warning) => void) {
  if (first.left !== follow.left || first.right !== follow.right) {
    warn({ code: 'layout', message: 'contentBox.first and contentBox.follow differ in left/right; the first page values are used for all pages' })
  }
  if (first.bottom !== follow.bottom) {
    warn({ code: 'layout', message: 'contentBox.first.bottom and contentBox.follow.bottom differ; the larger value is used for all pages' })
  }
  let top = follow.top
  if (first.top < follow.top) {
    warn({ code: 'layout', message: 'contentBox.first.top is smaller than contentBox.follow.top; the smaller value is used for all pages' })
    top = first.top
  }
  return {
    margins: [mmToPt(first.left), mmToPt(top), mmToPt(first.right), mmToPt(Math.max(first.bottom, follow.bottom))],
    firstPageSpacer: mmToPt(first.top - top),
  }
}

function runNodes(runs: Run[], resolve: (s: string) => string): Node[] {
  return runs.map((r) => {
    const node: Node = { text: resolve(r.text) }
    if (r.bold) node.bold = true
    if (r.italic) node.italics = true
    if (r.underline) node.decoration = 'underline'
    if (r.color) node.color = r.color
    if (r.size) node.fontSize = r.size
    return node
  })
}

function richNodes(blocks: RichBlock[], resolve: (s: string) => string): Node[] {
  return blocks.map((block) => {
    if (block.type === 'paragraph') {
      const text = runNodes(block.runs, resolve)
      return { text: text.length ? text : ' ', alignment: block.align, margin: [0, 0, 0, 6] }
    }
    const items = block.items.map((runs) => ({ text: runNodes(runs, resolve) }))
    return { [block.ordered ? 'ol' : 'ul']: items, margin: [0, 0, 0, 6] }
  })
}

function tableLayout(style: TableStyle) {
  const color = style.borderColor
  return {
    hLineWidth: (i: number, node: Node) => (style.borders === 'none' ? 0 : style.borders === 'grid' || i === 0 || i === 1 || i === node.table.body.length ? 0.5 : 0.25),
    vLineWidth: () => (style.borders === 'grid' ? 0.5 : 0),
    hLineColor: () => color,
    vLineColor: () => color,
    paddingTop: () => 3,
    paddingBottom: () => 3,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    fillColor: (row: number) => (row === 0 ? undefined : style.zebra && row % 2 === 0 ? style.zebraFill : undefined),
  }
}

/** Smallest width (mm) a '*' column keeps when fixed columns have to give way. */
const MIN_STAR_MM = 20
/** Millimetre gap between blocks that share a row. */
export const ROW_GAP_MM = 4

/**
 * Column widths that fit into `availMm`: fixed columns shrink proportionally when together with
 * the '*' columns' minimum they would exceed the available width, so a table never leaves its box.
 */
export function fitColumnWidths(columns: Column[], availMm: number): Column['width'][] {
  const fixed = columns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0)
  const stars = columns.filter((c) => c.width === '*').length
  const room = availMm - stars * MIN_STAR_MM
  if (fixed <= room || fixed === 0) return columns.map((c) => c.width)
  const factor = Math.max(0.2, room / fixed)
  return columns.map((c) => (typeof c.width === 'number' ? Math.round(c.width * factor * 100) / 100 : c.width))
}

/** Widths (mm) of the blocks of one row: fixed widths keep their size, '*' blocks share the rest equally. */
export function rowWidthsMm(blocks: FlowBlock[], availMm: number): number[] {
  const gaps = (blocks.length - 1) * ROW_GAP_MM
  const fixed = blocks.map((b) => ('width' in b && typeof b.width === 'number' ? b.width : undefined))
  const fixedSum = fixed.reduce<number>((sum, w) => sum + (w ?? 0), 0)
  const stars = fixed.filter((w) => w === undefined).length
  const room = availMm - gaps
  const scale = fixedSum > room - stars * MIN_STAR_MM && fixedSum > 0 ? Math.max(0.2, (room - stars * MIN_STAR_MM) / fixedSum) : 1
  const share = stars ? Math.max(0, (room - fixedSum * scale) / stars) : 0
  return fixed.map((w) => (w === undefined ? share : w * scale))
}

function buildTable(columns: Column[], rows: Record<string, unknown>[], style: TableStyle, ctx: FormatContext, warn: (w: Warning) => void, source: string, availMm?: number): Node {
  const widths = availMm === undefined ? columns.map((c) => c.width) : fitColumnWidths(columns, availMm)
  const header = columns.map((c) => {
    const cell: Node = { text: c.title, bold: true, alignment: c.align }
    if (style.headerFill) cell.fillColor = style.headerFill
    if (style.headerColor) cell.color = style.headerColor
    return cell
  })
  const missing = new Set<string>()
  const body = rows.map((row) =>
    columns.map((c) => {
      const value = lookup(row, c.field)
      if (value === undefined || value === null) missing.add(c.field)
      return { text: applyFormatter(value, c.format, ctx, warn), alignment: c.align }
    }),
  )
  for (const field of missing) warn({ code: 'missing-value', message: `Table "${source}": some rows have no value for column "${field}"` })
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: widths.map((w) => (typeof w === 'number' ? mmToPt(w) : w)),
      body: [header, ...body],
    },
    layout: tableLayout(style),
    fontSize: style.size,
    margin: [0, 0, 0, 8],
  }
}

const ROW_TYPES = new Set<FlowBlock['type']>(['text', 'table', 'totals'])

function buildFlow(layout: Layout, data: Data, ctx: FormatContext, warn: (w: Warning) => void): Node[] {
  const contentMm = pageSizeMm(layout).w - layout.page.contentBox.first.left - layout.page.contentBox.first.right
  const resolve = (s: string) => resolveTemplate(s, data, ctx, warn)

  /** Nodes of one block; `inRow` totals fill their column instead of aligning themselves. */
  const blockNodes = (block: FlowBlock, inRow: boolean, availMm: number): Node[] => {
    const out: Node[] = []
    switch (block.type) {
      case 'text':
        out.push({ stack: richNodes(block.content, resolve), margin: block.margin })
        break
      case 'table': {
        const rows = lookup(data, block.source)
        if (!Array.isArray(rows)) {
          warn({ code: 'missing-list', message: `No list "${block.source}" in the data; table skipped` })
          break
        }
        out.push(buildTable(block.columns, rows as Record<string, unknown>[], block.style, ctx, warn, block.source, availMm))
        break
      }
      case 'totals': {
        const boldRows = block.rows.map((r) => r.bold)
        const table: Node = {
          table: {
            widths: ['*', 'auto'],
            body: block.rows.map((r) => {
              const style: Node = r.bold ? { bold: true } : {}
              return [
                { text: resolve(r.label), ...style },
                { text: resolve(r.value), alignment: 'right', ...style },
              ]
            }),
          },
          layout: {
            hLineWidth: (i: number) => (i > 0 && boldRows[i] ? 0.75 : 0),
            vLineWidth: () => 0,
            hLineColor: () => '#444444',
            paddingTop: () => 2,
            paddingBottom: () => 2,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
        }
        if (inRow) {
          out.push({ ...table, margin: [0, 0, 0, 8] })
          break
        }
        const columns: Node[] = [{ width: block.width === '*' ? '*' : mmToPt(block.width), ...table }]
        if (block.align === 'right') columns.unshift({ width: '*', text: '' })
        out.push({ columns, margin: [0, 0, 0, 8] })
        break
      }
      case 'dynamicSections': {
        const items = lookup(data, block.source)
        if (!Array.isArray(items)) {
          warn({ code: 'missing-list', message: `No section list "${block.source}" in the data; sections skipped` })
          break
        }
        items.forEach((raw, index) => {
          const parsed = DynamicItemSchema.safeParse(raw)
          if (!parsed.success) {
            warn({ code: 'invalid-value', message: `Section ${index} of "${block.source}" is invalid: ${parsed.error.issues[0]?.message ?? 'unknown error'}` })
            return
          }
          const item = parsed.data
          if (item.type === 'text') {
            out.push({ stack: richNodes(toBlocks(item.content as string | Run[] | RichBlock[]), resolve), margin: block.styles.text.margin })
          } else {
            const style = TableStyleSchema.parse({ ...block.styles.table, ...item.style })
            out.push(buildTable(item.columns, item.rows, style, ctx, warn, `${block.source}[${index}]`, availMm))
          }
        })
        break
      }
      case 'pageBreak':
        out.push({ text: ' ', fontSize: 1, pageBreak: 'before' })
        break
    }
    // a block font overrides the document font for everything the block produced
    if ('font' in block && block.font) for (const node of out) node.font = block.font
    return out
  }

  // blocks that share a row are grouped; a hidden block neither starts nor breaks a row
  const rows: FlowBlock[][] = []
  for (const block of layout.flow) {
    if (!evaluateCondition(block.visibleWhen, data)) continue
    const previous = rows[rows.length - 1]
    if ('sameRow' in block && block.sameRow && previous && ROW_TYPES.has(block.type) && previous.every((b) => ROW_TYPES.has(b.type))) previous.push(block)
    else rows.push([block])
  }

  const out: Node[] = []
  for (const row of rows) {
    if (row.length === 1) {
      out.push(...blockNodes(row[0]!, false, contentMm))
      continue
    }
    const widths = rowWidthsMm(row, contentMm)
    out.push({
      columns: row.map((block, i) => ({ width: mmToPt(widths[i]!), stack: blockNodes(block, true, widths[i]!) })),
      columnGap: mmToPt(ROW_GAP_MM),
    })
  }
  return out
}

// ---- static layer -----------------------------------------------------------

interface PageCounters {
  page: number
  pages: number
}

interface StaticNode {
  rule: PageRule
  /** Ready node; elements that use `{{page}}` / `{{pages}}` provide `build` instead and are rendered per page. */
  node?: Node
  build?: (counters: PageCounters) => Node
}

const PAGE_TOKENS = new Set(['page', 'pages'])
/** Whether a template contains `{{page}}` or `{{pages}}`. */
const PAGES_TOKEN = /\{\{\s*pages\s*(\|[^}]*)?\}\}/

export const usesPageTokens = (template: string | undefined): boolean => !!template && parseTemplate(template).some((t) => t.kind === 'placeholder' && PAGE_TOKENS.has(t.path))

function textProps(el: { font?: string | undefined; size?: number | undefined; color?: string | undefined; bold?: boolean | undefined; italic?: boolean | undefined; align: string }): Node {
  const props: Node = { alignment: el.align }
  if (el.font) props.font = el.font
  if (el.size) props.fontSize = el.size
  if (el.color) props.color = el.color
  if (el.bold) props.bold = true
  if (el.italic) props.italics = true
  return props
}

function staticNodes(layout: Layout, data: Data, ctx: FormatContext, warn: (w: Warning) => void): StaticNode[] {
  let counters: PageCounters | undefined
  const resolve = (s: string) => (counters ? resolvePageTemplate(s, data, ctx, counters, warn) : resolveTemplate(s, data, ctx, warn))
  const result: StaticNode[] = []
  for (const el of layout.static as StaticElement[]) {
    if (!evaluateCondition(el.visibleWhen, data)) continue
    const build = (pc?: PageCounters): Node => {
    counters = pc
    let node: Node
    switch (el.type) {
      case 'image': {
        const asset = layout.assets[el.asset]!
        const common = { absolutePosition: { x: mmToPt(el.x), y: mmToPt(el.y) } }
        node = isSvgAsset(asset.data)
          ? { svg: asset.data, width: mmToPt(el.w), height: mmToPt(el.h), ...common }
          : { image: `asset:${el.asset}`, width: mmToPt(el.w), height: mmToPt(el.h), ...common }
        break
      }
      case 'rect': {
        const shape: Node = { type: 'rect', x: 0, y: 0, w: mmToPt(el.w), h: mmToPt(el.h), r: mmToPt(el.radius) }
        if (el.fill) shape.color = el.fill
        if (el.stroke) {
          shape.lineColor = el.stroke.color
          shape.lineWidth = el.stroke.width
        } else {
          shape.lineWidth = 0
        }
        node = { canvas: [shape], absolutePosition: { x: mmToPt(el.x), y: mmToPt(el.y) } }
        break
      }
      case 'line': {
        const dash = el.dash === 'dashed' ? { length: 4, space: 3 } : el.dash === 'dotted' ? { length: 1, space: 2 } : undefined
        const shape: Node = {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: mmToPt(el.x2 - el.x1),
          y2: mmToPt(el.y2 - el.y1),
          lineWidth: el.width,
          lineColor: el.color,
          lineCap: 'butt',
        }
        if (dash) shape.dash = dash
        node = { canvas: [shape], absolutePosition: { x: mmToPt(el.x1), y: mmToPt(el.y1) } }
        break
      }
      case 'text':
        node = {
          columns: [{ width: mmToPt(el.w), text: resolve(el.content), ...textProps(el) }],
          absolutePosition: { x: mmToPt(el.x), y: mmToPt(el.y) },
        }
        break
      case 'address': {
        const g = ADDRESS_PRESETS[el.preset]
        const stack: Node[] = []
        if (el.returnAddress) {
          stack.push({ text: resolve(el.returnAddress), fontSize: 7, color: '#555555', decoration: 'underline', margin: [0, mmToPt(g.returnHeight) - 14, 0, 0] })
        }
        stack.push({ text: resolve(el.content), ...textProps(el), margin: [0, el.returnAddress ? 4 : mmToPt(g.returnHeight), 0, 0] })
        node = {
          columns: [{ width: mmToPt(g.w), stack }],
          absolutePosition: { x: mmToPt(g.x), y: mmToPt(g.y) },
        }
        break
      }
    }
    return node
    }
    if ((el.type === 'text' || el.type === 'address') && (usesPageTokens(el.content) || usesPageTokens(el.type === 'address' ? el.returnAddress : undefined))) {
      build({ page: 1, pages: 1 }) // dry run: reports missing values once
      result.push({ rule: el.pages, build })
    } else {
      result.push({ rule: el.pages, node: build() })
    }
  }
  return result
}

// ---- compile ---------------------------------------------------------------

/** Compiles a Layout and one Record per rendered letter into a pdfmake document definition. */
export function compile(layoutInput: Layout | LayoutInput | unknown, records: Data[], options: CompileOptions = {}): CompileResult {
  const warnings: Warning[] = []
  const seen = new Set<string>()
  const warn = (w: Warning) => {
    const key = `${w.code}:${w.message}`
    if (seen.has(key)) return
    seen.add(key)
    warnings.push(w)
    options.onWarning?.(w)
  }

  const layout = parseLayout(layoutInput)
  const ctx: FormatContext = { locale: layout.locale, currency: layout.currency }
  const dims = pageSizeMm(layout)
  const { margins, firstPageSpacer } = computeMargins(layout.page.contentBox.first, layout.page.contentBox.follow, warn)
  const fonts = collectFonts(layout)

  const hasLastRule = layout.static.some((e) => e.pages === 'last')
  const usesPageCount = layout.static.some((e) => (e.type === 'text' || e.type === 'address') && (PAGES_TOKEN.test(e.content) || (e.type === 'address' && PAGES_TOKEN.test(e.returnAddress ?? ''))))
  const needsPageMap = hasLastRule || usesPageCount || records.length > 1
  const pageMap = options.pageMap

  if (needsPageMap && !pageMap && !options.omitStatic) {
    warn({
      code: 'layout',
      message: 'Page rules "first"/"last" and per-record static text need a page map; use generate()/generateBatch() or pass options.pageMap',
    })
  }

  const recordAt = (page: number): { index: number; start: number; end: number | undefined } => {
    if (pageMap) {
      const index = pageMap.records.findIndex((r) => page >= r.start && page <= r.end)
      const found = pageMap.records[index < 0 ? 0 : index]
      if (found) return { index: Math.max(index, 0), start: found.start, end: found.end }
    }
    return { index: 0, start: 1, end: undefined }
  }

  const perRecordStatic = records.map((record) => staticNodes(layout, record, ctx, warn))
  if (records.length === 0) warn({ code: 'layout', message: 'No records given' })

  const content: Node[] = records.map((record, i) => ({
    stack: [
      { text: ' ', fontSize: 1, id: startMarkerId(i), margin: [0, firstPageSpacer, 0, 0] },
      ...buildFlow(layout, record, ctx, warn),
      { text: ' ', fontSize: 1, id: endMarkerId(i) },
    ],
    ...(i > 0 ? { pageBreak: 'before' } : {}),
  }))

  const images: Record<string, string> = {}
  for (const [key, asset] of Object.entries(layout.assets)) {
    if (!isSvgAsset(asset.data)) images[`asset:${key}`] = asset.data
  }

  const doc: DocDefinition = {
    pageSize: { width: mmToPt(dims.w), height: mmToPt(dims.h) },
    pageMargins: margins,
    defaultStyle: { font: layout.page.defaults.font, fontSize: layout.page.defaults.size, color: layout.page.defaults.color, lineHeight: 1.15 },
    images,
    content,
  }

  if (!options.omitStatic && layout.static.length > 0) {
    doc.background = (currentPage: number) => {
      const rec = recordAt(currentPage)
      const isFirst = currentPage === rec.start
      const isLast = rec.end !== undefined && currentPage === rec.end
      const counters: PageCounters = { page: currentPage - rec.start + 1, pages: rec.end !== undefined ? rec.end - rec.start + 1 : currentPage }
      const nodes = (perRecordStatic[rec.index] ?? []).filter((s) => pageRuleMatches(s.rule, isFirst, isLast)).map((s) => s.node ?? s.build!(counters))
      return nodes.length ? { stack: nodes } : null
    }
  }

  return { docDefinition: doc, warnings, fonts, needsPageMap }
}

/** Escape hatch: the pdfmake document definition for one record. */
export function toDocDefinition(layout: Layout | LayoutInput | unknown, data: Data, options: CompileOptions = {}): DocDefinition {
  return compile(layout, [data], options).docDefinition
}

/// <reference path="./pdfmake.d.ts" />
import { compile, collectFonts, endMarkerId, startMarkerId, type DocDefinition, type PageMap } from './compile'
import { buildPdfmakeFonts, ROBOTO_FILES, type FontRegistry, type PdfmakeFonts } from './fonts'
import { parseLayout } from './layout'
import type { Data, Warning } from './placeholders'
import type { Layout, LayoutInput } from './schema'

export type PdfAProfile = 'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'

export interface Attachment {
  filename: string
  data: Uint8Array | string
  mimeType?: string
  description?: string
  relationship?: 'Data' | 'Source' | 'Supplement' | 'Alternative' | 'Unspecified'
}

export interface GenerateOptions {
  /** The Host App's fonts: URLs in the browser, file paths in Node. Roboto is always available. */
  fonts?: FontRegistry
  pdfa?: PdfAProfile
  attachments?: Attachment[]
  onWarning?: (w: Warning) => void
  /** Document metadata. */
  info?: { title?: string; author?: string; subject?: string }
}

export interface BatchOptions extends GenerateOptions {
  /** Fail (or warn, see `overflow`) when a record needs more than one page. */
  onePagePerRecord?: boolean
  overflow?: 'error' | 'warn'
}

export class RecordOverflowError extends Error {
  constructor(
    readonly record: number,
    readonly pages: number,
  ) {
    super(`Record ${record} needs ${pages} pages but onePagePerRecord is set`)
    this.name = 'RecordOverflowError'
  }
}

type PdfMake = typeof import('pdfmake').default

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

let pdfmakePromise: Promise<PdfMake> | undefined
let robotoRegistered = false

async function loadPdfMake(): Promise<PdfMake> {
  pdfmakePromise ??= import('pdfmake').then((m) => ((m as { default?: PdfMake }).default ?? (m as unknown as PdfMake)))
  const pdfmake = await pdfmakePromise
  if (!robotoRegistered) {
    const { ROBOTO_BASE64 } = await import('./fonts/roboto-data')
    for (const style of Object.keys(ROBOTO_FILES) as (keyof typeof ROBOTO_FILES)[]) {
      pdfmake.virtualfs.writeFileSync(ROBOTO_FILES[style], ROBOTO_BASE64[style], 'base64')
    }
    robotoRegistered = true
  }
  return pdfmake
}

function toBase64(data: Uint8Array | string): string {
  if (typeof data === 'string') {
    const bytes = new TextEncoder().encode(data)
    return toBase64(bytes)
  }
  let binary = ''
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Browsers need absolute font URLs; Node keeps file paths and absolute URLs as they are. */
function absolutize(file: string): string {
  if (!isBrowser || /^[a-z][a-z0-9+.-]*:/i.test(file)) return file
  return new URL(file, document.baseURI).href
}

async function renderPdf(pdfmake: PdfMake, doc: DocDefinition, fonts: PdfmakeFonts, registry: FontRegistry, options: GenerateOptions): Promise<Uint8Array> {
  const allowed = new Set<string>()
  const table: Record<string, unknown> = {}
  for (const [family, files] of Object.entries(fonts)) {
    const resolved: Record<string, string> = {}
    for (const [style, file] of Object.entries(files)) {
      const isBundled = (Object.values(ROBOTO_FILES) as string[]).includes(file)
      const path = isBundled ? file : absolutize(file)
      if (!isBundled) allowed.add(path)
      resolved[style] = path
    }
    table[family] = resolved
  }
  void registry

  const pdfDoc: DocDefinition = { ...doc }
  if (options.pdfa) {
    pdfDoc.version = options.pdfa === 'PDF/A-1b' ? '1.4' : '1.7'
    pdfDoc.subset = options.pdfa
    pdfDoc.tagged = true
    pdfDoc.displayTitle = true
  }
  if (options.info) pdfDoc.info = { ...options.info }
  if (options.attachments?.length) {
    pdfDoc.files = {}
    options.attachments.forEach((a, i) => {
      const vfsName = `pdf-layouter-attachment-${i}-${a.filename}`
      pdfmake.virtualfs.writeFileSync(vfsName, toBase64(a.data), 'base64')
      pdfDoc.files[a.filename] = {
        src: vfsName,
        name: a.filename,
        description: a.description,
        mimeType: a.mimeType ?? 'application/octet-stream',
        relationship: a.relationship ?? 'Alternative',
      }
    })
  }

  // pdfmake reads fonts and policies synchronously inside createPdf, so setting them right before is safe.
  pdfmake.setFonts(table)
  pdfmake.setUrlAccessPolicy((url) => allowed.has(url))
  pdfmake.setLocalAccessPolicy?.((path) => allowed.has(path))
  const bytes = await pdfmake.createPdf(pdfDoc).getBuffer()
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** Lays the document out once and reads the page span of every record from the marker nodes. */
async function measure(pdfmake: PdfMake, layout: Layout, records: Data[], fonts: PdfmakeFonts, registry: FontRegistry, options: GenerateOptions): Promise<PageMap> {
  const { docDefinition } = compile(layout, records, { omitStatic: true, onWarning: () => {} })
  const pages: Record<string, number> = {}
  docDefinition.pageBreakBefore = (node: { id?: string; startPosition: { pageNumber: number } }) => {
    if (node.id?.startsWith('plr-')) pages[node.id] = node.startPosition.pageNumber
    return false
  }
  await renderPdf(pdfmake, docDefinition, fonts, registry, { fonts: options.fonts })
  return {
    records: records.map((_, i) => {
      const start = pages[startMarkerId(i)]
      const end = pages[endMarkerId(i)]
      if (start === undefined || end === undefined) throw new Error(`Could not determine the pages of record ${i}`)
      return { start, end }
    }),
  }
}

async function run(layoutInput: Layout | LayoutInput | unknown, records: Data[], options: BatchOptions): Promise<Uint8Array> {
  const layout = parseLayout(layoutInput)
  const warn = options.onWarning ?? (() => {})
  const registry = options.fonts ?? []
  const fonts = buildPdfmakeFonts(collectFonts(layout), registry, warn)
  const pdfmake = await loadPdfMake()

  const probe = compile(layout, records, { omitStatic: true, onWarning: () => {} })
  let pageMap: PageMap | undefined
  if (probe.needsPageMap || options.onePagePerRecord) {
    pageMap = await measure(pdfmake, layout, records, fonts, registry, options)
    if (options.onePagePerRecord) {
      pageMap.records.forEach((r, i) => {
        const count = r.end - r.start + 1
        if (count <= 1) return
        if (options.overflow === 'warn') warn({ code: 'overflow', message: `Record ${i} needs ${count} pages` })
        else throw new RecordOverflowError(i, count)
      })
    }
  }

  const { docDefinition } = compile(layout, records, { pageMap, onWarning: warn })
  return renderPdf(pdfmake, docDefinition, fonts, registry, options)
}

/** Use case 1: one document from one data object. */
export function generate(layout: Layout | LayoutInput | unknown, data: Data, options: GenerateOptions = {}): Promise<Uint8Array> {
  return run(layout, [data], options)
}

/** Use case 2: one PDF containing the layout once per record, each record starting on a new page. */
export function generateBatch(layout: Layout | LayoutInput | unknown, records: Data[], options: BatchOptions = {}): Promise<Uint8Array> {
  if (records.length === 0) return Promise.reject(new Error('generateBatch needs at least one record'))
  return run(layout, records, options)
}

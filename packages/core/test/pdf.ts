import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfPage {
  text: string
  items: { str: string; x: number; y: number }[]
  images: number
  /** Fill and stroke colours used on the page, as #rrggbb. */
  colors: string[]
}

export interface PdfInfo {
  numPages: number
  pages: PdfPage[]
  raw: string
}

/** Parses a PDF into per-page text (with positions in pt, origin bottom-left) and image counts. */
export async function readPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 }).promise
  const pages: PdfPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim() !== '')
      .map((it) => ({ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number }))
    const ops = await page.getOperatorList()
    const imageOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject].filter((n) => n !== undefined))
    const colors: string[] = []
    ops.fnArray.forEach((fn: number, k: number) => {
      if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
        const raw = ops.argsArray[k] as ArrayLike<number> | string
        const first = typeof raw === 'string' ? raw : (raw as ArrayLike<unknown>)[0]
        colors.push(typeof first === 'string' ? first.toLowerCase() : '#' + Array.from(raw as ArrayLike<number>).map((n) => Math.round(n).toString(16).padStart(2, '0')).join(''))
      }
    })
    pages.push({ text: items.map((it) => it.str).join(' '), items, images: ops.fnArray.filter((fn: number) => imageOps.has(fn)).length, colors })
  }
  return { numPages: doc.numPages, pages, raw: Buffer.from(bytes).toString('latin1') }
}

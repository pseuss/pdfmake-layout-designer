import type { Warning } from './placeholders'

export interface FontFiles {
  normal: string
  bold?: string
  italics?: string
  bolditalics?: string
}

export interface FontFamily {
  family: string
  /** URLs in the browser, file paths in Node. */
  files: FontFiles
}

export type FontRegistry = FontFamily[]

export const FALLBACK_FONT = 'Roboto'

/** Virtual file names under which the bundled Roboto is registered with pdfmake. */
export const ROBOTO_FILES: Required<FontFiles> = {
  normal: 'pdf-layouter-Roboto-Regular.ttf',
  bold: 'pdf-layouter-Roboto-Medium.ttf',
  italics: 'pdf-layouter-Roboto-Italic.ttf',
  bolditalics: 'pdf-layouter-Roboto-MediumItalic.ttf',
}

export type PdfmakeFonts = Record<string, Required<FontFiles>>

/** Fills missing styles: bold/italics fall back to normal, bolditalics to bold, italics, then normal. */
export function completeFontFiles(files: FontFiles): Required<FontFiles> {
  const bold = files.bold ?? files.normal
  const italics = files.italics ?? files.normal
  return { normal: files.normal, bold, italics, bolditalics: files.bolditalics ?? (files.bold ?? files.italics ?? files.normal) }
}

/** Builds the pdfmake font table for the families a Layout uses; unknown families get the bundled Roboto (with a warning). */
export function buildPdfmakeFonts(
  families: string[],
  registry: FontRegistry = [],
  warn: (w: Warning) => void = () => {},
): PdfmakeFonts {
  const fonts: PdfmakeFonts = { [FALLBACK_FONT]: { ...ROBOTO_FILES } }
  for (const family of new Set(families)) {
    if (family === FALLBACK_FONT) continue
    const entry = registry.find((f) => f.family === family)
    if (!entry) {
      warn({ code: 'unknown-font', message: `Font "${family}" is not in the font registry; using ${FALLBACK_FONT}` })
      fonts[family] = { ...ROBOTO_FILES }
      continue
    }
    fonts[family] = completeFontFiles(entry.files)
  }
  return fonts
}

/** The bundled Roboto as base64 per style, for UIs that want to display the Fallback Font. */
export async function loadRobotoData(): Promise<Record<keyof typeof ROBOTO_FILES, string>> {
  const { ROBOTO_BASE64 } = await import('./fonts/roboto-data')
  return ROBOTO_BASE64
}

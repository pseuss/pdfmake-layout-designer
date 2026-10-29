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

/** One font declaration for Designer and Generator: file names relative to a base that differs per side. */
export interface FontDefinition {
  readonly families: readonly FontFamily[]
  /** The registry with every file resolved against `base`: a URL prefix in the browser (`/fonts`), a directory on the server. */
  at(base: string): FontRegistry
}

/**
 * Declares the Host App's fonts once, with file names:
 * `defineFonts([{ family: 'Inter', files: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' } }])`.
 * Then `fonts.at('/fonts')` is what the Designer gets in the browser and `fonts.at(dir)` what `generate()` gets on the server.
 */
export function defineFonts(families: readonly FontFamily[]): FontDefinition {
  const join = (base: string, file: string) => (/^([a-z][a-z0-9+.-]*:|\/)/i.test(file) ? file : `${base.replace(/[\\/]+$/, '')}/${file}`)
  return {
    families,
    at: (base) =>
      families.map((f) => ({
        family: f.family,
        files: Object.fromEntries(Object.entries(f.files).map(([style, file]) => [style, join(base, file as string)])) as unknown as FontFiles,
      })),
  }
}

export const FALLBACK_FONT = 'Roboto'

/** Virtual file names under which the bundled Roboto is registered with pdfmake. */
export const ROBOTO_FILES: Required<FontFiles> = {
  normal: 'pdfmake-layout-designer-Roboto-Regular.ttf',
  bold: 'pdfmake-layout-designer-Roboto-Medium.ttf',
  italics: 'pdfmake-layout-designer-Roboto-Italic.ttf',
  bolditalics: 'pdfmake-layout-designer-Roboto-MediumItalic.ttf',
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

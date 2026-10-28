import { FALLBACK_FONT, loadRobotoData, type FontRegistry } from '@pdf-layouter/core'

const STYLES = [
  ['normal', { weight: '400', style: 'normal' }],
  ['bold', { weight: '700', style: 'normal' }],
  ['italics', { weight: '400', style: 'italic' }],
  ['bolditalics', { weight: '700', style: 'italic' }],
] as const

function register(doc: Document, family: string, source: string, descriptors: { weight: string; style: string }): Promise<void> {
  const fonts = doc.fonts
  if (!fonts || typeof FontFace === 'undefined') return Promise.resolve()
  const face = new FontFace(family, source, descriptors)
  return face
    .load()
    .then((loaded) => {
      fonts.add(loaded)
    })
    .catch((error: unknown) => {
      console.warn(`[pdf-layouter] Could not load font "${family}" (${source.slice(0, 80)}):`, error)
    })
}

/** Makes the Host App's fonts (and the bundled Roboto) available to the canvas through the FontFace API. */
export async function loadCanvasFonts(registry: FontRegistry, doc: Document = document): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const family of registry) {
    for (const [style, descriptors] of STYLES) {
      const file = family.files[style]
      if (file) jobs.push(register(doc, family.family, `url("${file}")`, descriptors))
    }
  }
  if (!registry.some((f) => f.family === FALLBACK_FONT)) {
    const data = await loadRobotoData()
    for (const [style, descriptors] of STYLES) jobs.push(register(doc, FALLBACK_FONT, `url(data:font/ttf;base64,${data[style]})`, descriptors))
  }
  await Promise.all(jobs)
}

export function cssFontFamily(family: string): string {
  return `'${family.replace(/'/g, '')}', ${FALLBACK_FONT}, sans-serif`
}

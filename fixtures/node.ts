// Node-only fixture helpers: reads the generated assets and the downloaded Google Fonts from disk.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FontRegistry } from '@pdf-layouter/core'
import type { FixtureAssets } from './data'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export function loadAssets(): FixtureAssets {
  return {
    background: `data:image/jpeg;base64,${readFileSync(here('./assets/briefpapier.jpg')).toString('base64')}`,
    logo: `data:image/png;base64,${readFileSync(here('./assets/logo.png')).toString('base64')}`,
    logoSvg: readFileSync(here('./assets/logo.svg'), 'utf8'),
  }
}

export function nodeFontRegistry(): FontRegistry {
  const f = (name: string) => here(`./fonts/${name}.ttf`)
  return [
    { family: 'Inter', files: { normal: f('Inter-Regular'), bold: f('Inter-Bold'), italics: f('Inter-Italic'), bolditalics: f('Inter-BoldItalic') } },
    { family: 'Merriweather', files: { normal: f('Merriweather-Regular'), bold: f('Merriweather-Bold'), italics: f('Merriweather-Italic'), bolditalics: f('Merriweather-BoldItalic') } },
  ]
}

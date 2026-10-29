import * as core from 'pdfmake-layout-designer-core'
import { Designer } from 'pdfmake-layout-designer'
import { browserFontRegistry, invoiceData, invoiceLayout, placeholderCatalog, serialLayout, serialRecords } from '../../fixtures/data'

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

const assets = {
  background: await toDataUrl('/assets/briefpapier.jpg'),
  logo: await toDataUrl('/assets/logo.png'),
  logoSvg: await (await fetch('/assets/logo.svg')).text(),
}
const fonts = browserFontRegistry()
const params = new URLSearchParams(location.search)
const changes: core.Layout[] = []

const start = params.get('layout')
const layout = start === 'empty' ? { schemaVersion: 1 as const } : start === 'new' ? undefined : start === 'serial' ? serialLayout(assets) : invoiceLayout(assets)
const data = start === 'serial' ? serialRecords(1)[0]! : invoiceData(params.has('rows') ? Number(params.get('rows')) : 70)

const designer = new Designer({
  container: document.getElementById('app')!,
  layout,
  placeholders: placeholderCatalog,
  sampleData: data,
  fonts,
  locale: params.get('locale') === 'en' ? 'en' : 'de',
  theme: (params.get('theme') as 'light' | 'dark' | 'auto' | null) ?? undefined,
  primaryColor: params.get('primary') ?? undefined,
  onChange: (l) => changes.push(l),
})

Object.assign(window, { __app: { designer, core, changes, fonts, assets, data, invoiceData, serialRecords, serialLayout, invoiceLayout } })
document.documentElement.dataset.ready = 'true'

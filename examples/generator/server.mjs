// Framework-free variant of the generator example: plain Node, no Next or Nuxt.
//   GET /api/invoices | /api/customers       rows of the database (JSON)
//   GET /api/invoices/:id.pdf | /api/invoices.pdf | /api/letters.pdf[?ids=1,2,3]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generate, generateBatch } from '@pdf-layouter/core'
import { createGeneratorService, NotFoundError, parseIds } from '../shared/generator/service.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// The Host App owns the fonts: here paths on the server (Roboto is bundled with the library)
const font = (name) => here(`../../fixtures/fonts/${name}.ttf`)
const fonts = ['Inter', 'Merriweather'].map((family) => ({
  family,
  files: { normal: font(`${family}-Regular`), bold: font(`${family}-Bold`), italics: font(`${family}-Italic`), bolditalics: font(`${family}-BoldItalic`) },
}))

const service = createGeneratorService({ dir: here('../shared/generator'), fonts, generate, generateBatch })

const send = (res, status, type, body, headers = {}) => {
  res.writeHead(status, { 'content-type': type, ...headers })
  res.end(body)
}
const json = (res, value, status = 200) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value))
const pdf = (res, { bytes, filename }) => send(res, 200, 'application/pdf', Buffer.from(bytes), { 'content-disposition': `inline; filename="${filename}"` })

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html; charset=utf-8', await readFile(here('./public/index.html')))
      if (url.pathname === '/api/customers') return json(res, await service.customers())
      if (url.pathname === '/api/invoices') return json(res, await service.invoices())
      const one = /^\/api\/invoices\/(\d+)\.pdf$/.exec(url.pathname)
      if (one) return pdf(res, await service.invoicePdf(one[1]))
      if (url.pathname === '/api/invoices.pdf') return pdf(res, await service.allInvoicesPdf())
      if (url.pathname === '/api/letters.pdf') return pdf(res, await service.lettersPdf(parseIds(url.searchParams.get('ids'))))
      json(res, { error: 'Not found' }, 404)
    } catch (error) {
      json(res, { error: error instanceof Error ? error.message : String(error) }, error instanceof NotFoundError ? 404 : 500)
    }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5303)
  createApp().listen(port, '0.0.0.0', () => console.log(`Generator example: http://localhost:${port}`))
}

import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readPdf } from '../../packages/core/test/pdf'
// @ts-expect-error plain JS module of the example app
import { createApp } from '../../examples/generator/server.mjs'

let base = ''
const app = createApp()

beforeAll(async () => {
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
})
afterAll(() => void app.close())

const pdf = async (path: string) => {
  const res = await fetch(base + path)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/pdf')
  return readPdf(new Uint8Array(await res.arrayBuffer()))
}

describe('generator example: data comes from the JSON "database", PDFs are made on the server', () => {
  it('lists invoices and customers from the database', async () => {
    expect(await (await fetch(`${base}/api/invoices`)).json()).toHaveLength(3)
    expect(await (await fetch(`${base}/api/customers`)).json()).toHaveLength(12)
  })

  it('renders one invoice with its ten positions, customer address and totals', async () => {
    const info = await pdf('/api/invoices/1.pdf')
    expect(info.numPages).toBe(1)
    const text = info.pages[0]!.text
    expect(text).toContain('Rechnung RE-2026-0101')
    expect(text).toContain('Anna Becker')
    expect(text).toContain('Support (Phase A)')
    expect(text.match(/Phase A/g)).toHaveLength(10)
    expect(text).toContain('Gesamt')
  })

  it('renders all invoices into one PDF, one page each', async () => {
    const info = await pdf('/api/invoices.pdf')
    expect(info.numPages).toBe(3)
    expect(info.pages.map((p) => /RE-2026-\d{4}/.exec(p.text)?.[0])).toEqual(['RE-2026-0101', 'RE-2026-0102', 'RE-2026-0103'])
    expect(info.pages[1]!.text).toContain('Jonas Krüger')
  })

  it('renders a personalised letter per customer in one PDF, with stationery and images', async () => {
    const info = await pdf('/api/letters.pdf')
    expect(info.numPages).toBe(12)
    for (const page of info.pages) {
      expect(page.text).toContain('Lorem ipsum')
      expect(page.text).toContain('Seite 1 von 1')
      expect(page.images).toBeGreaterThanOrEqual(2) // stationery + seal (the logo is SVG)
    }
    expect(info.pages[0]!.text).toContain('Anna Becker')
    expect(info.pages[11]!.text).toContain('Paul Braun')
  })

  it('renders only the selected customers', async () => {
    const info = await pdf('/api/letters.pdf?ids=3,5')
    expect(info.numPages).toBe(2)
    expect(info.pages[0]!.text).toContain('Mia Hoffmann')
    expect(info.pages[1]!.text).toContain('Emilia Wagner')
  })

  it('answers unknown invoices and empty selections with errors, not with a PDF', async () => {
    expect((await fetch(`${base}/api/invoices/99.pdf`)).status).toBe(404)
    expect((await fetch(`${base}/api/letters.pdf?ids=999`)).status).toBe(404)
  })
})

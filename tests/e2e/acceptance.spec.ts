import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { generate, generateBatch } from '@pdf-layouter/core'
import { invoiceData, serialRecords } from '../../fixtures/data'
import { nodeFontRegistry } from '../../fixtures/node'
import { readPdf } from '../../packages/core/test/pdf'
import { layout, open } from './helpers'

const asset = (name: string) => fileURLToPath(new URL(`../../fixtures/assets/${name}`, import.meta.url))

test('end to end: design an invoice in the Designer, store the JSON, generate the PDF in Node (A1, A4, A5, R1–R9)', async ({ page }) => {
  await open(page, 'layout=empty')

  // R1 + R2: stationery as full-page background, logo on top (images are uploaded like a user would)
  await page.getByTestId('file-input').setInputFiles(asset('briefpapier.jpg'))
  await expect.poll(async () => (await layout(page)).static.length).toBe(1)
  await page.getByTestId('x').fill('0')
  await page.getByTestId('y').fill('0')
  await page.getByTestId('w').fill('210')
  await page.getByTestId('h').fill('297')
  await page.getByTestId('pages').selectOption('first')
  await page.getByTestId('file-input').setInputFiles(asset('logo.png'))
  await expect.poll(async () => (await layout(page)).static.length).toBe(2)
  await page.getByTestId('x').fill('150')
  await page.getByTestId('y').fill('22')

  // R3: text box with placeholders, R4: line, R5: rectangle, DIN 5008 address field
  await page.getByTestId('add-text').click()
  await page.getByTestId('x').fill('125')
  await page.getByTestId('y').fill('55')
  await page.getByTestId('content').fill('Rechnung ')
  await page.getByTestId('content-picker-field').selectOption('rechnung.nummer')
  await page.getByTestId('content-picker-insert').click()
  await page.getByTestId('add-line').click()
  await page.getByTestId('add-rect').click()
  await page.getByTestId('pages').selectOption('notFirst')
  await page.getByTestId('add-address').click()
  await page.getByTestId('content').fill('{{kunde.name}}\n{{kunde.strasse}}\n{{kunde.plz}} {{kunde.ort}}')

  // content box for page 1 below the letterhead, shorter on follow-up pages
  await page.getByTestId('tab-page').click()
  await page.getByTestId('page-first-top').fill('95')
  await page.getByTestId('page-follow-top').fill('30')
  await page.getByTestId('footer').fill('Seite {{page}} von {{pages}}')

  // flow: intro text, two tables (R6, R8), totals (R7), dynamic sections (R9)
  await page.getByTestId('add-flow-text').click()
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Sehr geehrte Damen und Herren, ')
  await page.getByTestId('flow-picker-field').selectOption('baustein.einleitung')
  await page.getByTestId('flow-picker-insert').click()
  await page.getByTestId('add-table').click()
  await page.getByTestId('add-table').click()
  await page.getByTestId('source').selectOption('reisekosten')
  for (const i of [3, 2, 1, 0]) if (i > 1) await page.getByTestId(`col-${i}-remove`).click().catch(() => undefined)
  await page.getByTestId('add-totals').click()
  await page.getByTestId('row-0-value').click()
  await page.getByTestId('totals-picker-field').selectOption('summen.netto')
  await page.getByTestId('totals-picker-insert').click()
  await page.getByTestId('row-1-value').click()
  await page.getByTestId('totals-picker-field').selectOption('summen.ust19')
  await page.getByTestId('totals-picker-insert').click()
  await page.getByTestId('row-2-value').click()
  await page.getByTestId('totals-picker-field').selectOption('summen.brutto')
  await page.getByTestId('totals-picker-insert').click()
  await page.getByTestId('add-dynamic').click()

  // A4: the Host App stores exactly this JSON; here it travels through JSON like a database column would
  const stored = JSON.parse(JSON.stringify(await layout(page)))
  expect(stored.schemaVersion).toBe(1)
  expect(Object.keys(stored.assets)).toHaveLength(2)
  expect(Object.keys(stored)).toEqual(expect.arrayContaining(['locale', 'currency', 'page', 'assets', 'static', 'flow']))

  // A2 + A5: generate from the stored JSON on the "server" with data from the Host App
  const data = invoiceData(40)
  const pdf = await generate(stored, data, { fonts: nodeFontRegistry() })
  const info = await readPdf(pdf)
  const text = info.pages.map((p) => p.text).join(' ')
  expect(info.numPages).toBeGreaterThanOrEqual(2)
  expect(info.pages[0]!.text).toContain('Rechnung RE-2026-0042')
  expect(info.pages[0]!.text).toContain('Muster GmbH')
  expect(info.pages[0]!.images).toBe(2) // background + logo
  expect(text).toContain('vielen Dank für Ihren Auftrag')
  expect(text).toContain('Bahnfahrt München – Berlin')
  expect(text).toContain('Leistungszeitraum Oktober 2026')
  expect(text).toContain('Hotel 264,00')
  expect(text.replace(/ /g, ' ')).toContain((data.summen as { brutto: number }).brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 }))
  expect(info.pages.at(-1)!.text).toMatch(new RegExp(`Seite ${info.numPages} von ${info.numPages}`))
})

test('end to end: form letters (S1–S3) from a layout designed in the Designer', async ({ page }) => {
  await open(page, 'layout=empty')
  await page.getByTestId('file-input').setInputFiles(asset('logo.svg'))
  await expect.poll(async () => (await layout(page)).static.length).toBe(1)
  await page.getByTestId('pages').selectOption('first')
  await page.getByTestId('add-address').click()
  await page.getByTestId('content').fill('{{empfaenger.name}}\n{{empfaenger.strasse}}\n{{empfaenger.plz}} {{empfaenger.ort}}')
  await page.getByTestId('add-flow-text').click()
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Liebe Gäste, wir laden Sie ein: {{brief.betreff}}')
  const stored = JSON.parse(JSON.stringify(await layout(page)))

  const records = serialRecords(25)
  const pdf = await generateBatch(stored, records, { onePagePerRecord: true })
  const info = await readPdf(pdf)
  expect(info.numPages).toBe(25)
  info.pages.forEach((p, i) => {
    expect(p.text).toContain(`Nummer ${String(i + 1).padStart(2, '0')} Müller`)
    expect(p.text).toContain(`Einladung Nr. ${i + 1}`)
  })
})

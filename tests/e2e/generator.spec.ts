import { expect, test, type Page } from '@playwright/test'
import { readPdf } from '../../packages/core/test/pdf'

// The generator example in three flavours: vanilla (PDFs made in the browser, project "chromium"),
// Next.js and Nuxt (PDFs made on the server, projects "next" and "nuxt"). Same data, same Layouts, same page.
const path = (project: string) => (project === 'chromium' ? '/generator.html' : '/generator')

/** Clicks a button and returns the PDF that appears in the preview frame. */
async function pdfFrom(page: Page, click: () => Promise<void>) {
  const before = await page.getByTestId('preview').getAttribute('src')
  await click()
  await page.waitForFunction((prev) => {
    const src = document.querySelector('[data-testid=preview]')?.getAttribute('src')
    return !!src && src.startsWith('blob:') && src !== prev
  }, before, { timeout: 30_000 })
  const src = (await page.getByTestId('preview').getAttribute('src'))!
  const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), src)
  return readPdf(new Uint8Array(bytes))
}

test.beforeEach(async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(path(info.project.name))
  await expect(page.getByTestId('invoice-1')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('customers').locator('input')).toHaveCount(12)
  expect(errors).toEqual([])
})

test('an invoice is generated from the database rows: customer, ten positions, totals', async ({ page }) => {
  const info = await pdfFrom(page, () => page.getByTestId('invoice-1').click())
  expect(info.numPages).toBe(1)
  const text = info.pages[0]!.text
  expect(text).toContain('Rechnung RE-2026-0101')
  expect(text).toContain('Anna Becker')
  expect(text.match(/Phase A/g)).toHaveLength(10)
  expect(text).toContain('Gesamt')
})

test('all invoices end up in one PDF, one page each', async ({ page }) => {
  const info = await pdfFrom(page, () => page.getByTestId('all-invoices').click())
  expect(info.numPages).toBe(3)
  expect(info.pages[2]!.text).toContain('RE-2026-0103')
})

test('form letters: one personalised letter per customer in a single PDF, with images', async ({ page }) => {
  const info = await pdfFrom(page, () => page.getByTestId('letters').click())
  expect(info.numPages).toBe(12)
  expect(info.pages[0]!.text).toContain('Anna Becker')
  expect(info.pages[11]!.text).toContain('Paul Braun')
  for (const p of info.pages) {
    expect(p.text).toContain('Lorem ipsum')
    expect(p.images).toBeGreaterThanOrEqual(2)
  }
})

test('only the checked customers get a letter', async ({ page }) => {
  const boxes = page.getByTestId('customers').locator('input')
  for (let i = 0; i < 12; i++) if (![2, 4].includes(i)) await boxes.nth(i).uncheck()
  const info = await pdfFrom(page, () => page.getByTestId('letters').click())
  expect(info.numPages).toBe(2)
  expect(info.pages[0]!.text).toContain('Mia Hoffmann')
  expect(info.pages[1]!.text).toContain('Emilia Wagner')
})

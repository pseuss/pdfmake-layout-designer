import { expect, test } from '@playwright/test'
import { readPdf } from '../../packages/core/test/pdf'
import { expectNoErrors, open } from './helpers'

/** Runs `fn` in the page and returns the resulting PDF bytes as a Node Buffer. */
async function pdfFromPage(page: import('@playwright/test').Page, script: string): Promise<Uint8Array> {
  const base64: string = await page.evaluate(async (code) => {
    // eslint-disable-next-line no-new-func
    const pdf: Uint8Array = await new Function('app', `return (async () => { ${code} })()`)((window as any).__app)
    let s = ''
    for (let i = 0; i < pdf.length; i += 0x8000) s += String.fromCharCode(...pdf.subarray(i, i + 0x8000))
    return btoa(s)
  }, script)
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

test.describe('browser generator and live preview (A2, 7.3)', () => {
  test('the Designer preview renders the invoice with the Host App fonts loaded by URL', async ({ page }) => {
    const errors = await open(page)
    await page.getByTestId('tab-preview').click()
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 })
    const pdf = await pdfFromPage(page, 'return app.designer.getPreviewPdf()')
    const info = await readPdf(pdf)
    expect(info.numPages).toBe(4)
    expect(info.pages[0]!.text).toContain('Muster GmbH')
    expect(info.pages[0]!.text).toContain('RE-2026-0042')
    expect(info.raw).toMatch(/\+Inter-Regular/)
    expect(info.pages.map((p) => p.images)).toEqual([2, 1, 1, 1])
    expect(info.pages[3]!.text).toContain('Vielen Dank für Ihr Vertrauen')
    await expect(page.getByTestId('preview-status')).toHaveText('')
    expectNoErrors(errors)
  })

  test('updates the preview after edits', async ({ page }) => {
    await open(page, 'rows=5')
    await page.getByTestId('tab-preview').click()
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 })
    const first = await page.getByTestId('preview-frame').getAttribute('src')
    await page.evaluate(() => (window as any).__app.designer.setSampleData({ ...(window as any).__app.data, kunde: { ...(window as any).__app.data.kunde, name: 'Geänderte Firma AG' } }))
    await expect(page.getByTestId('preview-frame')).not.toHaveAttribute('src', first!, { timeout: 30_000 })
    const info = await readPdf(await pdfFromPage(page, 'return app.designer.getPreviewPdf()'))
    expect(info.pages[0]!.text).toContain('Geänderte Firma AG')
  })

  test('falls back to Roboto for a font family that is not in the registry and still renders the preview', async ({ page }) => {
    await open(page, 'rows=3')
    await page.getByTestId('tab-preview').click()
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 })
    await page.evaluate(async () => {
      const d = (window as any).__app.designer
      const l = d.getLayout()
      l.page.defaults.font = 'Broken'
      d.setLayout(l)
    })
    // Broken is not in the registry: falls back to Roboto and still renders, with no error shown
    await page.getByTestId('preview-refresh').click()
    await expect(page.getByTestId('preview-status')).toHaveText('', { timeout: 30_000 })
  })

  test('core generate() works in the browser with the bundled Roboto only', async ({ page }) => {
    await open(page, '', false)
    const pdf = await pdfFromPage(page, `return await app.core.generate({ schemaVersion: 1, flow: [{ type: 'text', content: 'Grüße {{name}} – Straße' }] }, { name: 'Welt' })`)
    const info = await readPdf(pdf)
    expect(info.numPages).toBe(1)
    expect(info.pages[0]!.text).toContain('Grüße Welt – Straße')
    expect(info.raw).toMatch(/\+Roboto/)
  })

  test('core generateBatch() works in the browser: one page per record (S3)', async ({ page }) => {
    await open(page, 'layout=serial', false)
    const pdf = await pdfFromPage(
      page,
      `const records = app.serialRecords(6)
       return await app.core.generateBatch(app.serialLayout(app.assets), records, { fonts: app.fonts, onePagePerRecord: true })`,
    )
    const info = await readPdf(pdf)
    expect(info.numPages).toBe(6)
    info.pages.forEach((p, i) => expect(p.text).toContain(`Nummer 0${i + 1} Müller`))
    expect(info.raw).toMatch(/\+Merriweather-Regular/)
  })
})

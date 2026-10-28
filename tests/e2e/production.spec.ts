import { expect, test } from '@playwright/test'
import { readPdf } from '../../packages/core/test/pdf'
import { expectNoErrors, layout, open } from './helpers'

test('the production bundle runs the Designer and generates PDFs in the browser', async ({ page }) => {
  const errors = await open(page, 'rows=30')
  await page.getByTestId('add-rect').click()
  expect((await layout(page)).static.at(-1)!.type).toBe('rect')
  const base64: string = await page.evaluate(async () => {
    const pdf: Uint8Array = (await (window as any).__app.designer.refreshPreview())!
    let s = ''
    for (let i = 0; i < pdf.length; i += 0x8000) s += String.fromCharCode(...pdf.subarray(i, i + 0x8000))
    return btoa(s)
  })
  const info = await readPdf(new Uint8Array(Buffer.from(base64, 'base64')))
  expect(info.numPages).toBeGreaterThanOrEqual(2)
  expect(info.pages[0]!.text).toContain('RE-2026-0042')
  expect(info.raw).toMatch(/\+Inter-Regular/)
  // rich text editor (Tiptap) works in the bundle
  await page.getByTestId('add-flow-text').click()
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('x')
  expectNoErrors(errors)
})

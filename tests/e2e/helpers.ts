import { expect, type Locator, type Page } from '@playwright/test'
import type { Layout } from 'pdfmake-layout-designer-core'

export async function open(page: Page, query = '', fit = true): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`/${query ? `?${query}` : ''}`)
  await page.waitForSelector('html[data-ready=true]')
  await page.evaluate(() => (window as any).__app.designer.ready)
  if (fit) await page.getByTestId('zoom-fit').click()
  return errors
}

export const layout = (page: Page): Promise<Layout> => page.evaluate(() => (window as any).__app.designer.getLayout())
export const changeCount = (page: Page): Promise<number> => page.evaluate(() => (window as any).__app.changes.length)

export async function scale(page: Page): Promise<number> {
  return Number(await page.getByTestId('page').getAttribute('data-scale'))
}

/** Drags a locator's centre by (dxMm, dyMm) on the page canvas. */
export async function dragBy(page: Page, target: Locator, dxMm: number, dyMm: number, at: 'center' | 'topleft' = 'center'): Promise<void> {
  const k = await scale(page)
  const box = (await target.boundingBox())!
  const x = at === 'center' ? box.x + box.width / 2 : box.x + 4
  const y = at === 'center' ? box.y + box.height / 2 : box.y + 4
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + (dxMm * k) / 2, y + (dyMm * k) / 2, { steps: 4 })
  await page.mouse.move(x + dxMm * k, y + dyMm * k, { steps: 4 })
  await page.mouse.up()
}

export function bytesToBase64Script() {
  return (pdf: Uint8Array | undefined) => {
    if (!pdf) return ''
    let s = ''
    for (let i = 0; i < pdf.length; i += 0x8000) s += String.fromCharCode(...pdf.subarray(i, i + 0x8000))
    return btoa(s)
  }
}

export function expectNoErrors(errors: string[]): void {
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([])
}

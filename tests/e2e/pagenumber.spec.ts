import { expect, test } from '@playwright/test'
import { generate } from 'pdfmake-layout-designer-core'
import { readPdf } from '../../packages/core/test/pdf'
import { dragBy, layout, open } from './helpers'

const PAGE_H = 841.89
const topMm = (y: number) => ((PAGE_H - y) / 72) * 25.4
const leftMm = (x: number) => (x / 72) * 25.4
const pn = async (page: import('@playwright/test').Page, id = 'pagenumber') => (await layout(page)).static.find((e) => e.id === id) as { x: number; y: number; w: number; content: string; align: string; font?: string; size?: number } | undefined

test.describe('page number element ("Seite x von y")', () => {
  test('a new Designer starts with it in place, as an ordinary element', async ({ page }) => {
    await open(page, 'layout=new')
    const el = (await pn(page))!
    expect(el).toMatchObject({ content: 'Seite {{page}} von {{pages}}', align: 'right', x: 20, w: 170 })
    await expect(page.locator('[data-id=pagenumber]')).toContainText('Seite 1 von 1')
    await page.locator('[data-id=pagenumber]').click()
    await expect(page.getByTestId('panel-title')).toContainText('pagenumber')
    // an explicit empty layout stays empty
    await open(page, 'layout=empty')
    expect((await layout(page)).static).toEqual([])
  })

  test('can be moved, resized, restyled and given another text with the two variables', async ({ page }) => {
    await open(page, 'layout=new')
    await page.locator('[data-id=pagenumber]').click()
    await dragBy(page, page.locator('[data-id=pagenumber]'), -10, -20)
    const moved = (await pn(page))!
    expect(moved.x).toBe(10)
    expect(moved.y).toBe(250) // 250.5 snapped to the 2.5 mm grid

    await page.getByTestId('content').fill('Blatt ')
    await page.getByTestId('content-picker-page').click()
    await page.getByTestId('content').pressSequentially(' / ')
    await page.getByTestId('content-picker-pages').click()
    await page.getByTestId('align').selectOption('center')
    await page.getByTestId('size').fill('12')
    await page.getByTestId('font').selectOption('Merriweather')
    await page.getByTestId('pages').selectOption('notFirst')
    expect(await pn(page)).toMatchObject({ content: 'Blatt {{page}} / {{pages}}', align: 'center', size: 12, font: 'Merriweather' })
    await expect(page.locator('[data-id=pagenumber]')).toContainText('Blatt 1 / 1')
  })

  test('can be deleted and added again from the toolbar; several are allowed', async ({ page }) => {
    await open(page, 'layout=new')
    await page.locator('[data-id=pagenumber]').click()
    await page.getByTestId('action-delete').click()
    expect(await pn(page)).toBeUndefined()
    await page.getByTestId('add-pagenumber').click()
    expect(await pn(page, 'pagenumber_1')).toMatchObject({ content: 'Seite {{page}} von {{pages}}', size: 8, align: 'right' })
    await page.getByTestId('add-pagenumber').click()
    expect((await layout(page)).static.map((e) => e.id)).toEqual(['pagenumber_1', 'pagenumber_2'])
  })

  test('the generated PDF numbers the pages where the element was put and with the chosen text', async ({ page }) => {
    await open(page, 'layout=new')
    await page.locator('[data-id=pagenumber]').click()
    await page.getByTestId('x').fill('100')
    await page.getByTestId('y').fill('20')
    await page.getByTestId('w').fill('80')
    await page.getByTestId('align').selectOption('left')
    await page.getByTestId('content').fill('Nr. {{page}} von {{pages}}')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('{{body}}')
    const stored = JSON.parse(JSON.stringify(await layout(page)))

    const info = await readPdf(await generate(stored, { body: Array.from({ length: 80 }, (_, i) => `Absatz ${i}`).join('\n\n') }))
    expect(info.numPages).toBeGreaterThan(1)
    info.pages.forEach((p, i) => {
      expect(p.text).toContain(`Nr. ${i + 1} von ${info.numPages}`)
      const item = p.items.find((it) => it.str.startsWith('Nr.'))!
      expect(topMm(item.y)).toBeLessThan(30)
      expect(leftMm(item.x)).toBeGreaterThan(99)
    })
  })

  test('layouts saved with the old fixed footer open as a normal element', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.evaluate(() => (window as any).__app.designer.setLayout({ schemaVersion: 1, page: { footer: { content: 'Blatt {{page}}', align: 'center' } } }))
    const el = (await pn(page, 'footer'))!
    expect(el).toMatchObject({ content: 'Blatt {{page}}', align: 'center' })
    expect(((await layout(page)).page as Record<string, unknown>).footer).toBeUndefined()
    await expect(page.locator('[data-id=footer]')).toBeVisible()
    await page.locator('[data-id=footer]').click()
    await dragBy(page, page.locator('[data-id=footer]'), 0, -15)
    expect((await pn(page, 'footer'))!.y).toBeLessThan(el.y)
  })
})

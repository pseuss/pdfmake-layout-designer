import { expect, test } from '@playwright/test'
import { generate } from '@pdf-layouter/core'
import { nodeFontRegistry } from '../../fixtures/node'
import { readPdf } from '../../packages/core/test/pdf'
import { layout, open } from './helpers'

test.describe('fonts per element', () => {
  test('every element offers "document font" first and can pick another family', async ({ page }) => {
    await open(page)
    await page.locator('[data-id=meta]').click()
    const select = page.getByTestId('font')
    expect(await select.locator('option').allTextContents()).toEqual(['Dokument (Inter)', 'Roboto', 'Inter', 'Merriweather'])
    await expect(select).toHaveValue('')
    await select.selectOption('Merriweather')
    expect(((await layout(page)).static.find((e) => e.id === 'meta') as { font: string }).font).toBe('Merriweather')
    await expect(page.locator('[data-id=meta]')).toHaveCSS('font-family', /Merriweather/)
    await select.selectOption('')
    expect(((await layout(page)).static.find((e) => e.id === 'meta') as { font?: string }).font).toBeUndefined()
  })

  test('flow blocks and the footer have their own font; the PDF uses them', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('font').selectOption('Merriweather')
    await page.getByTestId('add-totals').click()
    await page.getByTestId('font').selectOption('Roboto')
    await page.getByTestId('tab-page').click()
    await page.getByTestId('footer').fill('Seite {{page}}')
    await page.getByTestId('footer-font').selectOption('Merriweather')
    const l = await layout(page)
    expect(l.flow.map((b) => (b as { font?: string }).font)).toEqual(['Merriweather', 'Roboto'])
    expect(l.page.footer!.font).toBe('Merriweather')
    const info = await readPdf(await generate(l, { positionen: [{ beschreibung: 'x' }] }, { fonts: nodeFontRegistry() }))
    expect(info.raw).toMatch(/\+Merriweather-Regular/)
    expect(info.raw).toMatch(/\+Roboto-Regular/)
  })
})

test.describe('visibleWhen', () => {
  test('is edited on static elements and flow blocks and decides what the PDF contains', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    await page.getByTestId('content').fill('NUR-MIT-NOTIZ')
    await page.getByTestId('cond-op').selectOption('exists')
    await page.getByTestId('cond-path').fill('notiz')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('NUR-BEI-DE')
    await page.getByTestId('cond-op').selectOption('equals')
    await page.getByTestId('cond-path').fill('land')
    await page.getByTestId('cond-value').fill('DE')
    const l = await layout(page)
    expect((l.static[0] as { visibleWhen: unknown }).visibleWhen).toEqual({ path: 'notiz', op: 'exists' })
    expect((l.flow[0] as { visibleWhen: unknown }).visibleWhen).toEqual({ path: 'land', op: 'equals', value: 'DE' })

    const text = async (data: Record<string, unknown>) => (await readPdf(await generate(l, data))).pages.map((p) => p.text).join(' ')
    const full = await text({ notiz: 'x', land: 'DE' })
    expect(full).toContain('NUR-MIT-NOTIZ')
    expect(full).toContain('NUR-BEI-DE')
    const none = await text({ land: 'AT' })
    expect(none).not.toContain('NUR-MIT-NOTIZ')
    expect(none).not.toContain('NUR-BEI-DE')
  })

  test('"always" removes the condition again', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('cond-op').selectOption('empty')
    expect(((await layout(page)).static[0] as { visibleWhen?: unknown }).visibleWhen).toBeTruthy()
    await page.getByTestId('cond-op').selectOption('')
    expect(((await layout(page)).static[0] as { visibleWhen?: unknown }).visibleWhen).toBeUndefined()
    await expect(page.getByTestId('cond-path')).toHaveCount(0)
  })
})

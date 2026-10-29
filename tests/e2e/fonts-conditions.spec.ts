import { expect, test } from '@playwright/test'
import { generate } from 'pdfmake-layout-designer-core'
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

  test('flow blocks and the page number element have their own font; the PDF uses them', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('font').selectOption('Merriweather')
    await page.getByTestId('add-totals').click()
    await page.getByTestId('font').selectOption('Roboto')
    await page.getByTestId('add-pagenumber').click()
    await page.getByTestId('font').selectOption('Merriweather')
    const l = await layout(page)
    expect(l.flow.map((b) => (b as { font?: string }).font)).toEqual(['Merriweather', 'Roboto'])
    expect((l.static[0] as { font?: string }).font).toBe('Merriweather')
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
    await page.getByTestId('cond-add').click()
    await page.getByTestId('cond-path').fill('notiz')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('NUR-BEI-DE')
    await page.getByTestId('cond-add').click()
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

  test('removing the only comparison means "always visible" again', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('cond-add').click()
    await page.getByTestId('cond-op').selectOption('empty')
    expect(((await layout(page)).static[0] as { visibleWhen?: unknown }).visibleWhen).toEqual({ path: 'kunde.name', op: 'empty' })
    await page.getByTestId('cond-remove').click()
    expect(((await layout(page)).static[0] as { visibleWhen?: unknown }).visibleWhen).toBeUndefined()
    await expect(page.getByTestId('cond-path')).toHaveCount(0)
    await expect(page.getByTestId('cond-always')).toBeVisible()
  })

  test('expression builder: AND, OR, NOT and numeric comparisons, nested, edited without losing input focus', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    await page.getByTestId('content').fill('ANGEBOT-HINWEIS')
    await page.getByTestId('cond-add').click()
    await page.getByTestId('cond-path').fill('betrag')
    await page.getByTestId('cond-op').selectOption('gt')
    await page.getByTestId('cond-value').fill('100')
    await page.getByTestId('cond-more').click() // -> all of [betrag > 100, <new>]
    await page.getByTestId('cond-1-path').fill('land')
    await page.getByTestId('cond-1-op').selectOption('equals')
    await page.getByTestId('cond-1-value').fill('DE')
    await page.getByTestId('cond-add-group').click() // -> all of [..., any of [<new>]]
    await page.getByTestId('cond-2-0-path').fill('vip')
    await page.getByTestId('cond-2-add').click()
    await page.getByTestId('cond-2-1-path').fill('rabatt')
    await page.getByTestId('cond-2-1-not').check() // vip OR NOT rabatt

    const expected = { all: [{ path: 'betrag', op: 'gt', value: '100' }, { path: 'land', op: 'equals', value: 'DE' }, { any: [{ path: 'vip', op: 'exists' }, { not: { path: 'rabatt', op: 'exists' } }] }] }
    expect(((await layout(page)).static[0] as { visibleWhen: unknown }).visibleWhen).toEqual(expected)

    const l = await layout(page)
    const shows = async (data: Record<string, unknown>) => (await readPdf(await generate(l, data))).pages[0]!.text.includes('ANGEBOT-HINWEIS')
    expect(await shows({ betrag: 150, land: 'DE', vip: true, rabatt: 5 })).toBe(true) // vip satisfies the OR
    expect(await shows({ betrag: 150, land: 'DE', rabatt: '' })).toBe(true) // an empty rabatt satisfies the NOT
    expect(await shows({ betrag: 150, land: 'DE', rabatt: 5 })).toBe(false) // neither
    expect(await shows({ betrag: 50, land: 'DE', vip: true })).toBe(false) // amount too small
    expect(await shows({ betrag: '150,5', land: 'AT', vip: true })).toBe(false) // wrong country

    // switch the inner group to AND, then negate the whole thing
    await page.getByTestId('cond-2-kind').selectOption('all')
    await page.getByTestId('cond-not').check()
    const after = ((await layout(page)).static[0] as { visibleWhen: any }).visibleWhen
    expect(after).toEqual({ not: { all: [expected.all[0], expected.all[1], { all: expected.all[2]!.any }] } })
    // remove a child: the group shrinks, an emptied group disappears
    await page.getByTestId('cond-0-remove').click()
    expect(((await layout(page)).static[0] as { visibleWhen: any }).visibleWhen.not.all).toHaveLength(2)
  })

  test('text comparison values are stored as entered and the leaf survives a reload of the panel', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('cond-add').click()
    await page.getByTestId('cond-op').selectOption('notEquals')
    await page.getByTestId('cond-value').fill('X Y')
    await page.getByTestId('add-text').click()
    await page.getByTestId('layer-rect_1').click()
    await expect(page.getByTestId('cond-op')).toHaveValue('notEquals')
    await expect(page.getByTestId('cond-value')).toHaveValue('X Y')
  })
})

import { expect, test } from '@playwright/test'
import { generate } from '@pdf-layouter/core'
import { readPdf } from '../../packages/core/test/pdf'
import { expectNoErrors, layout, open } from './helpers'

test.describe('flow blocks (R6–R9)', () => {
  test('R6: adds a table bound to the first list of the catalog with typed columns', async ({ page }) => {
    const errors = await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    const t = (await layout(page)).flow[0] as any
    expect(t.type).toBe('table')
    expect(t.source).toBe('positionen')
    expect(t.columns.map((c: any) => [c.field, c.format, c.align])).toEqual([
      ['pos', 'number', 'right'],
      ['beschreibung', 'text', 'left'],
      ['menge', 'number', 'right'],
      ['einzel', 'currency', 'right'],
    ])
    expectNoErrors(errors)
  })

  test('R6: edits columns (field, title, width, alignment, format), adds, reorders and removes them', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('col-1-title').fill('Leistung neu')
    await page.getByTestId('col-1-width').fill('60')
    await page.getByTestId('col-1-align').selectOption('center')
    await page.getByTestId('col-1-format').selectOption('number:2')
    let t = (await layout(page)).flow[0] as any
    expect(t.columns[1]).toMatchObject({ title: 'Leistung neu', width: 60, align: 'center', format: 'number:2' })

    await page.getByTestId('col-1-width').fill('*')
    expect(((await layout(page)).flow[0] as any).columns[1].width).toBe('*')

    await page.getByTestId('add-column').click()
    t = (await layout(page)).flow[0] as any
    expect(t.columns).toHaveLength(5)
    expect(t.columns[4]).toMatchObject({ field: 'gesamt', format: 'currency', align: 'right' })

    await page.getByTestId('col-4-up').click()
    t = (await layout(page)).flow[0] as any
    expect(t.columns[3].field).toBe('gesamt')
    await page.getByTestId('col-0-remove').click()
    expect(((await layout(page)).flow[0] as any).columns).toHaveLength(4)
  })

  test('R6: the data source can be switched to another list of the catalog', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('source').selectOption('reisekosten')
    expect(((await layout(page)).flow[0] as any).source).toBe('reisekosten')
    // the old columns no longer exist in the new list: the Designer says so
    await expect(page.getByTestId('warnings')).toContainText('Unbekannte Spalte')
    await page.getByTestId('col-0-field').selectOption('beschreibung')
    expect(((await layout(page)).flow[0] as any).columns[0].field).toBe('beschreibung')
  })

  test('R6: table style options', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('header-fill').fill('#ddeeff')
    await page.getByTestId('zebra').check()
    await page.getByTestId('borders').selectOption('grid')
    expect(((await layout(page)).flow[0] as any).style).toMatchObject({ headerFill: '#ddeeff', zebra: true, borders: 'grid' })
  })

  test('R8: several tables with different lists in one layout', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-table').click()
    await page.getByTestId('add-table').click()
    await page.getByTestId('source').selectOption('reisekosten')
    const flow = (await layout(page)).flow as any[]
    expect(flow.map((b) => b.source)).toEqual(['positionen', 'reisekosten'])
  })

  test('R7: totals block with labels, placeholder values and an emphasised row', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-totals').click()
    await page.getByTestId('row-0-label').fill('Zwischensumme')
    await page.getByTestId('row-0-value').click()
    await page.getByTestId('totals-picker-field').selectOption('summen.netto')
    await page.getByTestId('totals-picker-insert').click()
    await page.getByTestId('add-row').click()
    await page.getByTestId('row-3-label').fill('Skonto')
    await page.getByTestId('row-3-bold').check()
    await page.getByTestId('totals-width').fill('90')
    const t = (await layout(page)).flow[0] as any
    expect(t.rows[0]).toMatchObject({ label: 'Zwischensumme', value: '{{summen.netto | currency}}' })
    expect(t.rows[3]).toMatchObject({ label: 'Skonto', bold: true })
    expect(t.rows[2].bold).toBe(true)
    expect(t.width).toBe(90)
    await page.getByTestId('row-3-remove').click()
    expect(((await layout(page)).flow[0] as any).rows).toHaveLength(3)
  })

  test('R8/R9: dynamic sections block with data source and styling', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-dynamic').click()
    await page.getByTestId('source').fill('bausteine')
    await page.getByTestId('zebra').check()
    await page.getByTestId('text-margin').fill('10')
    const b = (await layout(page)).flow[0] as any
    expect(b.source).toBe('bausteine')
    expect(b.styles.table.zebra).toBe(true)
    expect(b.styles.text.margin).toEqual([0, 10, 0, 10])
  })

  test('flow list: select, reorder with the arrow actions, duplicate, delete, page break', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    await page.getByTestId('add-table').click()
    await page.getByTestId('add-pagebreak').click()
    expect((await layout(page)).flow.map((b) => b.type)).toEqual(['text', 'table', 'pageBreak'])
    await page.getByTestId('action-up').click()
    expect((await layout(page)).flow.map((b) => b.type)).toEqual(['text', 'pageBreak', 'table'])
    await page.getByTestId('flow-item-0').click()
    await page.getByTestId('action-duplicate').click()
    expect((await layout(page)).flow.map((b) => b.type)).toEqual(['text', 'text', 'pageBreak', 'table'])
    await page.getByTestId('action-delete').click()
    expect((await layout(page)).flow.map((b) => b.type)).toEqual(['text', 'pageBreak', 'table'])
  })

  test('flow list: reorder blocks by drag and drop', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    await page.getByTestId('add-table').click()
    await page.getByTestId('add-totals').click()
    await page.getByTestId('flow-item-2').dragTo(page.getByTestId('flow-item-0'))
    expect((await layout(page)).flow.map((b) => b.type)).toEqual(['totals', 'text', 'table'])
  })

  test('selecting a card in the content box selects the block', async ({ page }) => {
    await open(page)
    await page.getByTestId('flowcard-5').click()
    await expect(page.getByTestId('panel-title')).toContainText('Summenblock')
  })
})

test.describe('rich text blocks (R9, S1)', () => {
  test('writes bold text, a list and inserts a placeholder', async ({ page }) => {
    const errors = await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Hallo ')
    await page.getByTestId('rich-bold').click()
    await page.keyboard.type('fett')
    await page.getByTestId('rich-bold').click()
    await page.keyboard.type(' und ')
    await page.getByTestId('rich-underline').click()
    await page.keyboard.type('unterstrichen')
    await page.getByTestId('rich-underline').click()
    await page.keyboard.press('Enter')
    await page.getByTestId('rich-bullets').click()
    await page.keyboard.type('Punkt eins')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Punkt zwei')

    await page.getByTestId('flow-picker-field').selectOption('kunde.name')
    await page.getByTestId('flow-picker-insert').click()

    const block = (await layout(page)).flow[0] as any
    expect(block.content[0]).toEqual({
      type: 'paragraph',
      runs: [{ text: 'Hallo ' }, { text: 'fett', bold: true }, { text: ' und ' }, { text: 'unterstrichen', underline: true }],
    })
    expect(block.content[1].type).toBe('list')
    expect(block.content[1].ordered).toBe(false)
    expect(block.content[1].items[0]).toEqual([{ text: 'Punkt eins' }])
    expect(block.content[1].items[1]).toEqual([{ text: 'Punkt zwei{{kunde.name}}' }])
    expectNoErrors(errors)
  })

  test('loads existing blocks into the editor and writes edits back', async ({ page }) => {
    await open(page)
    await page.getByTestId('flowcard-0').click()
    await expect(page.locator('.ProseMirror')).toContainText('Sehr geehrte Damen und Herren,')
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' Ihr Team')
    const block = (await layout(page)).flow[0] as any
    expect(block.content[0].runs[0].text).toBe('Sehr geehrte Damen und Herren, Ihr Team')
  })

  test('colour, size and alignment of rich text reach the layout and the PDF', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Farbig und groß')
    await page.keyboard.press('Control+a')
    await page.getByTestId('rich-color').fill('#ff0000')
    await page.getByTestId('rich-size').fill('20')
    await page.getByTestId('rich-size').press('Enter')
    await page.getByTestId('rich-size').blur()
    await page.getByTestId('rich-align-right').click()
    const block = (await layout(page)).flow[0] as any
    expect(block.content[0]).toEqual({ type: 'paragraph', align: 'right', runs: [{ text: 'Farbig und groß', color: '#ff0000', size: 20 }] })
    await expect(page.getByTestId('rich-align-right')).toHaveAttribute('aria-pressed', 'true')

    const info = await readPdf(await generate(await layout(page), {}))
    const item = info.pages[0]!.items.find((i) => i.str.includes('Farbig'))!
    expect(info.pages[0]!.colors).toContain('#ff0000')
    expect(item.x).toBeGreaterThan(250) // right-aligned: starts far right of the left margin
    await page.getByTestId('rich-no-color').click()
    expect(((await layout(page)).flow[0] as any).content[0].runs[0].color).toBeUndefined()
  })

  test('numbered list button', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Erstens')
    await page.getByTestId('rich-numbers').click()
    const block = (await layout(page)).flow[0] as any
    expect(block.content).toHaveLength(1) // no stray empty paragraph after the list
    expect(block.content[0]).toMatchObject({ type: 'list', ordered: true, items: [[{ text: 'Erstens' }]] })
  })
})

test.describe('placeholder picker (A5)', () => {
  test('inserts a formatted placeholder at the cursor of a text box', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    const area = page.getByTestId('content')
    await area.fill('Datum: ')
    await page.getByTestId('content-picker-field').selectOption('rechnung.datum')
    // a date field suggests the date formatter
    await expect(page.getByTestId('content-picker-format')).toHaveValue('date')
    await page.getByTestId('content-picker-insert').click()
    expect(((await layout(page)).static[0] as any).content).toBe('Datum: {{rechnung.datum | date}}')
    await expect(page.locator('[data-type=text]')).toContainText('Datum: 28.10.2026')
  })

  test('works without a catalog through a free path input', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.evaluate(() => (window as any).__app.designer.setPlaceholders(undefined))
    await page.getByTestId('add-text').click()
    await page.getByTestId('content').fill('')
    await page.getByTestId('content-picker-field').fill('kunde.name')
    await page.getByTestId('content-picker-insert').click()
    expect(((await layout(page)).static[0] as any).content).toBe('{{kunde.name}}')
  })

  test('warns about placeholders missing in the catalog or in the sample data and highlights them', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    await page.getByTestId('content').fill('{{erfunden.feld}} {{kunde.name}}')
    await expect(page.getByTestId('warnings')).toContainText('Unbekannter Platzhalter')
    await expect(page.getByTestId('warnings')).toContainText('erfunden.feld')
    await expect(page.locator('[data-type=text] .pld-missing')).toHaveText('{{erfunden.feld}}')
    await page.evaluate(() => (window as any).__app.designer.setSampleData({}))
    await expect(page.getByTestId('warnings')).toContainText('Kein Beispielwert')
    const warnings = await page.evaluate(() => (window as any).__app.designer.getWarnings())
    expect(warnings.map((w: any) => w.code).sort()).toEqual(['no-sample-value', 'unknown-placeholder'])
  })

  test('the canvas draws the table true to scale: titles, widths, sample rows and formats', async ({ page }) => {
    await open(page)
    const card = page.getByTestId('flowcard-2')
    await expect(card.locator('.pld-flowcell.is-head')).toHaveText(['Pos', 'Leistung', 'Menge', 'Einzel', 'Gesamt'])
    await expect(card.locator('.pld-flowcell').nth(5)).toHaveText('1')
    await expect(card.locator('.pld-flowtable-more')).toContainText('+')
    // currency columns are formatted like in the PDF
    await expect(card).toContainText('€')
    // a fixed column width is drawn in millimetres: changing it changes the drawn column
    const before = (await card.locator('.pld-flowcell.is-head').nth(0).boundingBox())!.width
    await card.click()
    await page.getByTestId('col-0-width').fill('40')
    const after = (await page.getByTestId('flowcard-2').locator('.pld-flowcell.is-head').nth(0).boundingBox())!.width
    expect(after).toBeGreaterThan(before * 1.5)
  })

  test('two blocks can sit side by side in the Content Box (canvas and PDF)', async ({ page }) => {
    const errors = await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('LINKS')
    await page.getByTestId('block-width').fill('60')
    await page.getByTestId('add-flow-text').click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('RECHTS')
    await page.getByTestId('same-row').check()
    const flow = (await layout(page)).flow as any[]
    expect(flow[0].width).toBe(60)
    expect(flow[1].sameRow).toBe(true)

    const a = (await page.getByTestId('flowcard-0').boundingBox())!
    const b = (await page.getByTestId('flowcard-1').boundingBox())!
    expect(Math.abs(a.y - b.y)).toBeLessThan(2)
    expect(b.x).toBeGreaterThan(a.x + a.width)

    const bytes = await generate(await layout(page), {}, {})
    const info = await readPdf(bytes)
    const items = info.pages[0]!.items
    const l = items.find((i) => i.str.endsWith('LINKS'))!
    const r = items.find((i) => i.str.endsWith('RECHTS'))!
    expect(Math.abs(l.y - r.y)).toBeLessThan(1)
    expect(r.x).toBeGreaterThan(l.x + 100)
    expectNoErrors(errors)
  })

  test('the first block cannot be put next to a predecessor', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-flow-text').click()
    await expect(page.getByTestId('same-row')).toBeDisabled()
  })
})

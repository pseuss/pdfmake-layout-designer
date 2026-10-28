import { expect, test, type Page } from '@playwright/test'
import { generate } from '@pdf-layouter/core'
import { dragBy, layout, open, scale } from './helpers'

const geometry = async (page: Page) => {
  const k = await scale(page)
  const box = (await page.getByTestId('page').boundingBox())!
  const h = (await page.getByTestId('ruler-h').boundingBox())!
  const v = (await page.getByTestId('ruler-v').boundingBox())!
  return { k, box, h, v }
}

/** Drags from a ruler to a point on the page given in mm. */
async function pullGuide(page: Page, from: 'h' | 'v', mm: number, across = 80) {
  const { k, box, h, v } = await geometry(page)
  const startX = from === 'h' ? box.x + across * k : v.x + v.width / 2
  const startY = from === 'h' ? h.y + h.height / 2 : box.y + across * k
  const endX = from === 'h' ? startX : box.x + mm * k
  const endY = from === 'h' ? box.y + mm * k : startY
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 4 })
  await page.mouse.move(endX, endY, { steps: 4 })
  await page.mouse.up()
}

const guides = async (page: Page) => (await layout(page)).guides

test.describe('rulers and guides', () => {
  test('rulers show millimetres aligned with the page and follow the zoom', async ({ page }) => {
    await open(page, 'layout=empty')
    const labels = await page.locator('[data-testid=ruler-h] .pld-ruler-label').allTextContents()
    expect(labels.slice(0, 4)).toEqual(['0', '10', '20', '30'])
    expect(labels.at(-1)).toBe('210')
    expect((await page.locator('[data-testid=ruler-v] .pld-ruler-label').allTextContents()).at(-1)).toBe('290')
    const { k, box } = await geometry(page)
    const label100 = (await page.locator('[data-testid=ruler-h] .pld-ruler-label', { hasText: /^100$/ }).boundingBox())!
    expect(label100.x).toBeCloseTo(box.x + 100 * k, -1) // the "100" sits at 100 mm of the page (within a few px)
    await page.getByTestId('zoom-in').click()
    const after = await geometry(page)
    const moved = (await page.locator('[data-testid=ruler-h] .pld-ruler-label', { hasText: /^100$/ }).boundingBox())!
    expect(after.k).toBeGreaterThan(k)
    expect(moved.x).toBeCloseTo(after.box.x + 100 * after.k, -1)
  })

  test('dragging out of the top ruler creates a horizontal guide, out of the left ruler a vertical one', async ({ page }) => {
    await open(page, 'layout=empty')
    expect(await guides(page)).toBeUndefined()
    await pullGuide(page, 'h', 100)
    await pullGuide(page, 'v', 30)
    expect(await guides(page)).toEqual({ x: [30], y: [100] })
    await expect(page.getByTestId('uguide-y-0')).toHaveAttribute('data-mm', '100')
    await expect(page.getByTestId('uguide-x-0')).toHaveAttribute('data-mm', '30')
    const k = await scale(page)
    const box = (await page.getByTestId('page').boundingBox())!
    const line = (await page.getByTestId('uguide-y-0').boundingBox())!
    expect(line.y + line.height / 2).toBeCloseTo(box.y + 100 * k, 0)
  })

  test('a guide dropped outside the page is not created; the readout shows the position while dragging', async ({ page }) => {
    await open(page, 'layout=empty')
    const { box, h, k } = await geometry(page)
    await page.mouse.move(box.x + 80 * k, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 80 * k, box.y + 50 * k, { steps: 4 })
    await expect(page.getByTestId('readout')).toHaveText('y 50.0 mm')
    await page.mouse.move(box.x + 80 * k, h.y + 2, { steps: 4 }) // back onto the ruler: outside
    await page.mouse.up()
    expect(await guides(page)).toBeUndefined()
    await expect(page.locator('.pld-uguide')).toHaveCount(0)
  })

  test('guides can be moved, and are removed by dragging them off the page or by double click', async ({ page }) => {
    await open(page, 'layout=empty')
    await pullGuide(page, 'h', 100)
    await pullGuide(page, 'h', 150)
    await dragBy(page, page.getByTestId('uguide-y-0'), 0, 25, 'center')
    expect((await guides(page))!.y).toEqual([125, 150])
    // off the page (above it) deletes
    const { k, box, h } = await geometry(page)
    const line = (await page.getByTestId('uguide-y-1').boundingBox())!
    await page.mouse.move(line.x + 40, line.y + line.height / 2)
    await page.mouse.down()
    await page.mouse.move(line.x + 40, h.y + h.height / 2, { steps: 5 })
    await page.mouse.up()
    expect((await guides(page))!.y).toEqual([125])
    await page.getByTestId('uguide-y-0').dblclick({ position: { x: 60, y: 3 } })
    expect((await guides(page))!.y).toEqual([])
    void k
    void box
  })

  test('elements snap to the guides and show the snap line', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.evaluate(() =>
      (window as any).__app.designer.setLayout({
        schemaVersion: 1,
        guides: { x: [63], y: [] },
        static: [{ id: 'b', type: 'rect', x: 20, y: 150, w: 30, h: 20, fill: '#aaccee' }],
      }),
    )
    await expect(page.getByTestId('uguide-x-0')).toBeVisible()
    await dragBy(page, page.locator('[data-id=b]'), 40, 0) // grid gives x 60: within reach of the guide at 63
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(63)
  })

  test('guide changes are undoable, persist in the layout JSON and do not appear in the PDF', async ({ page }) => {
    await open(page, 'layout=empty')
    await pullGuide(page, 'v', 40)
    expect(await guides(page)).toEqual({ x: [40], y: [] })
    expect(await page.evaluate(() => (window as any).__app.changes.at(-1).guides)).toEqual({ x: [40], y: [] })
    await page.getByTestId('undo').click()
    expect((await guides(page))?.x ?? []).toEqual([])
    await page.getByTestId('redo').click()
    expect((await guides(page))!.x).toEqual([40])
    await expect(page.getByTestId('uguide-x-0')).toBeVisible()
    // stored layouts bring their guides back
    const stored = await layout(page)
    await page.evaluate((l) => (window as any).__app.designer.setLayout(l), stored as never)
    await expect(page.getByTestId('uguide-x-0')).toBeVisible()
    expect((await generate(stored, {})).length).toBe((await generate({ ...stored, guides: undefined }, {})).length)
  })

  test('the Guides toggle hides them without deleting; the page panel deletes all', async ({ page }) => {
    await open(page, 'layout=empty')
    await pullGuide(page, 'h', 60)
    await pullGuide(page, 'v', 60)
    await page.getByTestId('toggle-guides').click()
    await expect(page.locator('.pld-uguide')).toHaveCount(0)
    expect(await guides(page)).toEqual({ x: [60], y: [60] })
    await page.getByTestId('toggle-guides').click()
    await expect(page.locator('.pld-uguide')).toHaveCount(2)
    await page.getByTestId('tab-page').click()
    await expect(page.getByTestId('clear-guides')).toContainText('(2)')
    await page.getByTestId('clear-guides').click()
    expect((await layout(page)).guides).toBeUndefined()
    await expect(page.getByTestId('clear-guides')).toBeDisabled()
  })
})

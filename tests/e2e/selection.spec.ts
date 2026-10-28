import { expect, test, type Page } from '@playwright/test'
import { dragBy, layout, open, scale } from './helpers'

const rects = (page: Page) =>
  page.evaluate(() =>
    (window as any).__app.designer.setLayout({
      schemaVersion: 1,
      static: [
        { id: 'a', type: 'rect', x: 61, y: 100, w: 40, h: 20, fill: '#cccccc' },
        { id: 'b', type: 'rect', x: 20, y: 150, w: 30, h: 20, fill: '#aaccee' },
        { id: 'c', type: 'rect', x: 120, y: 60, w: 21, h: 20, fill: '#eeccaa' },
        { id: 'adr', type: 'address', content: 'x' },
      ],
    }),
  )

const pos = async (page: Page, id: string) => {
  const e = (await layout(page)).static.find((x) => x.id === id) as { x: number; y: number }
  return [e.x, e.y]
}

test.describe('multi-select', () => {
  test('shift-click on the canvas and in the layer list builds a selection', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=a]').click()
    await page.locator('[data-id=b]').click({ modifiers: ['Shift'] })
    await expect(page.getByTestId('panel-title')).toHaveText('2 Elemente ausgewählt')
    await expect(page.locator('.pld-el.is-selected')).toHaveCount(2)
    await expect(page.locator('[data-handle]')).toHaveCount(0)
    await page.getByTestId('layer-c').click({ modifiers: ['Shift'] })
    await expect(page.getByTestId('panel-title')).toHaveText('3 Elemente ausgewählt')
    await page.locator('[data-id=c]').click({ modifiers: ['Shift'] }) // toggles off
    await expect(page.getByTestId('panel-title')).toHaveText('2 Elemente ausgewählt')
    await page.locator('[data-id=b]').click({ modifiers: ['Shift'] })
    await expect(page.getByTestId('panel-title')).toContainText('a') // back to a single selection
  })

  test('dragging one selected element moves the whole group in one undo step', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=a]').click()
    await page.locator('[data-id=b]').click({ modifiers: ['Shift'] })
    const [ax, ay] = await pos(page, 'a')
    const [bx, by] = await pos(page, 'b')
    await page.getByTestId('toggle-snap').click() // exact distances
    await dragBy(page, page.locator('[data-id=a]'), 10, 15)
    const [ax2, ay2] = await pos(page, 'a')
    const [bx2, by2] = await pos(page, 'b')
    expect(Math.round(ax2! - ax!)).toBe(10)
    expect(Math.round(ay2! - ay!)).toBe(15)
    expect([bx2! - bx!, by2! - by!]).toEqual([ax2! - ax!, ay2! - ay!])
    expect(await pos(page, 'c')).toEqual([120, 60]) // not selected
    await page.getByTestId('undo').click()
    expect([await pos(page, 'a'), await pos(page, 'b')]).toEqual([[ax, ay], [bx, by]])
  })

  test('align buttons, nudge, duplicate and delete act on the whole selection', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.getByTestId('stage').focus()
    await page.keyboard.press('Control+a')
    await expect(page.getByTestId('panel-title')).toHaveText('3 Elemente ausgewählt') // the address field is fixed and not part of it

    await page.getByTestId('align-left').click()
    expect((await layout(page)).static.filter((e) => e.type === 'rect').map((e) => (e as { x: number }).x)).toEqual([20, 20, 20])
    await page.getByTestId('align-bottom').click()
    const bottoms = (await layout(page)).static.filter((e) => e.type === 'rect').map((e) => (e as { y: number; h: number }).y + (e as { h: number }).h)
    expect(new Set(bottoms).size).toBe(1)

    await page.getByTestId('stage').focus()
    await page.keyboard.press('Shift+ArrowRight')
    expect((await layout(page)).static.filter((e) => e.type === 'rect').map((e) => (e as { x: number }).x)).toEqual([30, 30, 30])

    await page.keyboard.press('Control+d')
    expect((await layout(page)).static).toHaveLength(7)
    await expect(page.getByTestId('panel-title')).toHaveText('3 Elemente ausgewählt')
    await page.keyboard.press('Delete')
    expect((await layout(page)).static).toHaveLength(4)
  })

  test('center alignment puts all centres on one axis', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=a]').click()
    await page.locator('[data-id=b]').click({ modifiers: ['Shift'] })
    await page.getByTestId('align-center').click()
    const [a, b] = (await layout(page)).static.slice(0, 2) as { x: number; w: number }[]
    expect(a!.x + a!.w / 2).toBeCloseTo(b!.x + b!.w / 2, 5)
  })
})

test.describe('snapping guides', () => {
  test('shows a guide line while an edge meets another element and snaps to it', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    const k = await scale(page)
    const box = (await page.locator('[data-id=b]').boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 20 * k, y, { steps: 4 })
    await page.mouse.move(x + 40 * k, y, { steps: 4 }) // left edge near 60, element a starts at 61
    await expect(page.getByTestId('guide-x').first()).toBeVisible()
    await page.mouse.up()
    expect((await pos(page, 'b'))[0]).toBe(61)
    await expect(page.locator('.pld-guide')).toHaveCount(0)
  })

  test('snaps to the page centre', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=c]').click()
    await dragBy(page, page.locator('[data-id=c]'), -25, 0) // grid gives x 95, centre 105.5: within the threshold of the page centre
    const c = (await layout(page)).static.find((e) => e.id === 'c') as { x: number; w: number }
    expect(c.x + c.w / 2).toBe(105)
  })

  test('Alt disables guides and the Snap toggle disables them too', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.keyboard.down('Alt')
    await dragBy(page, page.locator('[data-id=b]'), 41, 0)
    await page.keyboard.up('Alt')
    expect((await pos(page, 'b'))[0]).toBe(60) // grid only
    await page.getByTestId('toggle-snap').click()
    await dragBy(page, page.locator('[data-id=b]'), 1, 0)
    expect((await pos(page, 'b'))[0]).not.toBe(61)
  })

  test('resizing snaps the dragged edge to another element', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=b]').click()
    // b spans x 20..50; dragging the east edge by ~+10 reaches 60 on the grid and 61 on the left edge of a
    await dragBy(page, page.locator('[data-id=b] [data-handle=e]'), 10, 0)
    const b = (await layout(page)).static.find((e) => e.id === 'b') as { x: number; w: number }
    expect(b.x + b.w).toBe(61)
  })
})

test.describe('rubber-band selection', () => {
  const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, modifier?: 'Shift') => {
    const box = (await page.getByTestId('page').boundingBox())!
    const k = await scale(page)
    if (modifier) await page.keyboard.down(modifier)
    await page.mouse.move(box.x + from.x * k, box.y + from.y * k)
    await page.mouse.down()
    await page.mouse.move(box.x + ((from.x + to.x) / 2) * k, box.y + ((from.y + to.y) / 2) * k, { steps: 3 })
    await page.mouse.move(box.x + to.x * k, box.y + to.y * k, { steps: 3 })
    await expect(page.getByTestId('marquee')).toBeVisible()
    await page.mouse.up()
    if (modifier) await page.keyboard.up(modifier)
  }

  test('dragging over empty space selects every element it touches', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page) // a (61..101 x 100..120), b (20..50 x 150..170), c (120..141 x 60..80), address (fixed)
    await drag(page, { x: 5, y: 90 }, { x: 110, y: 175 }) // touches a and b only
    await expect(page.getByTestId('panel-title')).toHaveText('2 Elemente ausgewählt')
    await expect(page.locator('.pld-el.is-selected')).toHaveCount(2)
    await expect(page.locator('.pld-marquee')).toHaveCount(0)
    await drag(page, { x: 5, y: 4 }, { x: 8, y: 8 }) // empty corner: nothing hit -> deselect
    await expect(page.getByText('Wähle ein Element')).toBeVisible()
    await drag(page, { x: 115, y: 55 }, { x: 160, y: 85 })
    await expect(page.getByTestId('panel-title')).toContainText('c') // a single hit is a normal selection
  })

  test('shift adds to the current selection; the fixed address field is never part of it', async ({ page }) => {
    await open(page, 'layout=empty')
    await rects(page)
    await page.locator('[data-id=c]').click()
    await drag(page, { x: 5, y: 145 }, { x: 55, y: 175 }, 'Shift') // b
    await expect(page.getByTestId('panel-title')).toHaveText('2 Elemente ausgewählt')
    await drag(page, { x: 15, y: 15 }, { x: 100, y: 120 }) // covers the address window (20..105 x 45..90) and a
    expect((await page.locator('.pld-el.is-selected').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id)))).toEqual(['a'])
  })

  test('with a page-sized background, dragging from it selects elements and a click still selects the background', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.evaluate(() =>
      (window as any).__app.designer.setLayout({
        schemaVersion: 1,
        static: [
          { id: 'bg', type: 'rect', x: 0, y: 0, w: 210, h: 297, fill: '#f4f4f4' },
          { id: 'a', type: 'rect', x: 61, y: 100, w: 40, h: 20, fill: '#cccccc' },
          { id: 'b', type: 'rect', x: 20, y: 150, w: 30, h: 20, fill: '#aaccee' },
        ],
      }),
    )
    await drag(page, { x: 10, y: 95 }, { x: 110, y: 175 })
    await expect(page.getByTestId('panel-title')).toHaveText('2 Elemente ausgewählt')
    const ids = await page.locator('.pld-el.is-selected').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))
    expect(ids.sort()).toEqual(['a', 'b']) // the background is not swept up
    const k = await scale(page)
    const box = (await page.getByTestId('page').boundingBox())!
    await page.mouse.click(box.x + 150 * k, box.y + 250 * k)
    await expect(page.getByTestId('panel-title')).toContainText('bg')
    const before = ((await layout(page)).static[0] as { x: number }).x
    await dragBy(page, page.locator('[data-id=bg]'), 10, 0) // selected now: dragging moves it
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(before + 10)
  })
})

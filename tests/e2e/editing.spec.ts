import { expect, test } from '@playwright/test'
import { changeCount, dragBy, expectNoErrors, layout, open, scale } from './helpers'

test.describe('canvas: adding and manipulating static elements (R1–R5)', () => {
  test('adds text box, line, rectangle and address field from the toolbar', async ({ page }) => {
    const errors = await open(page, 'layout=empty')
    for (const id of ['add-text', 'add-line', 'add-rect', 'add-address']) await page.getByTestId(id).click()
    const l = await layout(page)
    expect(l.static.map((e) => e.type)).toEqual(['text', 'line', 'rect', 'address'])
    expect(new Set(l.static.map((e) => e.id)).size).toBe(4)
    await expect(page.getByTestId('panel-title')).toContainText('Adressfeld')
    expectNoErrors(errors)
  })

  test('R3: moves a text box by dragging and snaps to the 5 mm grid (units in mm)', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    const before = (await layout(page)).static[0] as { x: number; y: number }
    await dragBy(page, page.locator('[data-type=text]'), 20, 10)
    const after = (await layout(page)).static[0] as { x: number; y: number }
    expect(after.x).toBe(before.x + 20)
    expect(after.y).toBe(before.y + 10)
  })

  test('moves freely when snapping is off', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('toggle-snap').click()
    await page.getByTestId('add-rect').click()
    const before = (await layout(page)).static[0] as { x: number }
    await dragBy(page, page.locator('[data-type=rect]'), 12.3, 0)
    const after = (await layout(page)).static[0] as { x: number }
    expect(after.x - before.x).toBeGreaterThan(11.5)
    expect(after.x - before.x).toBeLessThan(13.1)
    expect(Number.isInteger(after.x * 2)).toBe(false)
  })

  test('R5: resizes a rectangle with the corner handle', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    const before = (await layout(page)).static[0] as { w: number; h: number; x: number; y: number }
    await dragBy(page, page.locator('[data-type=rect] [data-handle=se]'), 10, 5)
    const after = (await layout(page)).static[0] as { w: number; h: number; x: number; y: number }
    expect(after.w).toBe(before.w + 10)
    expect(after.h).toBe(before.h + 5)
    expect([after.x, after.y]).toEqual([before.x, before.y])
  })

  test('resizing from the north-west handle keeps the opposite corner fixed', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    const b = (await layout(page)).static[0] as { w: number; h: number; x: number; y: number }
    await dragBy(page, page.locator('[data-type=rect] [data-handle=nw]'), 5, 5)
    const a = (await layout(page)).static[0] as { w: number; h: number; x: number; y: number }
    expect([a.x + a.w, a.y + a.h]).toEqual([b.x + b.w, b.y + b.h])
    expect(a.w).toBe(b.w - 5)
  })

  test('R4: line endpoints can be dragged individually', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-line').click()
    const b = (await layout(page)).static[0] as { x1: number; y1: number; x2: number; y2: number }
    await dragBy(page, page.locator('[data-type=line] [data-handle=p2]'), -30, 10)
    const a = (await layout(page)).static[0] as { x1: number; y1: number; x2: number; y2: number }
    expect([a.x1, a.y1]).toEqual([b.x1, b.y1])
    expect(a.x2).toBe(b.x2 - 30)
    expect(a.y2).toBe(b.y2 + 10)
  })

  test('R4: line handles sit on the real endpoints, also for lines that run upwards', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.evaluate(() =>
      (window as any).__app.designer.setLayout({ schemaVersion: 1, static: [{ id: 'l', type: 'line', x1: 10, y1: 50, x2: 100, y2: 20 }] }),
    )
    await page.locator('[data-id=l]').click({ force: true })
    const line = (await page.locator('[data-id=l]').boundingBox())!
    const p1 = (await page.locator('[data-handle=p1]').boundingBox())!
    const p2 = (await page.locator('[data-handle=p2]').boundingBox())!
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(3)
    near(p1.x + 5, line.x) // start: left ...
    near(p1.y + 5, line.y + line.height) // ... and bottom
    near(p2.x + 5, line.x + line.width) // end: right ...
    near(p2.y + 5, line.y) // ... and top
  })

  test('R4: a whole line can be moved', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-line').click()
    const b = (await layout(page)).static[0] as { x1: number; y1: number; x2: number; y2: number }
    await dragBy(page, page.locator('[data-type=line]'), 0, 15)
    const a = (await layout(page)).static[0] as { x1: number; y1: number; x2: number; y2: number }
    expect(a.y1).toBe(b.y1 + 15)
    expect(a.y2).toBe(b.y2 + 15)
    expect(a.x2 - a.x1).toBe(b.x2 - b.x1)
  })

  test('text boxes only resize horizontally; the address field is fixed by its preset', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    await expect(page.locator('[data-type=text] [data-handle]')).toHaveCount(2)
    await page.getByTestId('add-address').click()
    await expect(page.locator('[data-type=address] [data-handle]')).toHaveCount(0)
    const addr = (await layout(page)).static[1]!
    await dragBy(page, page.locator('[data-type=address]'), 30, 30)
    expect((await layout(page)).static[1]).toEqual(addr)
  })

  test('keyboard: arrows nudge, Ctrl+D duplicates, Delete removes', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('stage').focus()
    const b = (await layout(page)).static[0] as { x: number }
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(b.x + 11)
    await page.keyboard.press('Control+d')
    expect((await layout(page)).static).toHaveLength(2)
    await page.keyboard.press('Delete')
    expect((await layout(page)).static).toHaveLength(1)
  })

  test('typing in a property field does not trigger the delete shortcut', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    const area = page.getByTestId('content')
    await area.fill('abc')
    await area.press('Backspace')
    expect((await layout(page)).static).toHaveLength(1)
    expect(((await layout(page)).static[0] as { content: string }).content).toBe('ab')
  })

  test('layers: reorder, duplicate and delete via the property actions', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('add-text').click()
    expect((await layout(page)).static.map((e) => e.type)).toEqual(['rect', 'text'])
    await page.getByTestId('action-down').click() // text moves behind the rectangle
    expect((await layout(page)).static.map((e) => e.type)).toEqual(['text', 'rect'])
    await page.getByTestId('action-duplicate').click()
    expect((await layout(page)).static).toHaveLength(3)
    await page.getByTestId('action-delete').click()
    expect((await layout(page)).static).toHaveLength(2)
    await expect(page.getByText('Wähle ein Element')).toBeVisible()
  })

  test('selecting by clicking the layer list and the canvas', async ({ page }) => {
    await open(page)
    await page.getByTestId('layer-sep').click()
    await expect(page.getByTestId('panel-title')).toContainText('sep')
    await page.locator('[data-id=meta]').click()
    await expect(page.getByTestId('panel-title')).toContainText('meta')
    await page.getByTestId('stage').click({ position: { x: 8, y: 8 } })
    await expect(page.getByText('Wähle ein Element')).toBeVisible()
  })
})

test.describe('property panel', () => {
  test('edits text, font, colour, size and alignment of a text box', async ({ page }) => {
    await open(page)
    await page.locator('[data-id=meta]').click()
    await page.getByTestId('content').fill('Hallo {{kunde.name}}')
    await page.getByTestId('font').selectOption('Merriweather')
    await page.getByTestId('size').fill('14')
    await page.getByTestId('bold').check()
    await page.getByTestId('align').selectOption('center')
    await page.getByTestId('color').fill('#ff0000')
    const meta = (await layout(page)).static.find((e) => e.id === 'meta') as Record<string, unknown>
    expect(meta).toMatchObject({ content: 'Hallo {{kunde.name}}', font: 'Merriweather', size: 14, bold: true, align: 'center', color: '#ff0000' })
    await expect(page.locator('[data-id=meta]')).toContainText('Hallo Muster GmbH')
  })

  test('numeric position fields move the element in mm', async ({ page }) => {
    await open(page)
    await page.locator('[data-id=meta]').click()
    await page.getByTestId('x').fill('100.5')
    await page.getByTestId('y').fill('33')
    const meta = (await layout(page)).static.find((e) => e.id === 'meta') as { x: number; y: number }
    expect([meta.x, meta.y]).toEqual([100.5, 33])
    const k = await scale(page)
    const left = await page.locator('[data-id=meta]').evaluate((el) => parseFloat((el as HTMLElement).style.left))
    expect(left).toBeCloseTo(100.5 * k, 0)
  })

  test('typing keeps focus in the field while the canvas updates', async ({ page }) => {
    await open(page)
    await page.locator('[data-id=meta]').click()
    const area = page.getByTestId('content')
    await area.click()
    await page.keyboard.type(' XYZ')
    await expect(area).toBeFocused()
    await expect(page.locator('[data-id=meta]')).toContainText('XYZ')
  })

  test('R4/R5: line and rectangle styling fields', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-line').click()
    await page.getByTestId('line-width').fill('2')
    await page.getByTestId('dash').selectOption('dashed')
    await page.getByTestId('color').fill('#00aa00')
    await page.getByTestId('x2').fill('150')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('fill').fill('#ff8800')
    await page.getByTestId('stroke').fill('#000000')
    await page.getByTestId('stroke-width').fill('1.5')
    await page.getByTestId('radius').fill('3')
    const [line, rect] = (await layout(page)).static as any[]
    expect(line).toMatchObject({ width: 2, dash: 'dashed', color: '#00aa00', x2: 150 })
    expect(rect).toMatchObject({ fill: '#ff8800', radius: 3, stroke: { color: '#000000', width: 1.5 } })
    await page.getByTestId('fill-none').click()
    expect(((await layout(page)).static[1] as { fill?: string }).fill).toBeUndefined()
  })

  test('page rules decide on which pages an element is drawn; others are dimmed in the view', async ({ page }) => {
    await open(page)
    await expect(page.locator('[data-id=bar]')).toHaveClass(/is-dimmed/) // notFirst on page 1
    await page.getByTestId('view-follow').click()
    await expect(page.locator('[data-id=bar]')).not.toHaveClass(/is-dimmed/)
    await expect(page.locator('[data-id=addr]')).toHaveClass(/is-dimmed/)
    await page.locator('[data-id=bar]').click()
    await page.getByTestId('pages').selectOption('last')
    expect(((await layout(page)).static.find((e) => e.id === 'bar') as { pages: string }).pages).toBe('last')
  })

  test('address field: preset, content and return address', async ({ page }) => {
    await open(page)
    await page.locator('[data-id=addr]').click()
    await page.getByTestId('preset').selectOption('DIN5008-A')
    await page.getByTestId('return-address').fill('Absender GmbH')
    const addr = (await layout(page)).static.find((e) => e.id === 'addr') as { preset: string; returnAddress: string }
    expect(addr).toMatchObject({ preset: 'DIN5008-A', returnAddress: 'Absender GmbH' })
    const top = await page.locator('[data-id=addr]').evaluate((el) => parseFloat((el as HTMLElement).style.top))
    expect(top).toBeCloseTo(27 * (await scale(page)), 0)
  })

  test('page settings: size, orientation, defaults and footer', async ({ page }) => {
    await open(page)
    await page.getByTestId('tab-page').click()
    await page.getByTestId('page-size').selectOption('A5')
    await page.getByTestId('page-orientation').selectOption('landscape')
    await page.getByTestId('default-size').fill('12')
    await page.getByTestId('footer').fill('Blatt {{page}}')
    await page.getByTestId('footer-align').selectOption('center')
    await page.getByTestId('page-first-top').fill('80')
    const l = await layout(page)
    expect(l.page).toMatchObject({ size: 'A5', orientation: 'landscape', footer: { content: 'Blatt {{page}}', align: 'center' }, defaults: { size: 12 }, contentBox: { first: { top: 80 } } })
    const k = await scale(page)
    const size = await page.getByTestId('page').evaluate((el) => [el.clientWidth, el.clientHeight])
    expect(Math.abs(size[0]! - 210 * k)).toBeLessThan(1) // clientWidth/Height are rounded to whole pixels
    expect(Math.abs(size[1]! - 148 * k)).toBeLessThan(1)
  })

  test('zoom, grid and snap toggles', async ({ page }) => {
    await open(page, '', false)
    const k0 = await scale(page)
    await page.getByTestId('zoom-in').click()
    expect(await scale(page)).toBeCloseTo(k0 * 1.25, 3)
    await page.getByTestId('zoom-out').click()
    await page.getByTestId('zoom-out').click()
    expect(await scale(page)).toBeCloseTo(k0 * 0.75, 3)
    await expect(page.locator('.pld-grid')).toHaveCount(1)
    await page.getByTestId('toggle-grid').click()
    await expect(page.locator('.pld-grid')).toHaveCount(0)
    await expect(page.getByTestId('toggle-snap')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('toggle-snap').click()
    await expect(page.getByTestId('toggle-snap')).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows the cursor position in mm', async ({ page }) => {
    await open(page)
    const box = (await page.getByTestId('page').boundingBox())!
    const k = await scale(page)
    await page.mouse.move(box.x + 50 * k, box.y + 100 * k)
    await expect(page.getByTestId('readout')).toContainText(/^50\.\d \/ 100\.\d mm$/)
  })
})

test.describe('content box (R-layout: first page and follow-up pages)', () => {
  test('is shown per view and can be resized by dragging, independently for page 1 and follow-up pages', async ({ page }) => {
    await open(page)
    const before = await layout(page)
    await page.getByTestId('content-box-label').click()
    await dragBy(page, page.getByTestId('cbox-handle-n'), 0, -10)
    let l = await layout(page)
    expect(l.page.contentBox.first.top).toBe(before.page.contentBox.first.top - 10)
    expect(l.page.contentBox.follow).toEqual(before.page.contentBox.follow)

    await page.getByTestId('view-follow').click()
    await page.getByTestId('content-box-label').click()
    await dragBy(page, page.getByTestId('cbox-handle-w'), 5, 0)
    l = await layout(page)
    expect(l.page.contentBox.follow.left).toBe(before.page.contentBox.follow.left + 5)
    expect(l.page.contentBox.first.left).toBe(before.page.contentBox.first.left)
  })

  test('can be moved as a whole and edited numerically', async ({ page }) => {
    await open(page)
    const before = (await layout(page)).page.contentBox.first
    await dragBy(page, page.getByTestId('content-box-label'), 10, 5, 'center')
    const after = (await layout(page)).page.contentBox.first
    expect(after.left).toBe(before.left + 10)
    expect(after.right).toBe(before.right - 10)
    expect(after.top).toBe(before.top + 5)
    await page.getByTestId('cbox-bottom').fill('40')
    expect((await layout(page)).page.contentBox.first.bottom).toBe(40)
  })
})

test('onChange fires for UI edits with the full layout but not for setLayout (A4)', async ({ page }) => {
  await open(page, 'layout=empty')
  expect(await changeCount(page)).toBe(0)
  await page.getByTestId('add-rect').click()
  expect(await changeCount(page)).toBe(1)
  const emitted = await page.evaluate(() => (window as any).__app.changes.at(-1))
  expect(emitted).toEqual(await layout(page))
  await page.evaluate(() => (window as any).__app.designer.setLayout({ schemaVersion: 1, locale: 'en-US' }))
  expect(await changeCount(page)).toBe(1)
  expect((await layout(page)).locale).toBe('en-US')
  expect((await layout(page)).static).toEqual([])
})

test('the canvas uses the Host App fonts through the FontFace API, so Designer and PDF look the same (7.3)', async ({ page }) => {
  await open(page)
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('12px Inter')
    await document.fonts.load('bold 12px Merriweather')
    return { inter: document.fonts.check('12px Inter'), merri: document.fonts.check('bold 12px Merriweather'), roboto: document.fonts.check('12px Roboto') }
  })
  expect(loaded).toEqual({ inter: true, merri: true, roboto: true })
  const family = await page.locator('[data-id=meta]').evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).toContain('Inter')
  await page.locator('[data-id=meta]').click()
  const options = await page.getByTestId('font').locator('option').allTextContents()
  expect(options).toEqual(['Dokument (Inter)', 'Roboto', 'Inter', 'Merriweather'])
})

test('English UI labels', async ({ page }) => {
  await open(page, 'locale=en&layout=empty')
  await expect(page.getByTestId('add-rect')).toHaveText('Rectangle')
  await expect(page.getByTestId('tab-preview')).toHaveText('Preview')
})

test.describe('grid size', () => {
  test('defaults to 2.5 mm and can be switched to 1, 5 or 10 mm; snapping follows', async ({ page }) => {
    await open(page, 'layout=empty')
    await expect(page.getByTestId('grid-size')).toHaveValue('2.5')
    expect(await page.getByTestId('grid-size').locator('option').allTextContents()).toEqual(['1 mm', '2,5 mm', '5 mm', '10 mm'])
    await page.getByTestId('add-rect').click()
    const x0 = ((await layout(page)).static[0] as { x: number }).x
    await dragBy(page, page.locator('[data-type=rect]'), 7.5, 0)
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(x0 + 7.5) // 7.5 is a multiple of 2.5

    await page.getByTestId('grid-size').selectOption('10')
    await dragBy(page, page.locator('[data-type=rect]'), 12, 0)
    expect((((await layout(page)).static[0] as { x: number }).x) % 10).toBe(0)

    await page.getByTestId('grid-size').selectOption('1')
    await dragBy(page, page.locator('[data-type=rect]'), 3.4, 0)
    expect(Number.isInteger(((await layout(page)).static[0] as { x: number }).x)).toBe(true)
  })

  test('the grid lines follow the step and the option sets the start value', async ({ page }) => {
    await open(page, 'layout=empty')
    const k = await scale(page)
    const size = () => page.locator('.pld-grid').evaluate((el) => getComputedStyle(el).backgroundSize)
    expect(await size()).toContain(`${(2.5 * k).toFixed(2).replace(/0+$/, '')}`) // minor lines every 2.5 mm
    await page.getByTestId('grid-size').selectOption('5')
    expect(await size()).toContain(`${(5 * k).toFixed(2).replace(/0+$/, '')}`)
  })
})

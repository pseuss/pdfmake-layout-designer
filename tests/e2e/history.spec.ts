import { expect, test } from '@playwright/test'
import { dragBy, layout, open } from './helpers'

test.describe('undo and redo', () => {
  test('toolbar buttons undo and redo a drag, an add and a delete', async ({ page }) => {
    await open(page, 'layout=empty')
    await expect(page.getByTestId('undo')).toBeDisabled()
    await page.getByTestId('add-rect').click()
    const added = (await layout(page)).static[0] as { x: number }
    await dragBy(page, page.locator('[data-type=rect]'), 20, 0)
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(added.x + 20)

    await page.getByTestId('undo').click()
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(added.x)
    await page.getByTestId('redo').click()
    expect(((await layout(page)).static[0] as { x: number }).x).toBe(added.x + 20)

    await page.getByTestId('action-delete').click()
    expect((await layout(page)).static).toHaveLength(0)
    await page.getByTestId('undo').click()
    expect((await layout(page)).static).toHaveLength(1)
    await page.getByTestId('undo').click()
    await page.getByTestId('undo').click()
    expect((await layout(page)).static).toHaveLength(0)
    await expect(page.getByTestId('undo')).toBeDisabled()
    await expect(page.getByTestId('redo')).toBeEnabled()
  })

  test('keyboard shortcuts Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.getByTestId('add-text').click()
    await page.getByTestId('stage').focus()
    await page.keyboard.press('Control+z')
    expect((await layout(page)).static.map((e) => e.type)).toEqual(['rect'])
    await page.keyboard.press('Control+Shift+z')
    expect((await layout(page)).static.map((e) => e.type)).toEqual(['rect', 'text'])
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+y')
    expect((await layout(page)).static).toHaveLength(2)
  })

  test('typing in a property field is one undo step and the panel follows the restored value', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-text').click()
    await page.getByTestId('content').click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Hallo Welt')
    expect(((await layout(page)).static[0] as { content: string }).content).toBe('Hallo Welt')
    await page.getByTestId('undo').click()
    expect(((await layout(page)).static[0] as { content: string }).content).toBe('Text')
    await expect(page.getByTestId('content')).toHaveValue('Text')
  })

  test('undo notifies the host through onChange; the API exposes undo, redo and their state', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    const before = await page.evaluate(() => (window as any).__app.changes.length)
    const state = await page.evaluate(() => {
      const d = (window as any).__app.designer
      const a = [d.canUndo, d.canRedo]
      d.undo()
      return { a, afterUndo: [d.canUndo, d.canRedo], changes: (window as any).__app.changes.length, static: d.getLayout().static.length }
    })
    expect(state).toEqual({ a: [true, false], afterUndo: [false, true], changes: before + 1, static: 0 })
  })

  test('setLayout from the host starts a fresh history', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('add-rect').click()
    await page.evaluate(() => (window as any).__app.designer.setLayout({ schemaVersion: 1 }))
    await expect(page.getByTestId('undo')).toBeDisabled()
  })
})

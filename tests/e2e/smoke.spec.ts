import { expect, test } from '@playwright/test'

test('designer mounts and renders the invoice layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await page.waitForSelector('html[data-ready=true]')
  await expect(page.getByTestId('designer')).toBeVisible()
  await expect(page.getByTestId('el-addr')).toBeVisible()
  await page.screenshot({ path: process.env.SHOT ?? 'test-results/smoke.png' })
  expect(errors).toEqual([])
})

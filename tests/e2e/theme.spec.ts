import { expect, test, type Page } from '@playwright/test'
import { expectNoErrors, open } from './helpers'

const css = (page: Page, selector: string, prop: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
const root = (page: Page) => page.getByTestId('designer')

test.describe('theme: light and dark', () => {
  test('default is a plain light design: white buttons with a thin border, no coloured fill', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    const errors = await open(page)
    await expect(root(page)).toHaveAttribute('data-theme', 'light')
    expect(await css(page, '[data-testid=add-rect]', 'background-color')).toBe('rgb(255, 255, 255)')
    expect(await css(page, '[data-testid=add-rect]', 'border-top-width')).toBe('1px')
    expect(await css(page, '[data-testid=add-rect]', 'color')).toBe('rgb(24, 24, 27)')
    expect(await css(page, '[data-testid=designer]', 'background-color')).toBe('rgb(244, 244, 245)')
    expectNoErrors(errors)
  })

  test('auto follows the operating system and reacts live to changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await open(page)
    await expect(root(page)).toHaveAttribute('data-theme', 'dark')
    expect(await css(page, '[data-testid=add-rect]', 'background-color')).toBe('rgb(24, 24, 27)')
    expect(await css(page, '[data-testid=add-rect]', 'color')).toBe('rgb(250, 250, 250)')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(root(page)).toHaveAttribute('data-theme', 'light')
  })

  test('auto follows the host page: <html class="dark"> and data-theme beat the OS setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await open(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(root(page)).toHaveAttribute('data-theme', 'dark')
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await expect(root(page)).toHaveAttribute('data-theme', 'dark')
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await expect(root(page)).toHaveAttribute('data-theme', 'light')
  })

  test('an explicit theme ignores OS and host page; setTheme switches at runtime', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await open(page, 'theme=light')
    await expect(root(page)).toHaveAttribute('data-theme', 'light')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(root(page)).toHaveAttribute('data-theme', 'light')
    await page.evaluate(() => (window as any).__app.designer.setTheme('dark'))
    await expect(root(page)).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => (window as any).__app.designer.getTheme())).toBe('dark')
    await page.evaluate(() => (window as any).__app.designer.setTheme('auto'))
    await expect(root(page)).toHaveAttribute('data-theme', 'dark') // html.dark is still set
  })

  test('dark mode darkens the chrome but keeps the paper white', async ({ page }) => {
    await open(page, 'theme=dark')
    expect(await css(page, '[data-testid=page]', 'background-color')).toBe('rgb(255, 255, 255)')
    expect(await css(page, '.pld-stage', 'background-color')).toBe('rgb(39, 39, 42)')
    expect(await css(page, '.pld-left', 'background-color')).toBe('rgb(24, 24, 27)')
    expect(await css(page, '[data-testid=designer]', 'color-scheme')).toBe('dark')
    await page.getByTestId('add-text').click()
    expect(await css(page, '[data-testid=content]', 'background-color')).toBe('rgb(24, 24, 27)')
  })
})

test.describe('primary colour', () => {
  test('is passed as an option and drives selection, tabs, handles and the content box', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await open(page, 'primary=%23d946ef')
    await page.locator('[data-id=meta]').click()
    expect(await css(page, '[data-testid=designer]', '--pld-primary')).toBe('#d946ef')
    expect(await css(page, '[data-id=meta]', 'outline-color')).toBe('rgb(217, 70, 239)')
    expect(await css(page, '[data-testid=tab-properties]', 'border-bottom-color')).toBe('rgb(217, 70, 239)')
    expect(await css(page, '[data-id=meta] [data-handle=e]', 'border-top-color')).toBe('rgb(217, 70, 239)')
    expect(await css(page, '[data-testid=content-box]', 'border-top-color')).toBe('rgb(217, 70, 239)')
    expect(await css(page, '[data-testid=view-first]', 'border-top-color')).toBe('rgb(217, 70, 239)') // pressed button
  })

  test('text on the primary colour is white on dark colours and dark on light ones', async ({ page }) => {
    await open(page, 'primary=%230f766e')
    expect(await css(page, '[data-testid=designer]', '--pld-on-primary')).toBe('#ffffff')
    expect(await css(page, '[data-testid=content-box-label]', 'color')).toBe('rgb(255, 255, 255)')
    await page.evaluate(() => (window as any).__app.designer.setPrimaryColor('#facc15'))
    expect(await css(page, '[data-testid=designer]', '--pld-on-primary')).toBe('#111827')
    expect(await css(page, '[data-testid=content-box-label]', 'color')).toBe('rgb(17, 24, 39)')
    expect(await css(page, '[data-testid=content-box-label]', 'background-color')).toBe('rgb(250, 204, 21)')
  })

  test('accepts #rgb, rejects other formats with a warning, and undefined restores the default', async ({ page }) => {
    await open(page)
    const warnings: string[] = []
    page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
    await page.evaluate(() => (window as any).__app.designer.setPrimaryColor('#f00'))
    expect(await css(page, '[data-testid=designer]', '--pld-primary')).toBe('#ff0000')
    await page.evaluate(() => (window as any).__app.designer.setPrimaryColor('red'))
    expect(await css(page, '[data-testid=designer]', '--pld-primary')).toBe('#ff0000') // unchanged
    expect(warnings.join(' ')).toContain('primaryColor must be a hex colour')
    await page.evaluate(() => (window as any).__app.designer.setPrimaryColor(undefined))
    expect(await css(page, '[data-testid=designer]', '--pld-primary')).toBe('#2563eb')
  })

  test('works in dark mode too (soft selection backgrounds blend with the dark surface)', async ({ page }) => {
    await open(page, 'theme=dark&primary=%2314b8a6')
    await page.getByTestId('layer-sep').click()
    const bg = await css(page, '[data-testid=layer-sep]', 'background-color')
    const nums = bg.match(/[\d.]+/g)!.map(Number)
    const [r, g, b] = (bg.startsWith('color(') ? nums.slice(-3).map((v) => v * 255) : nums) as [number, number, number] // computed color-mix() comes back as color(srgb 0.1 0.2 0.3)
    expect(Math.max(r, g, b)).toBeLessThan(90) // a dark tinted surface, not a pale pastel
    expect(g).toBeGreaterThan(r) // tinted towards teal
  })
})

test('screenshots of both themes (visual check)', async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 })
  const dir = process.env.SHOTS
  for (const theme of ['light', 'dark']) {
    await open(page, `theme=${theme}&primary=%230d9488`)
    await page.getByTestId('flowcard-2').click()
    if (dir) await page.screenshot({ path: `${dir}/theme-${theme}.png` })
  }
})

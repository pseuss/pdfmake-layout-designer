import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { expectNoErrors, layout, open } from './helpers'

const asset = (name: string) => fileURLToPath(new URL(`../../fixtures/assets/${name}`, import.meta.url))

/** Creates an image in the browser (so no huge fixture files are needed) and adds it through the Designer API. */
async function addGenerated(page: Page, kind: 'noise-jpeg' | 'transparent-png', w: number, h: number): Promise<void> {
  await page.evaluate(
    async ({ kind, w, h }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      if (kind === 'noise-jpeg') {
        const img = ctx.createImageData(w, h)
        let seed = 12345
        for (let i = 0; i < img.data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0
          img.data[i] = seed >>> 24
          img.data[i + 1] = (seed >>> 16) & 255
          img.data[i + 2] = (seed >>> 8) & 255
          img.data[i + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
      } else {
        ctx.fillStyle = '#c0392b'
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, h / 2 - 5, 0, Math.PI * 2)
        ctx.fill() // everything outside the circle stays transparent
      }
      const type = kind === 'noise-jpeg' ? 'image/jpeg' : 'image/png'
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), type, 0.95))
      await (window as any).__app.designer.addImage(blob)
    },
    { kind, w, h },
  )
}

const dims = (page: Page, dataUrl: string) =>
  page.evaluate(
    (src) =>
      new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = src
      }),
    dataUrl,
  )

test.describe('images (R1, R2, 7.2)', () => {
  test('R2: adds a transparent PNG logo unchanged and sizes the element to its aspect ratio', async ({ page }) => {
    const errors = await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('logo.png'))
    await expect(page.getByTestId('panel-title')).toContainText('Bild')
    const l = await layout(page)
    const [key, a] = Object.entries(l.assets)[0]!
    expect(a.data.startsWith('data:image/png;base64,')).toBe(true)
    expect(a.data).toBe(`data:image/png;base64,${readFileSync(asset('logo.png')).toString('base64')}`)
    expect([a.w, a.h]).toEqual([300, 100])
    const el = l.static[0] as any
    expect(el).toMatchObject({ type: 'image', asset: key, w: 45, h: 15 })
    expectNoErrors(errors)
  })

  test('R1: a JPEG that already fits is stored without re-encoding', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('briefpapier.jpg'))
    await expect.poll(async () => Object.keys((await layout(page)).assets).length).toBe(1)
    const a = Object.values((await layout(page)).assets)[0]!
    expect(a.data).toBe(`data:image/jpeg;base64,${readFileSync(asset('briefpapier.jpg')).toString('base64')}`)
  })

  test('downscales large photos to 2480 px, re-encodes as JPEG and warns above 1.5 MB', async ({ page }) => {
    await open(page, 'layout=empty')
    await addGenerated(page, 'noise-jpeg', 3600, 2700)
    const a = Object.values((await layout(page)).assets)[0]!
    expect(a.data.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(await dims(page, a.data)).toEqual({ w: 2480, h: 1860 })
    expect([a.w, a.h]).toEqual([2480, 1860])
    await expect(page.getByTestId('warnings')).toContainText('Großes Bild')
    const warnings = await page.evaluate(() => (window as any).__app.designer.getWarnings())
    expect(warnings.some((w: any) => w.code === 'large-image')).toBe(true)
  })

  test('transparent images stay PNG, also when they are downscaled', async ({ page }) => {
    await open(page, 'layout=empty')
    await addGenerated(page, 'transparent-png', 3000, 1000)
    const a = Object.values((await layout(page)).assets)[0]!
    expect(a.data.startsWith('data:image/png;base64,')).toBe(true)
    expect(await dims(page, a.data)).toEqual({ w: 2480, h: 827 })
  })

  test('a flat opaque PNG logo stays lossless PNG, a noisy opaque PNG photo becomes JPEG', async ({ page }) => {
    await open(page, 'layout=empty')
    const formats = await page.evaluate(async () => {
      const make = async (noise: boolean) => {
        const c = document.createElement('canvas')
        c.width = 600
        c.height = 400
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 600, 400)
        ctx.fillStyle = '#1f3a5f'
        for (let i = 0; i < 20; i++) ctx.fillRect(20 + i * 28, 20, 14, 360) // hard-edged flat graphic
        ctx.font = 'bold 120px sans-serif'
        ctx.fillStyle = '#c0392b'
        ctx.fillText('LOGO', 120, 240)
        if (noise) {
          const img = ctx.getImageData(0, 0, 600, 400)
          let seed = 7
          for (let i = 0; i < img.data.length; i += 4) {
            seed = (seed * 1664525 + 1013904223) >>> 0
            img.data[i] = seed >>> 24
            img.data[i + 1] = (seed >>> 16) & 255
            img.data[i + 2] = (seed >>> 8) & 255
          }
          ctx.putImageData(img, 0, 0)
        }
        return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
      }
      const d = (window as any).__app.designer
      await d.addImage(await make(false))
      await d.addImage(await make(true))
      return Object.values(d.getLayout().assets).map((a: any) => a.data.slice(5, a.data.indexOf(';')))
    })
    expect(formats).toEqual(['image/png', 'image/jpeg'])
  })

  test('SVG logos are kept as SVG text', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('logo.svg'))
    await expect.poll(async () => Object.keys((await layout(page)).assets).length).toBe(1)
    const a = Object.values((await layout(page)).assets)[0]!
    expect(a.data.startsWith('<svg')).toBe(true)
    await expect(page.locator('[data-type=image] img')).toHaveAttribute('src', /^data:image\/svg\+xml/)
  })

  test('rejects files that are not images', async ({ page }) => {
    await open(page, 'layout=empty')
    const message = await page.evaluate(async () => {
      try {
        await (window as any).__app.designer.addImage(new Blob(['hello'], { type: 'text/plain' }))
        return 'accepted'
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(message).toMatch(/Unsupported image type/)
    expect((await layout(page)).static).toEqual([])
  })

  test('replaces the bitmap of an existing image and keeps its position', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('logo.png'))
    await expect.poll(async () => (await layout(page)).static.length).toBe(1)
    const before = await layout(page)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('replace-image').click()])
    await chooser.setFiles(asset('briefpapier.jpg'))
    await expect.poll(async () => Object.values((await layout(page)).assets)[0]!.data.startsWith('data:image/jpeg')).toBe(true)
    const after = await layout(page)
    expect(after.static).toEqual(before.static)
    expect(Object.keys(after.assets)).toEqual(Object.keys(before.assets))
  })

  test('removes assets that no element uses any more when the layout is read', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('logo.png'))
    await expect.poll(async () => (await layout(page)).static.length).toBe(1)
    await page.getByTestId('action-delete').click()
    expect((await layout(page)).static).toEqual([])
    expect((await layout(page)).assets).toEqual({})
    // the emitted layout is pruned too
    expect(await page.evaluate(() => (window as any).__app.changes.at(-1).assets)).toEqual({})
  })

  test('one asset can be used by several elements (shared by id, stored once)', async ({ page }) => {
    await open(page, 'layout=empty')
    await page.getByTestId('file-input').setInputFiles(asset('logo.png'))
    await expect.poll(async () => (await layout(page)).static.length).toBe(1)
    await page.getByTestId('action-duplicate').click()
    const l = await layout(page)
    expect(l.static).toHaveLength(2)
    expect(Object.keys(l.assets)).toHaveLength(1)
    expect(new Set(l.static.map((e) => (e as any).asset)).size).toBe(1)
  })
})

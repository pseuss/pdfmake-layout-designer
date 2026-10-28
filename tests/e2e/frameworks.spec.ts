import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { readPdf } from '../../packages/core/test/pdf'

// Runs against the Next.js (project "next") and the Nuxt (project "nuxt") example app:
// load the layout from the app's "database", edit it, save it with the app's own function, reload, render a PDF on the server.
const dataFile = (app: string) => fileURLToPath(new URL(`../../examples/${app}/.data/layout.json`, import.meta.url))

// both tests share the app's one stored layout file
test.describe.configure({ mode: 'serial' })

test.beforeEach(({}, info) => rmSync(dataFile(info.project.name), { force: true }))

test('SSR page loads, the Designer mounts on the client, edits are saved and loaded again', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()))

  const response = await page.goto('/')
  expect(response!.status()).toBe(200)
  await expect(page.getByTestId('designer')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('status')).toHaveText('new layout') // nothing stored yet: starter layout
  await expect(page.getByTestId('el-addr')).toBeVisible()
  await expect(page.locator('[data-id=meta]')).toContainText('RE-2026-0042') // sample data resolved

  // edit in the Designer -> the app sees the JSON through onChange / v-model
  await page.getByTestId('add-rect').click()
  await expect(page.getByTestId('status')).toHaveText('unsaved changes')

  // the app's own save function writes the JSON
  await page.getByTestId('save').click()
  await expect(page.getByTestId('status')).toHaveText('saved')
  const stored = await (await request.get('/api/layout')).json()
  expect(stored.static.map((e: { type: string }) => e.type)).toEqual(['address', 'text', 'rect'])
  expect(stored.schemaVersion).toBe(1)

  // a fresh visit loads the stored layout from the "database" into the Designer
  await page.reload()
  await expect(page.getByTestId('status')).toHaveText('loaded')
  await expect(page.locator('[data-type=rect]')).toHaveCount(1, { timeout: 30_000 })
  expect(errors.filter((e) => !/favicon|DevTools|\[vite\]/.test(e))).toEqual([])
})

test('the server renders the stored layout to a PDF with the Host App fonts (core in API route / Nitro)', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByTestId('designer')).toBeVisible({ timeout: 30_000 })
  const popup = page.waitForEvent('popup')
  await page.getByTestId('pdf').click()
  await (await popup).close()

  const body = await (await request.get('/api/layout')).text() // empty when nothing is stored
  const starter = body ? JSON.parse(body) : undefined
  const res = await request.post('/api/pdf', {
    data: {
      layout: starter ?? { schemaVersion: 1, page: { defaults: { font: 'Inter' } }, flow: [{ type: 'text', content: 'Hallo {{kunde.name}}' }] },
      data: { kunde: { name: 'Muster GmbH', strasse: 'S 1', ort: 'O' }, rechnung: { nummer: 'RE-1', datum: '2026-10-28' }, summen: { brutto: 1190 }, positionen: [{ beschreibung: 'Beratung', menge: 4, gesamt: 400 }] },
    },
  })
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  const info = await readPdf(new Uint8Array(await res.body()))
  expect(info.numPages).toBeGreaterThanOrEqual(1)
  expect(info.pages[0]!.text).toContain('Muster GmbH')
  expect(info.raw).toMatch(/\+Inter-Regular/)
})

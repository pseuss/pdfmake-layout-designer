// Smoke test for the BUILT packages: ESM + CJS in plain Node, and SSR-safe imports of the UI packages.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../packages/core/package.json', import.meta.url))

const esm = await import('../../packages/core/dist/index.js')
const cjs = require('./dist/index.cjs')
for (const [name, lib] of [['esm', esm], ['cjs', cjs]]) {
  const pdf = await lib.generate({ schemaVersion: 1, flow: [{ type: 'text', content: 'Grüße {{name}}' }] }, { name: 'Welt' })
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-', `${name}: valid PDF`)
  const batch = await lib.generateBatch({ schemaVersion: 1, flow: [{ type: 'text', content: '{{n}}' }] }, [{ n: 1 }, { n: 2 }, { n: 3 }], { onePagePerRecord: true })
  assert.ok(batch.length > pdf.length, `${name}: batch is a bigger PDF`)
  assert.equal(typeof lib.toDocDefinition, 'function')
  console.log(`core ${name}: ok (${pdf.length} bytes, batch ${batch.length} bytes)`)
}

const designer = await import('../../packages/designer/dist/index.js')
assert.equal(typeof designer.Designer, 'function')
const react = await import('../../packages/react/dist/index.js')
assert.equal(typeof react.LayoutDesigner, 'function')
const vue = await import('../../packages/vue/dist/index.js')
assert.ok(vue.LayoutDesigner)
const designerCjs = require('../designer/dist/index.cjs')
assert.equal(typeof designerCjs.Designer, 'function')
console.log('designer, react, vue: importable without a DOM (SSR safe)')

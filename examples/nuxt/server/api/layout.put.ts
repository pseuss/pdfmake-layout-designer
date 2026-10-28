import { saveLayout } from '../../../shared/store.mjs'

export default defineEventHandler(async (event) => {
  await saveLayout(`${process.cwd()}/.data/layout.json`, await readBody(event))
  return { ok: true }
})

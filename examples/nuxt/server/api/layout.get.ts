import { loadLayout } from '../../../shared/store.mjs'

export default defineEventHandler(() => loadLayout(`${process.cwd()}/.data/layout.json`))

import { defineFonts, generate, pdfResponse } from '@pdf-layouter/core'
import { fontFamilies } from '../../../shared/demo-data.mjs'

// On the server the same font declaration resolves to file paths.
const fonts = defineFonts(fontFamilies).at(`${process.cwd()}/public/fonts`)

export default defineEventHandler(async (event) => {
  const { layout, data } = await readBody(event)
  return pdfResponse(await generate(layout, data, { fonts }))
})

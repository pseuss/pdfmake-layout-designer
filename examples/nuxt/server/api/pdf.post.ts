import { generate } from '@pdf-layouter/core'
import { fontFiles } from '../../../shared/demo-data.mjs'

// On the server the font registry holds file paths instead of URLs.
const fonts = fontFiles(`${process.cwd()}/public/fonts`)

export default defineEventHandler(async (event) => {
  const { layout, data } = await readBody(event)
  const pdf = await generate(layout, data, { fonts })
  setHeader(event, 'content-type', 'application/pdf')
  return Buffer.from(pdf)
})

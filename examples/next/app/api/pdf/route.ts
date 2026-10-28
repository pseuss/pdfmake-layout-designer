import { defineFonts, generate, pdfResponse } from '@pdf-layouter/core'
import { fontFamilies } from '../../../../shared/demo-data.mjs'

export const runtime = 'nodejs'

// On the server the same font declaration resolves to file paths.
const fonts = defineFonts(fontFamilies).at(`${process.cwd()}/public/fonts`)

export async function POST(request: Request) {
  const { layout, data } = await request.json()
  return pdfResponse(await generate(layout, data, { fonts }))
}

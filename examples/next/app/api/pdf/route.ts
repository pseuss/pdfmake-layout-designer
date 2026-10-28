import { generate } from '@pdf-layouter/core'
import { fontFiles } from '../../../../shared/demo-data.mjs'

export const runtime = 'nodejs'

// On the server the font registry holds file paths instead of URLs.
const fonts = fontFiles(`${process.cwd()}/public/fonts`)

export async function POST(request: Request) {
  const { layout, data } = await request.json()
  const pdf = await generate(layout, data, { fonts })
  return new Response(Buffer.from(pdf), { headers: { 'content-type': 'application/pdf' } })
}

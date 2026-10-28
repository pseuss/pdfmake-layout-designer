import { defineFonts, generate, generateBatch, pdfResponse as toPdfResponse } from '@pdf-layouter/core'
import { fontFamilies } from '../../shared/demo-data.mjs'
import { createGeneratorService, NotFoundError, parseIds } from '../../shared/generator/service.mjs'

// The "database" and the stored Layouts are JSON files; on the server the font registry holds file paths.
export const service = createGeneratorService({
  dir: `${process.cwd()}/../shared/generator`,
  fonts: defineFonts(fontFamilies).at(`${process.cwd()}/public/fonts`),
  generate,
  generateBatch,
})

export { parseIds }

/** PDF bytes -> response; a missing row becomes a 404. */
export async function pdfResponse(run: () => Promise<{ bytes: Uint8Array; filename: string }>): Promise<Response> {
  try {
    const { bytes, filename } = await run()
    return toPdfResponse(bytes, { filename })
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }
}

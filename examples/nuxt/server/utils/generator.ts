import { generate, generateBatch } from '@pdf-layouter/core'
import { fontFiles } from '../../../shared/demo-data.mjs'
import { createGeneratorService, NotFoundError } from '../../../shared/generator/service.mjs'

// The "database" and the stored Layouts are JSON files; on the server the font registry holds file paths.
export const generatorService = createGeneratorService({
  dir: `${process.cwd()}/../shared/generator`,
  fonts: fontFiles(`${process.cwd()}/public/fonts`),
  generate,
  generateBatch,
})

/** PDF bytes -> response; a missing row becomes a 404. */
export async function sendPdf(event: Parameters<typeof setHeader>[0], run: () => Promise<{ bytes: Uint8Array; filename: string }>) {
  try {
    const { bytes, filename } = await run()
    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'content-disposition', `inline; filename="${filename}"`)
    return Buffer.from(bytes)
  } catch (error) {
    if (error instanceof NotFoundError) throw createError({ statusCode: 404, statusMessage: error.message })
    throw error
  }
}

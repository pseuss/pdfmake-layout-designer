import { describe, expect, it } from 'vitest'
import { withPdfLayouter } from '../src/next'

describe('withPdfLayouter (Next config adapter)', () => {
  it('adds pdfmake and pdf-lib to the server externals and keeps the rest of the config', () => {
    expect(withPdfLayouter({ reactStrictMode: true })).toEqual({ reactStrictMode: true, serverExternalPackages: ['pdfmake', 'pdf-lib'] })
  })

  it('merges with existing externals without duplicates', () => {
    expect(withPdfLayouter({ serverExternalPackages: ['sharp', 'pdfmake'] }).serverExternalPackages).toEqual(['sharp', 'pdfmake', 'pdf-lib'])
  })

  it('works without a config', () => {
    expect(withPdfLayouter().serverExternalPackages).toEqual(['pdfmake', 'pdf-lib'])
  })
})

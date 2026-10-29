import { describe, expect, it } from 'vitest'
import { withLayoutDesigner } from '../src/next'

describe('withLayoutDesigner (Next config adapter)', () => {
  it('adds pdfmake and pdf-lib to the server externals and keeps the rest of the config', () => {
    expect(withLayoutDesigner({ reactStrictMode: true, serverExternalPackages: undefined })).toEqual({ reactStrictMode: true, serverExternalPackages: ['pdfmake', 'pdf-lib'] })
  })

  it('merges with existing externals without duplicates', () => {
    expect(withLayoutDesigner({ serverExternalPackages: ['sharp', 'pdfmake'] }).serverExternalPackages).toEqual(['sharp', 'pdfmake', 'pdf-lib'])
  })

  it('works without a config', () => {
    expect(withLayoutDesigner().serverExternalPackages).toEqual(['pdfmake', 'pdf-lib'])
  })
})

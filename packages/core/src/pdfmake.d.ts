declare module 'pdfmake' {
  interface PdfDocument {
    getBuffer(): Promise<Uint8Array>
  }
  interface PdfMake {
    virtualfs: { writeFileSync(name: string, content: string, encoding?: string): void; existsSync(name: string): boolean }
    setFonts(fonts: Record<string, unknown>): void
    setUrlAccessPolicy(policy: ((url: string) => boolean) | undefined): void
    setLocalAccessPolicy?(policy: ((path: string) => boolean) | undefined): void
    createPdf(docDefinition: Record<string, unknown>, options?: Record<string, unknown>): PdfDocument
  }
  const pdfmake: PdfMake
  export default pdfmake
}

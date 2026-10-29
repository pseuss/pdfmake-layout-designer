/** The packages the Generator needs as plain Node dependencies on the server (pdfmake loads its own fonts and workers). */
const SERVER_EXTERNAL = ['pdfmake', 'pdf-lib']

/**
 * Next.js config adapter: `export default withLayoutDesigner({ ...yourConfig })` in `next.config.mjs`.
 * It keeps pdfmake and pdf-lib out of the server bundle so `generate()` works in route handlers and server actions.
 */
export function withLayoutDesigner<T extends { serverExternalPackages?: string[] }>(config: T = {} as T): T {
  const existing = config.serverExternalPackages ?? []
  return { ...config, serverExternalPackages: [...new Set([...existing, ...SERVER_EXTERNAL])] }
}

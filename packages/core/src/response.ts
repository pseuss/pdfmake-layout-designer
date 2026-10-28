/** A PDF as a standard `Response`: works in Next.js route handlers, Nitro / Nuxt server routes, Hono, Bun and Deno. */
export function pdfResponse(bytes: Uint8Array, options: { filename?: string; download?: boolean; headers?: Record<string, string> } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/pdf', ...options.headers }
  if (options.filename) headers['content-disposition'] = `${options.download ? 'attachment' : 'inline'}; filename="${options.filename.replace(/["\\\r\n]/g, '_')}"`
  return new Response(bytes as BlobPart, { headers })
}

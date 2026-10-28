export interface ImageOptions {
  /** Longest edge in pixels after downscaling (2480 px is A4 at 300 dpi). */
  maxEdgePx: number
  jpegQuality: number
  /** Show a warning above this size. */
  warnAboveKb: number
}

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { maxEdgePx: 2480, jpegQuality: 0.85, warnAboveKb: 1500 }

export interface ProcessedImage {
  /** `data:image/...;base64,...`, or an inline `<svg>` string. */
  data: string
  /** Pixel size of the stored bitmap, or the SVG's declared size when known. */
  w: number
  h: number
  kb: number
  format: 'jpeg' | 'png' | 'svg'
  tooLarge: boolean
}

/** Scales (w, h) down so that the longer edge is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { w, h }
  const k = max / longest
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Decoded size of a base64 data URL in KB. */
export function dataUrlKb(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return ((base64.length * 3) / 4 - padding) / 1024
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h)
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true
  return false
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality))
}

/**
 * Prepares an image for storing in a Layout: SVG is kept as text, bitmaps are downscaled, photos and opaque images
 * become JPEG, images with transparency stay PNG. Untouched bitmaps that already fit are not re-encoded.
 */
export async function processImage(file: Blob, options: Partial<ImageOptions> = {}): Promise<ProcessedImage> {
  const o = { ...DEFAULT_IMAGE_OPTIONS, ...options }

  if (file.type === 'image/svg+xml') {
    const text = (await file.text()).trim()
    if (!/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(text)) throw new Error('Not a valid SVG file')
    const size = /viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(text)
    return { data: text.replace(/^<\?xml[^>]*\?>\s*/, ''), w: Number(size?.[1] ?? 0) || 300, h: Number(size?.[2] ?? 0) || 100, kb: text.length / 1024, format: 'svg', tooLarge: text.length / 1024 > o.warnAboveKb }
  }
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error(`Unsupported image type "${file.type || 'unknown'}"`)

  const bitmap = await createImageBitmap(file)
  // pdfkit ignores EXIF orientation: when the browser rotated the image, the original bytes cannot be kept
  const raw = await createImageBitmap(file, { imageOrientation: 'none' })
  const rotated = raw.width !== bitmap.width || raw.height !== bitmap.height
  raw.close()
  const target = fitWithin(bitmap.width, bitmap.height, o.maxEdgePx)
  const scaled = target.w !== bitmap.width || target.h !== bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = target.w
  canvas.height = target.h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, target.w, target.h)
  bitmap.close()

  const transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, target.w, target.h)
  let blob: Blob = file
  let format: 'jpeg' | 'png'
  if (file.type === 'image/jpeg') {
    format = 'jpeg'
    if (scaled || rotated) blob = await canvasToBlob(canvas, 'image/jpeg', o.jpegQuality)
  } else if (transparent) {
    format = 'png'
    if (scaled || file.type !== 'image/png') blob = await canvasToBlob(canvas, 'image/png')
  } else {
    format = 'jpeg'
    // JPEG has no alpha channel: flatten onto white before encoding
    const flat = document.createElement('canvas')
    flat.width = target.w
    flat.height = target.h
    const flatCtx = flat.getContext('2d')!
    flatCtx.fillStyle = '#ffffff'
    flatCtx.fillRect(0, 0, target.w, target.h)
    flatCtx.drawImage(canvas, 0, 0)
    // opaque PNG/WebP/GIF: JPEG only when PNG is more than twice as big (photos); flat graphics and logos stay lossless PNG
    const jpeg = await canvasToBlob(flat, 'image/jpeg', o.jpegQuality)
    const png = file.type === 'image/png' && !scaled ? file : await canvasToBlob(canvas, 'image/png')
    if (png.size <= jpeg.size * 2) {
      format = 'png'
      blob = png
    } else {
      blob = jpeg
    }
  }
  const data = await readAsDataUrl(blob)
  const kb = dataUrlKb(data)
  return { data, w: target.w, h: target.h, kb, format, tooLarge: kb > o.warnAboveKb }
}

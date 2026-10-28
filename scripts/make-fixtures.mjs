// Generates deterministic image fixtures (stationery, logo) without any external tools.
import { writeFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const out = (name) => new URL(`../fixtures/assets/${name}`, import.meta.url)

// ---- stationery: A4 at 100 dpi ---------------------------------------------
{
  const w = 827, h = 1169
  const data = Buffer.alloc(w * h * 4)
  const px = (x, y, r, g, b) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255 }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, 255, 255, 255)
  for (let y = 0; y < 70; y++) for (let x = 0; x < w; x++) px(x, y, 31 + Math.round((x / w) * 40), 58 + Math.round((x / w) * 50), 95 + Math.round((x / w) * 60)) // header gradient
  for (let y = h - 50; y < h; y++) for (let x = 0; x < w; x++) px(x, y, 238, 241, 246) // footer band
  for (const mm of [105, 210]) { const y = Math.round(mm * 100 / 25.4); for (let x = 10; x < 30; x++) px(x, y, 120, 120, 120) } // fold marks
  for (let y = 100; y < 1000; y++) for (let x = 0; x < 6; x++) px(x, y, 31, 58, 95) // edge accent
  writeFileSync(out('briefpapier.jpg'), jpeg.encode({ data, width: w, height: h }, 85).data)
}

// ---- logo with transparency -------------------------------------------------
{
  const png = new PNG({ width: 300, height: 100 })
  for (let y = 0; y < 100; y++) for (let x = 0; x < 300; x++) {
    const i = (y * 300 + x) * 4
    const inCircle = (x - 50) ** 2 + (y - 50) ** 2 < 40 ** 2
    const inBar = x > 110 && x < 280 && y > 35 && y < 65
    png.data[i] = inCircle ? 31 : 90; png.data[i + 1] = inCircle ? 58 : 130; png.data[i + 2] = inCircle ? 95 : 190
    png.data[i + 3] = inCircle || inBar ? 255 : 0
  }
  writeFileSync(out('logo.png'), PNG.sync.write(png))
}

writeFileSync(out('logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><circle cx="50" cy="50" r="40" fill="#1F3A5F"/><rect x="110" y="35" width="170" height="30" rx="6" fill="#5A82BE"/></svg>\n')
console.log('fixtures written')

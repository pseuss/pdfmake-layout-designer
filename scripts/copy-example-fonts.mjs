// Copies the Google Fonts fixtures into an example app's public folder (usage: node copy-example-fonts.mjs <target-dir>).
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const source = new URL('../fixtures/fonts/', import.meta.url).pathname
const target = resolve(process.cwd(), process.argv[2] ?? 'public/fonts')
mkdirSync(target, { recursive: true })
for (const file of readdirSync(source).filter((f) => f.endsWith('.ttf'))) cpSync(resolve(source, file), resolve(target, file))
console.log(`fonts copied to ${target}`)

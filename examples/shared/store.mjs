// A stand-in for the Host App's database: one layout JSON in a file. Real apps would use their DB here.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function loadLayout(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export async function saveLayout(file, layout) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(layout))
}

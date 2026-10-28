import { loadLayout, saveLayout } from '../../../../shared/store.mjs'

const FILE = `${process.cwd()}/.data/layout.json`

export async function GET() {
  return Response.json(await loadLayout(FILE))
}

export async function PUT(request: Request) {
  await saveLayout(FILE, await request.json())
  return Response.json({ ok: true })
}

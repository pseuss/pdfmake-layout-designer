import { service } from '../../../../lib/generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await service.customers())
}

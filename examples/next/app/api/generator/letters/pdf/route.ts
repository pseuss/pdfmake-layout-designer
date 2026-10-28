import { parseIds, pdfResponse, service } from '../../../../../lib/generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// one personalised letter per customer in a single PDF; `?ids=1,2,3` picks the recipients
export const GET = (request: Request) => pdfResponse(() => service.lettersPdf(parseIds(new URL(request.url).searchParams.get('ids'))))

import { pdfResponse, service } from '../../../../../lib/generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// all invoices in one PDF
export const GET = () => pdfResponse(() => service.allInvoicesPdf())

export default defineEventHandler((event) => sendPdf(event, () => generatorService.allInvoicesPdf()))

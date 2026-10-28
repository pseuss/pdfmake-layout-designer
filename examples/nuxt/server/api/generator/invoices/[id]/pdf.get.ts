export default defineEventHandler((event) => sendPdf(() => generatorService.invoicePdf(getRouterParam(event, 'id'))))

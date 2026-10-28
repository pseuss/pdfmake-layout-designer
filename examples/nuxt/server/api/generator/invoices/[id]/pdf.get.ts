export default defineEventHandler((event) => sendPdf(event, () => generatorService.invoicePdf(getRouterParam(event, 'id'))))

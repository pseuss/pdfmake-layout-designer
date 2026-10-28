import { parseIds } from '../../../../../shared/generator/service.mjs'

// one personalised letter per customer in a single PDF; `?ids=1,2,3` picks the recipients
export default defineEventHandler((event) => sendPdf(event, () => generatorService.lettersPdf(parseIds(String(getQuery(event).ids ?? '')))))

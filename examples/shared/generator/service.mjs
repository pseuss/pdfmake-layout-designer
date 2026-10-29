// The Host App's side of the generator example, shared by the Node, Next and Nuxt demos:
// reads rows from a JSON "database", loads the stored Layouts, fills them and returns PDF bytes.
// `generate` / `generateBatch` come from pdfmake-layout-designer-core and are passed in, so this file has no dependencies.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { invoiceRecord, letterRecord } from './records.mjs'

export class NotFoundError extends Error {}

/**
 * @param {{ dir: string, fonts: unknown[], generate: Function, generateBatch: Function }} deps
 * `dir` is the folder with db.json and the two layout files; every call reads it again, like a query would.
 */
export function createGeneratorService({ dir, fonts, generate, generateBatch }) {
  const read = async (file) => JSON.parse(await readFile(join(dir, file), 'utf8'))
  const db = async () => read('db.json')

  return {
    customers: async () => (await db()).customers,
    invoices: async () => (await db()).invoices,

    async invoicePdf(id) {
      const [{ customers, invoices }, layout] = await Promise.all([db(), read('invoice.layout.json')])
      const invoice = invoices.find((i) => i.id === Number(id))
      if (!invoice) throw new NotFoundError(`Invoice ${id} not found`)
      return { bytes: await generate(layout, invoiceRecord(invoice, customers), { fonts }), filename: `${invoice.number}.pdf` }
    },

    async allInvoicesPdf() {
      const [{ customers, invoices }, layout] = await Promise.all([db(), read('invoice.layout.json')])
      return { bytes: await generateBatch(layout, invoices.map((i) => invoiceRecord(i, customers)), { fonts }), filename: 'rechnungen.pdf' }
    },

    /** One letter per customer (all when `ids` is empty), in a single PDF. */
    async lettersPdf(ids) {
      const [{ customers }, layout] = await Promise.all([db(), read('letter.layout.json')])
      const chosen = ids?.length ? customers.filter((c) => ids.includes(c.id)) : customers
      if (chosen.length === 0) throw new NotFoundError('No customers selected')
      const date = new Date().toISOString().slice(0, 10)
      return { bytes: await generateBatch(layout, chosen.map((c) => letterRecord(c, date)), { fonts }), filename: 'serienbriefe.pdf' }
    },
  }
}

/** Parses `?ids=1,2,3`. */
export const parseIds = (value) => (value ? value.split(',').map(Number).filter(Number.isFinite) : undefined)

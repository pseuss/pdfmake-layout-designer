// Rows of the database -> the data object a Layout's placeholders read from (pure functions: usable in the browser too).
export const invoiceRecord = (invoice, customers) => ({ invoice, customer: customers.find((c) => c.id === invoice.customerId), items: invoice.items })
export const letterRecord = (customer, date) => ({ recipient: customer, letter: { date, subject: `Einladung zu unserer Hausmesse, ${customer.city}` } })

<script setup lang="ts">
interface Customer { id: number; name: string; zip: string; city: string }
interface Invoice { id: number; number: string; customerId: number; gross: number }

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// data from "the database" (server routes), loaded during SSR
const { data: invoices } = await useFetch<Invoice[]>('/api/generator/invoices')
const { data: customers } = await useFetch<Customer[]>('/api/generator/customers')
const selected = ref<number[]>((customers.value ?? []).map((c) => c.id))
const pdfUrl = ref<string>()
const status = ref('')

// PDFs are generated on the server
async function show(url: string) {
  status.value = 'Erzeuge PDF …'
  const started = performance.now()
  try {
    const blob = await $fetch<Blob>(url, { responseType: 'blob' })
    pdfUrl.value = URL.createObjectURL(blob)
    status.value = `${Math.round(blob.size / 1024)} KB in ${Math.round(performance.now() - started)} ms`
  } catch (error) {
    status.value = `Fehler: ${(error as Error).message}`
  }
}
const customerName = (id: number) => customers.value?.find((c) => c.id === id)?.name
</script>

<template>
  <div style="display: grid; grid-template-columns: minmax(0, 460px) 1fr; gap: 16px; padding: 16px; height: 100vh; box-sizing: border-box; font: 14px system-ui">
    <section style="overflow: auto">
      <p><NuxtLink to="/">← Designer</NuxtLink></p>
      <h1 style="font-size: 18px">Generator</h1>

      <h2 style="font-size: 14px">1 · Rechnungen</h2>
      <table style="width: 100%" data-testid="invoices">
        <tbody>
          <tr v-for="i in invoices" :key="i.id">
            <td>{{ i.number }}</td>
            <td>{{ customerName(i.customerId) }}</td>
            <td style="text-align: right">{{ euro.format(i.gross) }}</td>
            <td><button :data-testid="`invoice-${i.id}`" @click="show(`/api/generator/invoices/${i.id}/pdf`)">PDF</button></td>
          </tr>
        </tbody>
      </table>
      <p><button data-testid="all-invoices" @click="show('/api/generator/invoices/pdf')">Alle Rechnungen als ein PDF</button></p>

      <h2 style="font-size: 14px">2 · Serienbriefe</h2>
      <table style="width: 100%" data-testid="customers">
        <tbody>
          <tr v-for="c in customers" :key="c.id">
            <td><input v-model="selected" type="checkbox" :value="c.id" /></td>
            <td>{{ c.name }}</td>
            <td>{{ c.zip }} {{ c.city }}</td>
          </tr>
        </tbody>
      </table>
      <p>
        <button data-testid="letters" @click="show(`/api/generator/letters/pdf?ids=${selected.join(',')}`)">Serienbriefe erzeugen</button>
        <span data-testid="status" style="margin-left: 8px">{{ status }}</span>
      </p>
    </section>
    <iframe title="PDF" :src="pdfUrl" data-testid="preview" style="width: 100%; height: 100%; border: 1px solid #ddd" />
  </div>
</template>

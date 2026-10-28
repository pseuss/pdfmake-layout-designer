<script setup lang="ts">
import { LayoutDesigner } from '@pdf-layouter/vue'
import type { Layout } from '@pdf-layouter/core'
import { catalog, fontFiles, sampleData, starterLayout } from '../../shared/demo-data.mjs'

// 1. load the stored layout on the server (SSR) – this is where a DB query would happen
const { data: stored } = await useFetch<Layout | null>('/api/layout')
const layout = ref<Layout>((stored.value ?? starterLayout) as Layout)
const status = ref(stored.value ? 'loaded' : 'new layout')
const fonts = fontFiles('/fonts')

// 2. v-model keeps the latest JSON in `layout`; this runs on every edit
watch(layout, () => (status.value = 'unsaved changes'))

// 3. the app's own save function writes it back
async function save() {
  await $fetch('/api/layout', { method: 'PUT', body: layout.value })
  status.value = 'saved'
}

async function pdf() {
  const blob = await $fetch<Blob>('/api/pdf', { method: 'POST', body: { layout: layout.value, data: sampleData }, responseType: 'blob' })
  window.open(URL.createObjectURL(blob))
}
</script>

<template>
  <div style="height: 100vh; display: flex; flex-direction: column">
    <div style="padding: 8px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid #ddd; font: 14px system-ui">
      <button data-testid="save" @click="save">Speichern</button>
      <button data-testid="pdf" @click="pdf">PDF erzeugen (Server)</button>
      <span data-testid="status">{{ status }}</span>
      <NuxtLink to="/generator" style="margin-left: auto">Beispiel: Rechnungen &amp; Serienbriefe →</NuxtLink>
    </div>
    <div style="flex: 1; min-height: 0">
      <ClientOnly>
        <LayoutDesigner v-model="layout" :placeholders="catalog" :sample-data="sampleData" :fonts="fonts" />
      </ClientOnly>
    </div>
  </div>
</template>

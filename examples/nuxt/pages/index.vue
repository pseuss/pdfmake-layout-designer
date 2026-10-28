<script setup lang="ts">
import { defineFonts } from '@pdf-layouter/core'
import type { Layout, LayoutInput } from '@pdf-layouter/core'
import { useLayoutDocument } from '@pdf-layouter/vue'
import { catalog, fontFamilies, sampleData, starterLayout } from '../../shared/demo-data.mjs'

// load the stored layout on the server (SSR) – this is where a DB query would happen
const { data: stored } = await useFetch<Layout | null>('/api/layout')

// edit and save with the app's own function; `layout` is the v-model of the Designer
const { layout, status, save } = useLayoutDocument({
  initial: stored.value,
  fallback: starterLayout as LayoutInput,
  save: (value) => $fetch('/api/layout', { method: 'PUT', body: value }),
})
const labels = { loading: 'loading…', new: 'new layout', loaded: 'loaded', dirty: 'unsaved changes', saving: 'saving…', saved: 'saved', error: 'error' } as const
const fonts = defineFonts(fontFamilies).at('/fonts') // the same declaration the server uses, resolved to URLs

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
      <span data-testid="status">{{ labels[status] }}</span>
      <NuxtLink to="/generator" style="margin-left: auto">Beispiel: Rechnungen &amp; Serienbriefe →</NuxtLink>
    </div>
    <div style="flex: 1; min-height: 0">
      <LayoutDesigner v-model="layout" :placeholders="catalog" :sample-data="sampleData" :fonts="fonts" />
    </div>
  </div>
</template>

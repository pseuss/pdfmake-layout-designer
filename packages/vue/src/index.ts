import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type PropType } from 'vue'
import type { Data, FontRegistry, Layout, LayoutInput } from 'pdfmake-layout-designer-core'
import { Designer, LayoutDocument, pickDesignerOptions, type DocumentStatus, type LayoutDocumentOptions, type ImageOptions, type Locale, type PlaceholderCatalog, type ThemeMode } from 'pdfmake-layout-designer'

/**
 * Vue 3 wrapper around the framework-agnostic Designer (`v-model` carries the Layout JSON).
 * In Nuxt wrap it in `<ClientOnly>`: the Designer needs the DOM.
 */
export const LayoutDesigner = defineComponent({
  name: 'LayoutDesigner',
  props: {
    modelValue: { type: Object as PropType<Layout | LayoutInput>, default: undefined },
    placeholders: { type: Object as PropType<PlaceholderCatalog>, default: undefined },
    sampleData: { type: Object as PropType<Data>, default: undefined },
    fonts: { type: Array as PropType<FontRegistry>, default: undefined },
    locale: { type: String as PropType<Locale>, default: undefined },
    images: { type: Object as PropType<Partial<ImageOptions>>, default: undefined },
    theme: { type: String as PropType<ThemeMode>, default: undefined },
    primaryColor: { type: String, default: undefined },
    grid: { type: Number, default: undefined },
  },
  emits: { 'update:modelValue': (_layout: Layout) => true, ready: (_designer: Designer) => true },
  setup(props, { emit, expose }) {
    const host = ref<HTMLElement | null>(null)
    let designer: Designer | null = null

    onMounted(() => {
      designer = new Designer({
        container: host.value!,
        layout: props.modelValue ? toRaw(props.modelValue) : undefined,
        ...pickDesignerOptions(Object.fromEntries(Object.entries(props).map(([key, value]) => [key, toRaw(value)]))),
        onChange: (layout) => emit('update:modelValue', layout),
      })
      emit('ready', designer)
    })

    watch(
      () => props.modelValue,
      (value) => {
        const raw = value ? toRaw(value) : undefined
        // by content, not identity: an echo of the Designer's own output must not reset it
        if (raw && designer && !designer.matches(raw)) designer.setLayout(raw)
      },
    )
    watch(() => props.sampleData, (value) => designer?.setSampleData(value ? toRaw(value) : {}))
    watch(() => props.theme, (value) => designer?.setTheme(value ?? 'auto'))
    watch(() => props.primaryColor, (value) => designer?.setPrimaryColor(value))
    watch(() => props.placeholders, (value) => designer?.setPlaceholders(value ? toRaw(value) : undefined))

    onBeforeUnmount(() => {
      designer?.destroy()
      designer = null
    })

    expose({ getDesigner: () => designer })
    return () => h('div', { ref: host, style: { height: '100%' } })
  },
})

/**
 * Load, edit and save one stored Layout: `const doc = useLayoutDocument({ initial, save })`,
 * then `<LayoutDesigner v-model="doc.layout.value" />` and a button that calls `doc.save()`.
 * Where the JSON lives is up to your `initial` / `load` and `save` functions.
 */
export function useLayoutDocument(options: LayoutDocumentOptions) {
  const doc = new LayoutDocument(options)
  const layout = shallowRef<Layout | LayoutInput | undefined>(doc.snapshot.value)
  const status = ref<DocumentStatus>(doc.snapshot.status)
  const error = shallowRef<Error | undefined>(doc.snapshot.error)
  doc.subscribe(() => {
    status.value = doc.snapshot.status
    error.value = doc.snapshot.error
    if (doc.snapshot.value !== layout.value) layout.value = doc.snapshot.value
  })
  // v-model writes the Designer's output back into `layout`: that is an edit
  watch(layout, (value) => {
    if (value && value !== doc.snapshot.value) doc.change(value as Layout)
  })
  return { layout, status, error, save: () => doc.save() }
}

export { Designer }
export type { Data, Layout, LayoutInput, PlaceholderCatalog, DocumentStatus, LayoutDocumentOptions }

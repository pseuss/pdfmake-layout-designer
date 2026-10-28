import { defineComponent, h, onBeforeUnmount, onMounted, ref, toRaw, watch, type PropType } from 'vue'
import type { Data, FontRegistry, Layout, LayoutInput } from '@pdf-layouter/core'
import { Designer, pickDesignerOptions, type ImageOptions, type Locale, type PlaceholderCatalog, type ThemeMode } from '@pdf-layouter/designer'

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
    let lastEmitted: Layout | LayoutInput | undefined

    onMounted(() => {
      designer = new Designer({
        container: host.value!,
        layout: props.modelValue ? toRaw(props.modelValue) : undefined,
        ...pickDesignerOptions(Object.fromEntries(Object.entries(props).map(([key, value]) => [key, toRaw(value)]))),
        onChange: (layout) => {
          lastEmitted = layout
          emit('update:modelValue', layout)
        },
      })
      lastEmitted = props.modelValue ? toRaw(props.modelValue) : undefined
      emit('ready', designer)
    })

    watch(
      () => props.modelValue,
      (value) => {
        const raw = value ? toRaw(value) : undefined
        if (raw && raw !== lastEmitted) {
          lastEmitted = raw
          designer?.setLayout(raw)
        }
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

export { Designer }
export type { Data, Layout, LayoutInput, PlaceholderCatalog }

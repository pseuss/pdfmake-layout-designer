import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 1

const mm = z.number().finite()
const color = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'expected a hex colour such as #1F3A5F')

/** Shows an element or block only when the condition holds for the Record (`visibleWhen`). */
export const ConditionSchema = z.object({
  path: z.string().min(1),
  /** `exists`: has a non-empty value; `empty`: the opposite; `equals` / `notEquals` compare with `value` as text. */
  op: z.enum(['exists', 'empty', 'equals', 'notEquals']).default('exists'),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
})
export type Condition = z.infer<typeof ConditionSchema>

export const PageRuleSchema = z.enum(['all', 'first', 'notFirst', 'last'])
export type PageRule = z.infer<typeof PageRuleSchema>

// ---- rich text -------------------------------------------------------------

export const RunSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: color.optional(),
  size: z.number().positive().optional(),
})
export type Run = z.infer<typeof RunSchema>

export const RichBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    runs: z.array(RunSchema),
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().default(false),
    items: z.array(z.array(RunSchema)),
  }),
])
export type RichBlock = z.infer<typeof RichBlockSchema>

/** Plain text, a run array (as in the concept example) or full blocks; always normalised to blocks. */
export function toBlocks(input: string | Run[] | RichBlock[]): RichBlock[] {
  if (typeof input === 'string') {
    return input.split(/\n{2,}/).map((part) => ({ type: 'paragraph' as const, runs: [{ text: part }] }))
  }
  if (input.length > 0 && 'text' in (input[0] as object)) {
    return [{ type: 'paragraph', runs: input as Run[] }]
  }
  return input as RichBlock[]
}

export const RichContentSchema = z
  .union([z.string(), z.array(RunSchema), z.array(RichBlockSchema)])
  .transform((v) => toBlocks(v as string | Run[] | RichBlock[]))

// ---- static elements -------------------------------------------------------

const rule = PageRuleSchema.default('all')
const base = { id: z.string().min(1), pages: rule, visibleWhen: ConditionSchema.optional() }
const textStyle = {
  font: z.string().optional(),
  size: z.number().positive().optional(),
  color: color.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
}

export const StaticImageSchema = z.object({ ...base, type: z.literal('image'), asset: z.string(), x: mm, y: mm, w: mm.positive(), h: mm.positive() })
export const StaticRectSchema = z.object({
  ...base,
  type: z.literal('rect'),
  x: mm,
  y: mm,
  w: mm.positive(),
  h: mm.positive(),
  fill: color.optional(),
  stroke: z.object({ color, width: z.number().nonnegative().default(0.5) }).optional(),
  radius: z.number().nonnegative().default(0),
})
export const StaticLineSchema = z.object({
  ...base,
  type: z.literal('line'),
  x1: mm,
  y1: mm,
  x2: mm,
  y2: mm,
  width: z.number().positive().default(0.5),
  color: color.default('#000000'),
  dash: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
})
export const StaticTextSchema = z.object({
  ...base,
  type: z.literal('text'),
  x: mm,
  y: mm,
  w: mm.positive(),
  content: z.string(),
  ...textStyle,
})
export const AddressPresetSchema = z.enum(['DIN5008-A', 'DIN5008-B'])
export type AddressPreset = z.infer<typeof AddressPresetSchema>
export const StaticAddressSchema = z.object({
  id: z.string().min(1),
  pages: PageRuleSchema.default('first'),
  visibleWhen: ConditionSchema.optional(),
  type: z.literal('address'),
  preset: AddressPresetSchema.default('DIN5008-B'),
  /** Small sender line in the return-address zone above the recipient. */
  returnAddress: z.string().optional(),
  content: z.string(),
  ...textStyle,
})

export const StaticElementSchema = z.discriminatedUnion('type', [
  StaticImageSchema,
  StaticRectSchema,
  StaticLineSchema,
  StaticTextSchema,
  StaticAddressSchema,
])
export type StaticElement = z.infer<typeof StaticElementSchema>

// ---- flow blocks -----------------------------------------------------------

export const ColumnSchema = z.object({
  field: z.string().min(1),
  title: z.string().default(''),
  /** '*' fills the remaining width, 'auto' sizes to content, a number is millimetres. */
  width: z.union([z.literal('*'), z.literal('auto'), z.number().positive()]).default('*'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  /** 'text' | 'number' | 'number:2' | 'currency' | 'currency:USD' | 'date' */
  format: z.string().default('text'),
})
export type Column = z.infer<typeof ColumnSchema>

export const TableStyleSchema = z.object({
  headerFill: color.optional(),
  headerColor: color.optional(),
  zebra: z.boolean().default(false),
  zebraFill: color.default('#F6F6F6'),
  borders: z.enum(['none', 'horizontal', 'grid']).default('horizontal'),
  borderColor: color.default('#CCCCCC'),
  size: z.number().positive().optional(),
})
export type TableStyle = z.infer<typeof TableStyleSchema>

const flowCommon = { font: z.string().optional(), visibleWhen: ConditionSchema.optional() }

export const FlowTextSchema = z.object({ ...flowCommon, type: z.literal('text'), content: RichContentSchema, margin: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() })
export const FlowTableSchema = z.object({
  ...flowCommon,
  type: z.literal('table'),
  source: z.string().min(1),
  columns: z.array(ColumnSchema).min(1),
  style: TableStyleSchema.default(() => TableStyleSchema.parse({})),
})
export const TotalsRowSchema = z.object({ label: z.string(), value: z.string(), bold: z.boolean().default(false) })
export const FlowTotalsSchema = z.object({
  ...flowCommon,
  type: z.literal('totals'),
  rows: z.array(TotalsRowSchema).min(1),
  width: mm.positive().default(80),
  align: z.enum(['left', 'right']).default('right'),
})
export const FlowDynamicSectionsSchema = z.object({
  ...flowCommon,
  type: z.literal('dynamicSections'),
  source: z.string().min(1),
  styles: z
    .object({
      table: TableStyleSchema.default(() => TableStyleSchema.parse({})),
      text: z
        .object({ margin: z.tuple([z.number(), z.number(), z.number(), z.number()]).default(() => [0, 4, 0, 4] as [number, number, number, number]) })
        .default(() => ({ margin: [0, 4, 0, 4] as [number, number, number, number] })),
    })
    .default(() => ({ table: TableStyleSchema.parse({}), text: { margin: [0, 4, 0, 4] as [number, number, number, number] } })),
})
export const FlowPageBreakSchema = z.object({ type: z.literal('pageBreak'), visibleWhen: ConditionSchema.optional() })

export const FlowBlockSchema = z.discriminatedUnion('type', [
  FlowTextSchema,
  FlowTableSchema,
  FlowTotalsSchema,
  FlowDynamicSectionsSchema,
  FlowPageBreakSchema,
])
export type FlowBlock = z.infer<typeof FlowBlockSchema>

// ---- page ------------------------------------------------------------------

export const PAGE_SIZES_MM = {
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  LETTER: { w: 215.9, h: 279.4 },
  LEGAL: { w: 215.9, h: 355.6 },
} as const

/** DIN 5008 address windows in mm: recipient zone is 85 mm wide, below the return-address zone. */
export const ADDRESS_PRESETS = {
  'DIN5008-A': { x: 20, y: 27, w: 85, h: 45, returnHeight: 17.7 },
  'DIN5008-B': { x: 20, y: 45, w: 85, h: 45, returnHeight: 12.7 },
} as const

const BoxSchema = z.object({ top: mm.nonnegative(), bottom: mm.nonnegative(), left: mm.nonnegative(), right: mm.nonnegative() })
export type Box = z.infer<typeof BoxSchema>

export const PageSchema = z.object({
  size: z.enum(['A3', 'A4', 'A5', 'LETTER', 'LEGAL']).default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  contentBox: z
    .object({ first: BoxSchema, follow: BoxSchema })
    .default(() => ({ first: { top: 95, bottom: 30, left: 25, right: 20 }, follow: { top: 30, bottom: 30, left: 25, right: 20 } })),
  defaults: z
    .object({ font: z.string().default('Roboto'), size: z.number().positive().default(10), color: color.default('#222222') })
    .default(() => ({ font: 'Roboto', size: 10, color: '#222222' })),
  footer: z
    .object({ content: z.string(), align: z.enum(['left', 'center', 'right']).default('right'), size: z.number().positive().default(8), font: z.string().optional() })
    .optional(),
})

export const AssetSchema = z.object({
  /** `data:image/png;base64,...`, `data:image/jpeg;base64,...` or an inline `<svg ...>` string */
  data: z.string().min(1),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
})
export type Asset = z.infer<typeof AssetSchema>

export const LayoutSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  locale: z.string().default('de-DE'),
  currency: z.string().length(3).default('EUR'),
  page: PageSchema.default(() => PageSchema.parse({})),
  assets: z.record(z.string(), AssetSchema).default(() => ({})),
  static: z.array(StaticElementSchema).default(() => []),
  flow: z.array(FlowBlockSchema).default(() => []),
})

export type Layout = z.output<typeof LayoutSchema>
export type LayoutInput = z.input<typeof LayoutSchema>

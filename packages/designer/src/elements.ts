import type { Column, FlowBlock, StaticElement } from '@pdf-layouter/core'
import type { PlaceholderField, PlaceholderList } from './warnings'

type ElementOf<T extends StaticElement['type']> = Extract<StaticElement, { type: T }>

export function newText(id: string): ElementOf<'text'> {
  return { id, type: 'text', pages: 'all', x: 25, y: 60, w: 80, content: 'Text', align: 'left' }
}

export function newRect(id: string): ElementOf<'rect'> {
  return { id, type: 'rect', pages: 'all', x: 25, y: 60, w: 60, h: 20, fill: '#E5ECF6', radius: 0 }
}

export function newLine(id: string): ElementOf<'line'> {
  return { id, type: 'line', pages: 'all', x1: 25, y1: 90, x2: 185, y2: 90, width: 0.5, color: '#999999', dash: 'solid' }
}

export function newAddress(id: string): ElementOf<'address'> {
  return { id, type: 'address', pages: 'first', preset: 'DIN5008-B', content: 'Empfänger\nStraße 1\n12345 Ort', align: 'left' }
}

export function newImage(id: string, asset: string, pxW: number, pxH: number): ElementOf<'image'> {
  const w = Math.min(45, 210 - 50)
  return { id, type: 'image', pages: 'all', asset, x: 25, y: 20, w, h: Math.max(1, Math.round((w * pxH) / pxW * 100) / 100) }
}

const FORMAT_FOR: Record<NonNullable<PlaceholderField['type']>, string> = { text: 'text', number: 'number', currency: 'currency', date: 'date' }

export function columnFor(field: PlaceholderField | { key: string; label?: string; type?: string }): Column {
  const type = (field.type ?? 'text') as keyof typeof FORMAT_FOR
  const numeric = type === 'number' || type === 'currency'
  return { field: field.key, title: field.label ?? field.key, width: numeric ? 28 : '*', align: numeric ? 'right' : 'left', format: FORMAT_FOR[type] ?? 'text' }
}

export function newFlow(type: FlowBlock['type'], lists: PlaceholderList[] = []): FlowBlock {
  switch (type) {
    case 'text':
      return { type: 'text', content: [{ type: 'paragraph', runs: [{ text: 'Text' }] }] }
    case 'table': {
      const list = lists[0]
      const columns = list?.fields.length ? list.fields.slice(0, 4).map(columnFor) : [{ field: 'beschreibung', title: 'Beschreibung', width: '*' as const, align: 'left' as const, format: 'text' }]
      if (columns.length > 1 && columns.every((c) => c.width !== '*')) columns[0]!.width = '*'
      return { type: 'table', source: list?.key ?? 'positionen', columns, style: { zebra: false, zebraFill: '#F6F6F6', borders: 'horizontal', borderColor: '#CCCCCC', headerFill: '#EEEEEE' } }
    }
    case 'totals':
      return { type: 'totals', width: 80, align: 'right', rows: [{ label: 'Netto', value: '', bold: false }, { label: 'USt', value: '', bold: false }, { label: 'Gesamt', value: '', bold: true }] }
    case 'dynamicSections':
      return {
        type: 'dynamicSections',
        source: 'abschnitte',
        styles: { table: { zebra: false, zebraFill: '#F6F6F6', borders: 'horizontal', borderColor: '#CCCCCC', headerFill: '#EEEEEE' }, text: { margin: [0, 4, 0, 4] } },
      }
    case 'pageBreak':
      return { type: 'pageBreak' }
  }
}

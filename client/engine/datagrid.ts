// Real Command UI-Engine · Datentabelle
// =============================================================================
// Eine Tabelle, die zehntausend Zeilen verträgt: nur der sichtbare Ausschnitt
// liegt im DOM, der Rest ist Rechnung. Dazu Sortierung, verstellbare Spalten,
// Auswahl und vollständige Tastaturbedienung.
//
// Warum nicht einfach <table> mit allen Zeilen: Bei 24 000 Einheiten im Spiel
// wären das über hunderttausend Elemente. Das Layout allein dauert dann länger
// als ein Simulationsschritt.

import { h, For, text, insert } from './render.ts'
import { signal, computed, effect, onCleanup, untrack, type Accessor } from './signal.ts'
import { Icon } from './icons.ts'
import { EmptyState } from './widgets.ts'
import type { View } from './render.ts'

export interface Column<T> {
  id: string
  header: string
  /** Zellinhalt. Rückgabe darf Text oder ein Element sein. */
  cell: (row: T, index: number) => View
  /** Für Sortierung und Suche. */
  value?: (row: T) => string | number
  width?: number
  minWidth?: number
  align?: 'left' | 'right' | 'center'
  /** Zahlen in Spalten ausrichten: dieselbe Ziffernbreite. */
  numeric?: boolean
  sortable?: boolean
  /** Spalte bei wenig Platz ausblenden. */
  priority?: number
}

export interface TableProps<T> {
  rows: Accessor<readonly T[]>
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  /** Zeilenhöhe in Pixeln. Muss konstant sein, sonst rechnet die Virtualisierung falsch. */
  rowHeight?: number
  /** Wie viele Zeilen über den Rand hinaus gerendert werden. */
  overscan?: number
  sort?: Accessor<{ column: string, dir: 'asc' | 'desc' } | null>
  onSort?: (s: { column: string, dir: 'asc' | 'desc' } | null) => void
  selected?: Accessor<Set<string | number>>
  onSelect?: (keys: Set<string | number>) => void
  onActivate?: (row: T) => void
  onContextMenu?: (row: T, e: MouseEvent) => void
  empty?: View
  /** Zeilenklasse für Zustände wie „beschädigt“ oder „feindlich“. */
  rowClass?: (row: T) => string
}

export function Table<T>(p: TableProps<T>): HTMLElement {
  const rowHeight = p.rowHeight ?? 26
  const overscan = p.overscan ?? 6
  const [scrollTop, setScrollTop] = signal(0)
  const [viewport, setViewport] = signal(400)
  const [widths, setWidths] = signal<Record<string, number>>(
    Object.fromEntries(p.columns.map(c => [c.id, c.width ?? 120])))

  const total = () => p.rows().length
  const firstIndex = () => Math.max(0, Math.floor(scrollTop() / rowHeight) - overscan)
  const lastIndex = () => Math.min(total(), Math.ceil((scrollTop() + viewport()) / rowHeight) + overscan)
  const window_ = computed(() => {
    const rows = p.rows()
    const from = firstIndex(), to = lastIndex()
    const slice: { row: T, index: number }[] = []
    for (let i = from; i < to; i++) slice.push({ row: rows[i], index: i })
    return slice
  })

  const [cursor, setCursor] = signal(-1)

  // --- Sortierung ---------------------------------------------------------
  const toggleSort = (col: Column<T>) => {
    if (!col.sortable || !p.onSort) return
    const cur = p.sort?.() ?? null
    if (!cur || cur.column !== col.id) p.onSort({ column: col.id, dir: 'asc' })
    else if (cur.dir === 'asc') p.onSort({ column: col.id, dir: 'desc' })
    else p.onSort(null)
  }

  // --- Auswahl ------------------------------------------------------------
  const isSelected = (row: T) => !!p.selected?.().has(p.rowKey(row))
  const select = (row: T, e: MouseEvent | KeyboardEvent) => {
    if (!p.onSelect) return
    const key = p.rowKey(row)
    const cur = new Set(p.selected?.() ?? [])
    if (e.shiftKey && cursor() >= 0) {
      const rows = untrack(p.rows)
      const from = Math.min(cursor(), rows.indexOf(row)), to = Math.max(cursor(), rows.indexOf(row))
      for (let i = from; i <= to; i++) cur.add(p.rowKey(rows[i]))
    } else if (e.ctrlKey || e.metaKey) {
      cur.has(key) ? cur.delete(key) : cur.add(key)
    } else {
      cur.clear()
      cur.add(key)
    }
    p.onSelect(cur)
  }

  // --- Spaltenbreiten -----------------------------------------------------
  const startResize = (col: Column<T>, e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths()[col.id]
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    document.body.classList.add('rc-resizing-h')
    const move = (ev: PointerEvent) => {
      const w = Math.max(col.minWidth ?? 48, startW + ev.clientX - startX)
      setWidths(m => ({ ...m, [col.id]: w }))
    }
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      document.body.classList.remove('rc-resizing-h')
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  const gridTemplate = () => p.columns.map(c => widths()[c.id] + 'px').join(' ')

  // --- Aufbau -------------------------------------------------------------
  let body!: HTMLElement

  const header = h('div', { class: 'rc-table-head', style: { gridTemplateColumns: gridTemplate }, role: 'row' },
    ...p.columns.map(col => h('div', {
      class: { 'rc-th': true, 'is-numeric': !!col.numeric, 'is-sortable': !!col.sortable },
      role: 'columnheader',
      style: { textAlign: col.align ?? (col.numeric ? 'right' : 'left') },
      'aria-sort': () => {
        const s = p.sort?.()
        return s && s.column === col.id ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      },
      onClick: () => toggleSort(col),
    },
      h('span', { class: 'rc-th-label' }, col.header),
      col.sortable && h('span', { class: 'rc-th-sort' }, () => {
        const s = p.sort?.()
        return s && s.column === col.id ? Icon(s.dir === 'asc' ? 'chevronUp' : 'chevronDown', { size: 11 }) : null
      }),
      h('span', { class: 'rc-th-grip', onPointerDown: (e: Event) => startResize(col, e as PointerEvent) }),
    )),
  )

  const rowsView = For(window_, x => p.rowKey(x.row), x => h('div', {
    class: () => ['rc-tr', p.rowClass?.(x.row) ?? '', isSelected(x.row) ? 'is-selected' : '', cursor() === x.index ? 'is-cursor' : ''].filter(Boolean).join(' '),
    role: 'row',
    style: { gridTemplateColumns: gridTemplate, transform: `translateY(${x.index * rowHeight}px)`, height: rowHeight + 'px' },
    'aria-selected': () => String(isSelected(x.row)),
    onClick: (e: Event) => { setCursor(x.index); select(x.row, e as MouseEvent) },
    onDblClick: () => p.onActivate?.(x.row),
    onContextMenu: (e: Event) => {
      const ev = e as MouseEvent
      if (!p.onContextMenu) return
      ev.preventDefault()
      if (!isSelected(x.row)) { setCursor(x.index); select(x.row, ev) }
      p.onContextMenu(x.row, ev)
    },
  },
    ...p.columns.map(col => h('div', {
      class: { 'rc-td': true, 'is-numeric': !!col.numeric },
      role: 'gridcell',
      style: { textAlign: col.align ?? (col.numeric ? 'right' : 'left') },
    }, col.cell(x.row, x.index))),
  ))

  const onKeyDown = (e: Event) => {
    const ev = e as KeyboardEvent
    const rows = p.rows()
    if (!rows.length) return
    let next = cursor()
    if (ev.key === 'ArrowDown') next = Math.min(rows.length - 1, cursor() + 1)
    else if (ev.key === 'ArrowUp') next = Math.max(0, cursor() - 1)
    else if (ev.key === 'Home') next = 0
    else if (ev.key === 'End') next = rows.length - 1
    else if (ev.key === 'PageDown') next = Math.min(rows.length - 1, cursor() + Math.floor(viewport() / rowHeight))
    else if (ev.key === 'PageUp') next = Math.max(0, cursor() - Math.floor(viewport() / rowHeight))
    else if (ev.key === 'Enter') { const r = rows[cursor()]; if (r) p.onActivate?.(r); return }
    else if (ev.key === ' ') { const r = rows[cursor()]; if (r) { ev.preventDefault(); select(r, ev) } return }
    else return
    ev.preventDefault()
    setCursor(next)
    if (rows[next] && p.onSelect && !ev.ctrlKey && !ev.metaKey) select(rows[next], ev)
    // Zeile in Sicht holen
    const top = next * rowHeight
    if (top < scrollTop()) body.scrollTop = top
    else if (top + rowHeight > scrollTop() + viewport()) body.scrollTop = top + rowHeight - viewport()
  }

  const el = h('div', { class: 'rc-table', role: 'grid', 'aria-rowcount': () => String(total()), tabindex: 0, onKeyDown },
    header,
    h('div', {
      class: 'rc-table-body',
      ref: (e: HTMLElement) => { body = e },
      onScroll: (e: Event) => setScrollTop((e.target as HTMLElement).scrollTop),
    },
      h('div', { class: 'rc-table-canvas', style: { height: () => total() * rowHeight + 'px' } }, rowsView),
    ),
  )

  // Sichtbare Höhe messen, damit die Virtualisierung stimmt.
  const ro = new ResizeObserver(entries => setViewport(entries[0].contentRect.height))
  effect(() => { if (body) ro.observe(body) })
  onCleanup(() => ro.disconnect())

  insert(el, () => (total() === 0 ? (p.empty ?? EmptyState({ icon: 'list', title: 'Keine Einträge' })) : null))
  return el
}

// ---------------------------------------------------------------------------
// Sortierhilfe
// ---------------------------------------------------------------------------

/** Sortiert eine Liste nach der Spaltendefinition, stabil und ohne Kopie bei null. */
export function sortRows<T>(rows: readonly T[], columns: Column<T>[], sort: { column: string, dir: 'asc' | 'desc' } | null): readonly T[] {
  if (!sort) return rows
  const col = columns.find(c => c.id === sort.column)
  if (!col?.value) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = col.value!(a), vb = col.value!(b)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'de', { numeric: true }) * dir
  })
}

// ---------------------------------------------------------------------------
// Einfache virtualisierte Liste (Ereignisprotokoll, Chat)
// ---------------------------------------------------------------------------

export interface VirtualListProps<T> {
  items: Accessor<readonly T[]>
  itemKey: (item: T) => string | number
  itemHeight: number
  render: (item: T, index: number) => View
  /** Bei neuen Einträgen ans Ende springen, solange der Nutzer unten steht. */
  follow?: boolean
}

export function VirtualList<T>(p: VirtualListProps<T>): HTMLElement {
  const [scrollTop, setScrollTop] = signal(0)
  const [viewport, setViewport] = signal(300)
  let el!: HTMLElement
  let atBottom = true

  const slice = computed(() => {
    const items = p.items()
    const from = Math.max(0, Math.floor(scrollTop() / p.itemHeight) - 4)
    const to = Math.min(items.length, Math.ceil((scrollTop() + viewport()) / p.itemHeight) + 4)
    const out: { item: T, index: number }[] = []
    for (let i = from; i < to; i++) out.push({ item: items[i], index: i })
    return out
  })

  const view = h('div', {
    class: 'rc-vlist',
    ref: (e: HTMLElement) => { el = e },
    onScroll: (e: Event) => {
      const t = e.target as HTMLElement
      setScrollTop(t.scrollTop)
      atBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 4
    },
  },
    h('div', { class: 'rc-vlist-canvas', style: { height: () => p.items().length * p.itemHeight + 'px' } },
      For(slice, x => p.itemKey(x.item), x => h('div', {
        class: 'rc-vlist-row',
        style: { transform: `translateY(${x.index * p.itemHeight}px)`, height: p.itemHeight + 'px' },
      }, p.render(x.item, x.index))),
    ),
  )

  if (p.follow !== false) {
    effect(() => {
      p.items().length
      if (atBottom && el) queueMicrotask(() => { el.scrollTop = el.scrollHeight })
    })
  }
  const ro = new ResizeObserver(entries => setViewport(entries[0].contentRect.height))
  effect(() => { if (el) ro.observe(el) })
  onCleanup(() => ro.disconnect())
  void text
  return view
}

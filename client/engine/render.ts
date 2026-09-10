// Real Command UI-Engine · Renderer
// =============================================================================
// Reaktives DOM ohne virtuelles DOM. Ein Knoten wird einmal erzeugt; danach
// aktualisieren feingranulare Effekte genau das Attribut, den Text oder die
// Listenzeile, die sich geändert hat.
//
//   h('button', { class: 'btn', disabled: () => busy(), onClick: run }, 'Start')
//   Show(() => selected(), sel => Panel(sel))
//   For(units, u => u.id, u => Row(u))
//
// Jede Eigenschaft, die als Funktion übergeben wird, gilt als reaktiv – außer
// Ereignisbehandlern (Präfix "on" plus Großbuchstabe) und "ref".
//
// Show und For liefern BESCHREIBUNGEN, keine fertigen Knoten. Erst beim
// Einfügen entsteht daraus ein verwalteter Abschnitt zwischen zwei Ankern.
// Dadurch ist es gleichgültig, ob sie in einer reaktiven Funktion stehen: der
// Abschnitt wird genau einmal aufgebaut und danach nur noch gepflegt.

import { effect, scope, onCleanup, untrack, signal, withOwner, type Accessor } from './signal.ts'

// Abschnitte verwalten ihre Kinder SELBST. Würden die Zeilen dem Effekt gehören,
// der sie erzeugt, würde jeder Neudurchlauf des Effekts alle Zeilen entsorgen –
// auch die, die bleiben sollen. Deshalb wird jede Zeile ohne Besitzer angelegt
// und ausschließlich über row.dispose() und das onCleanup des Abschnitts beendet.
const ownScope = <T>(fn: () => T): [T, () => void] => withOwner(null, () => scope(fn))

/**
 * Alles, was sich einfügen lässt. Der Selbstbezug läuft über eine Schnittstelle
 * (ViewList) statt über `View[]`: Ein Typ-Alias, der sich selbst über zwei
 * generische Ecken erreicht, ist für TypeScript ein Zirkel; über eine
 * Schnittstelle ist derselbe Bezug erlaubt und beschreibt dasselbe.
 */
export type View = Node | string | number | boolean | null | undefined | Block | (() => View) | ViewList
export interface ViewList extends Array<View> {}

export interface Props {
  ref?: (el: HTMLElement) => void
  class?: string | Accessor<string> | Record<string, boolean | Accessor<boolean>>
  style?: Record<string, string | number | Accessor<string | number>>
  dataset?: Record<string, string | Accessor<string>>
  /** Direktiven: erhalten das Element und dürfen onCleanup benutzen. */
  use?: ((el: HTMLElement) => void)[]
  [key: string]: unknown
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'ellipse', 'text', 'tspan', 'defs', 'use', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'mask', 'title'])

// Eigenschaften, die als Property statt als Attribut gesetzt werden müssen.
const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate', 'textContent', 'innerHTML', 'muted', 'volume'])

export function h(tag: string, props?: Props | View, ...children: View[]): HTMLElement {
  const el = (SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)) as HTMLElement
  let kids = children
  if (isProps(props)) applyProps(el, props as Props)
  else if (props !== undefined) kids = [props as View, ...children]
  for (const k of kids) insert(el, k)
  return el
}

function isProps(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node) && !isBlock(v)
}

// ---------------------------------------------------------------------------
// Eigenschaften
// ---------------------------------------------------------------------------

function applyProps(el: HTMLElement, props: Props) {
  for (const key in props) {
    const value = props[key]
    if (value === undefined) continue

    if (key === 'ref') { (value as (e: HTMLElement) => void)(el); continue }
    if (key === 'use') { for (const d of value as ((e: HTMLElement) => void)[]) d(el); continue }
    if (key === 'class') { bindClass(el, value as Props['class']); continue }
    if (key === 'style') { bindStyle(el, value as Record<string, unknown>); continue }
    if (key === 'dataset') {
      const map = value as Record<string, unknown>
      for (const k in map) bind(map[k], v => { el.dataset[k] = v == null ? '' : String(v) })
      continue
    }
    if (isEventKey(key)) {
      const type = key.startsWith('on:') ? key.slice(3) : key.slice(2).toLowerCase()
      const handler = value as EventListener
      el.addEventListener(type, handler)
      onCleanup(() => el.removeEventListener(type, handler))
      continue
    }
    bindAttr(el, key, value)
  }
}

const isEventKey = (k: string) => k.startsWith('on:') || (k.length > 2 && k[0] === 'o' && k[1] === 'n' && k[2] >= 'A' && k[2] <= 'Z')

function bind(value: unknown, apply: (v: unknown) => void) {
  if (typeof value === 'function') effect(() => apply((value as Accessor<unknown>)()))
  else apply(value)
}

function bindAttr(el: HTMLElement, key: string, value: unknown) {
  bind(value, v => {
    if (PROPS.has(key)) { (el as unknown as Record<string, unknown>)[key] = v; return }
    if (v === false || v === null || v === undefined) el.removeAttribute(key)
    else el.setAttribute(key, v === true ? '' : String(v))
  })
}

function bindClass(el: HTMLElement, value: Props['class']) {
  if (typeof value === 'string') { el.setAttribute('class', value); return }
  if (typeof value === 'function') {
    let prev: string[] = []
    effect(() => {
      const next = String((value as Accessor<string>)() || '').split(/\s+/).filter(Boolean)
      for (const c of prev) if (!next.includes(c)) el.classList.remove(c)
      for (const c of next) el.classList.add(c)
      prev = next
    })
    return
  }
  const map = value as Record<string, unknown>
  for (const name in map) {
    const parts = name.split(/\s+/).filter(Boolean)
    bind(map[name], v => { for (const c of parts) el.classList.toggle(c, !!v) })
  }
}

const PX = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'gap', 'padding', 'margin',
  'fontSize', 'borderRadius', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'rowGap', 'columnGap'])

function bindStyle(el: HTMLElement, value: Record<string, unknown>) {
  for (const name in value) {
    bind(value[name], v => {
      if (v === null || v === undefined || v === false) el.style.removeProperty(name)
      else if (name.startsWith('--')) el.style.setProperty(name, String(v))
      else (el.style as unknown as Record<string, string>)[name] = typeof v === 'number' && PX.has(name) ? v + 'px' : String(v)
    })
  }
}

// ---------------------------------------------------------------------------
// Abschnitte: Show und For beschreiben einen verwalteten Bereich
// ---------------------------------------------------------------------------

const BLOCK = Symbol('rc.block')

interface Block { [BLOCK]: (parent: Node, end: Node) => void }
const isBlock = (v: unknown): v is Block => !!v && typeof v === 'object' && BLOCK in (v as object)

/** Zeigt `then`, solange die Bedingung wahr ist; sonst `otherwise`. Der verlassene Zweig wird entsorgt. */
export function Show<T>(when: Accessor<T | false | null | undefined>, then: (value: T) => View, otherwise?: () => View): Block {
  return {
    [BLOCK]: (parent, end) => {
      let nodes: Node[] = []
      let dispose: (() => void) | null = null
      let last: boolean | null = null
      onCleanup(() => dispose?.())
      effect(() => {
        const value = when()
        const on = !!value
        if (on === last) return
        last = on
        dispose?.(); dispose = null
        for (const n of nodes) n.parentNode?.removeChild(n)
        nodes = []
        const build = on ? () => then(value as T) : otherwise
        if (!build) return
        const [built, d] = ownScope(() => materialize(parent, untrack(build), end))
        dispose = d
        nodes = built
      })
    },
  }
}

interface Row<T> { key: unknown, item: T, nodes: Node[], setIndex: (i: number) => void, dispose: () => void }

/**
 * Schlüsselbasierte Liste. Bestehende Zeilen werden VERSCHOBEN statt neu gebaut,
 * deshalb bleiben Fokus, Scrollposition, Auswahl und laufende Übergänge erhalten.
 */
export function For<T>(each: Accessor<readonly T[]>, key: (item: T, index: number) => unknown,
                       render: (item: T, index: Accessor<number>) => View): Block {
  return {
    [BLOCK]: (parent, end) => {
      let rows: Row<T>[] = []
      onCleanup(() => { for (const r of rows) r.dispose() })
      effect(() => {
        const items = each() ?? []
        const previous = new Map<unknown, Row<T>>()
        for (const r of rows) previous.set(r.key, r)

        const next: Row<T>[] = []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const k = key(item, i)
          const existing = previous.get(k)
          if (existing) {
            previous.delete(k)
            existing.item = item
            existing.setIndex(i)
            next.push(existing)
            continue
          }
          const [index, setIndex] = signal(i)
          const [nodes, dispose] = ownScope(() => materialize(parent, untrack(() => render(item, index)), end))
          next.push({ key: k, item, nodes, setIndex, dispose })
        }
        // Entfernte Zeilen abräumen
        for (const row of previous.values()) {
          for (const n of row.nodes) n.parentNode?.removeChild(n)
          row.dispose()
        }
        // Reihenfolge herstellen: von hinten nach vorn, nur wo nötig verschieben
        let anchor: Node = end
        for (let i = next.length - 1; i >= 0; i--) {
          const row = next[i]
          const lastNode = row.nodes[row.nodes.length - 1]
          if (!lastNode || lastNode.nextSibling !== anchor) {
            for (const n of row.nodes) parent.insertBefore(n, anchor)
          }
          if (row.nodes.length) anchor = row.nodes[0]
        }
        rows = next
      })
    },
  }
}

/** Hängt Inhalt an eine andere Stelle im Dokument – für Dialoge, Menüs, Hinweise. */
export function Portal(target: HTMLElement, view: () => View): Block {
  return {
    [BLOCK]: () => {
      const host = document.createElement('div')
      host.style.display = 'contents'
      target.appendChild(host)
      insert(host, view)
      onCleanup(() => host.remove())
    },
  }
}

// ---------------------------------------------------------------------------
// Einfügen
// ---------------------------------------------------------------------------

/** Fügt eine Ansicht vor `marker` ein und hält sie aktuell. */
export function insert(parent: Node, value: View, marker: Node | null = null) {
  if (value === null || value === undefined || typeof value === 'boolean') return
  if (Array.isArray(value)) { for (const v of value) insert(parent, v, marker); return }

  if (isBlock(value)) {
    const end = document.createComment('')
    parent.insertBefore(end, marker)
    value[BLOCK](parent, end)
    return
  }

  if (typeof value === 'function') {
    const end = document.createComment('')
    parent.insertBefore(end, marker)
    let nodes: Node[] = []
    let dispose: (() => void) | null = null
    onCleanup(() => dispose?.())
    effect(() => {
      const next = (value as Accessor<View>)()
      // Häufigster Fall: nur Text, der sich ändert.
      if ((typeof next === 'string' || typeof next === 'number') && nodes.length === 1 && nodes[0].nodeType === 3) {
        nodes[0].textContent = String(next)
        return
      }
      dispose?.(); dispose = null
      for (const n of nodes) n.parentNode?.removeChild(n)
      const [built, d] = ownScope(() => materialize(parent, next, end))
      dispose = d
      nodes = built
    })
    return
  }

  parent.insertBefore(value instanceof Node ? value : document.createTextNode(String(value)), marker)
}

/**
 * Fügt vor dem Anker ein und liefert genau die dabei entstandenen Knoten.
 * Der Vorgänger des Ankers wird vorher gemerkt, damit das Einsammeln linear
 * zur eingefügten Menge bleibt und nicht zur Länge der Liste.
 */
function materialize(parent: Node, value: View, end: Node): Node[] {
  const before = end.previousSibling
  insert(parent, value, end)
  const out: Node[] = []
  for (let n = before ? before.nextSibling : parent.firstChild; n && n !== end; n = n.nextSibling) out.push(n)
  return out
}

/** Hängt eine Ansicht in ein Wurzelelement. Der Rückgabewert entfernt sie vollständig. */
export function mount(view: View | (() => View), root: HTMLElement): () => void {
  const [, dispose] = scope(() => { insert(root, view as View) })
  return () => { dispose(); root.textContent = '' }
}

/**
 * Ersetzt den Inhalt eines Elements und entsorgt dabei den vorherigen Inhalt.
 * Ohne das eigene Scope würden Effekte und Ereignis-Aufräumer der alten Kinder
 * im Besitzer hängen bleiben und die Liste bei jedem Neuaufbau weiterwachsen.
 */
const fillScopes = new WeakMap<HTMLElement, () => void>()

export function fill(host: HTMLElement, ...children: View[]): HTMLElement {
  fillScopes.get(host)?.()
  host.textContent = ''
  const [, dispose] = withOwner(null, () => scope(() => { for (const c of children) insert(host, c) }))
  fillScopes.set(host, dispose)
  return host
}

/** Textknoten, der sich selbst aktuell hält. */
export function text(value: Accessor<unknown>): Node {
  const node = document.createTextNode('')
  effect(() => { node.textContent = String(value() ?? '') })
  return node
}

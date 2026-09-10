// Real Command UI-Engine · Überlagerungen
// =============================================================================
// Alles, was über der Oberfläche schwebt, teilt sich drei Dinge: eine
// Stapelverwaltung, eine Positionsberechnung und ein einheitliches Verhalten
// beim Schließen. Ohne diese gemeinsame Grundlage bekommt man Menüs, die aus
// dem Fenster laufen, Dialoge, die den Fokus verlieren, und Escape-Tasten, die
// zwei Ebenen gleichzeitig schließen.

import { onCleanup, signal, type Accessor } from './signal.ts'
import { h, insert, type View } from './render.ts'

// ---------------------------------------------------------------------------
// Wurzel und Stapel
// ---------------------------------------------------------------------------

let root: HTMLElement | null = null

export function overlayRoot(): HTMLElement {
  if (!root) {
    root = h('div', { id: 'rc-overlays', 'aria-live': 'polite' })
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:900'
    document.body.appendChild(root)
  }
  return root
}

export type LayerKind = 'popover' | 'menu' | 'dialog' | 'toast' | 'tooltip'

interface Layer {
  el: HTMLElement
  kind: LayerKind
  close: () => void
  /** Dialoge fangen den Fokus, Menüs geben ihn zurück. */
  modal: boolean
  /** Klicks hierin gelten nicht als „außerhalb“. */
  anchors: HTMLElement[]
}

const stack: Layer[] = []
const [depth, setDepth] = signal(0)
export const layerDepth: Accessor<number> = depth

/** Die oberste Ebene beenden. Liefert false, wenn nichts offen war. */
export function closeTop(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

export function closeAll(kind?: LayerKind) {
  for (let i = stack.length - 1; i >= 0; i--) if (!kind || stack[i].kind === kind) stack[i].close()
}

function pushLayer(layer: Layer): () => void {
  stack.push(layer)
  setDepth(stack.length)
  if (stack.length === 1) attachGlobalHandlers()
  return () => {
    const i = stack.indexOf(layer)
    if (i < 0) return
    stack.splice(i, 1)
    setDepth(stack.length)
    if (!stack.length) detachGlobalHandlers()
  }
}

// Ein einziges Paar globaler Zuhörer für den gesamten Stapel.
let handlersOn = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.close()
}

function onPointerDown(e: PointerEvent) {
  const target = e.target as Node
  // Von oben nach unten schließen, bis eine Ebene den Klick beansprucht.
  for (let i = stack.length - 1; i >= 0; i--) {
    const layer = stack[i]
    if (layer.el.contains(target) || layer.anchors.some(a => a.contains(target))) return
    if (layer.modal) { return }   // modale Ebenen verschlucken Klicks nach außen
    layer.close()
  }
}

function attachGlobalHandlers() {
  if (handlersOn) return
  handlersOn = true
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('pointerdown', onPointerDown, true)
}

function detachGlobalHandlers() {
  if (!handlersOn) return
  handlersOn = false
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('pointerdown', onPointerDown, true)
}

// ---------------------------------------------------------------------------
// Positionierung
// ---------------------------------------------------------------------------

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'
export type Placement = Side | `${Side}-${Align}`

export interface PlaceOptions {
  placement?: Placement
  /** Abstand zwischen Anker und Element. */
  offset?: number
  /** Mindestabstand zum Fensterrand. */
  padding?: number
  /** Auf die Gegenseite kippen, wenn kein Platz ist. */
  flip?: boolean
  /** Entlang der Achse verschieben, damit nichts abgeschnitten wird. */
  shift?: boolean
  /** Breite des Ankers übernehmen (Auswahllisten). */
  matchWidth?: boolean
}

export interface PlaceResult { x: number, y: number, placement: Placement, arrow: { x: number, y: number } }

/**
 * Berechnet die Lage eines schwebenden Elements zu seinem Anker.
 * Reihenfolge: gewünschte Seite → notfalls kippen → notfalls schieben.
 */
export function computePlacement(anchor: DOMRect, floating: { width: number, height: number }, o: PlaceOptions = {}): PlaceResult {
  const offset = o.offset ?? 6
  const padding = o.padding ?? 8
  const vw = window.innerWidth, vh = window.innerHeight
  const [sideRaw, alignRaw] = (o.placement ?? 'bottom-start').split('-') as [Side, Align | undefined]
  const align: Align = alignRaw ?? 'center'
  let side = sideRaw

  const space = {
    top: anchor.top - padding,
    bottom: vh - anchor.bottom - padding,
    left: anchor.left - padding,
    right: vw - anchor.right - padding,
  }
  const need = (s: Side) => (s === 'top' || s === 'bottom' ? floating.height : floating.width) + offset

  if (o.flip !== false && space[side] < need(side)) {
    const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
    if (space[opposite[side]] >= need(side)) side = opposite[side]
  }

  let x = 0, y = 0
  if (side === 'bottom' || side === 'top') {
    y = side === 'bottom' ? anchor.bottom + offset : anchor.top - floating.height - offset
    x = align === 'start' ? anchor.left : align === 'end' ? anchor.right - floating.width : anchor.left + (anchor.width - floating.width) / 2
  } else {
    x = side === 'right' ? anchor.right + offset : anchor.left - floating.width - offset
    y = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - floating.height : anchor.top + (anchor.height - floating.height) / 2
  }

  if (o.shift !== false) {
    x = Math.min(Math.max(padding, x), Math.max(padding, vw - floating.width - padding))
    y = Math.min(Math.max(padding, y), Math.max(padding, vh - floating.height - padding))
  }

  // Pfeil zeigt auf die Mitte des Ankers, bleibt aber im Element.
  const arrow = side === 'top' || side === 'bottom'
    ? { x: Math.min(Math.max(10, anchor.left + anchor.width / 2 - x), floating.width - 10), y: side === 'bottom' ? 0 : floating.height }
    : { x: side === 'right' ? 0 : floating.width, y: Math.min(Math.max(10, anchor.top + anchor.height / 2 - y), floating.height - 10) }

  return { x: Math.round(x), y: Math.round(y), placement: (align === 'center' ? side : `${side}-${align}`) as Placement, arrow }
}

/**
 * Hält ein schwebendes Element an seinem Anker – auch beim Scrollen, bei
 * Größenänderungen und wenn sich der eigene Inhalt ändert.
 */
export function anchorTo(el: HTMLElement, anchor: HTMLElement | (() => DOMRect), o: PlaceOptions = {}): () => void {
  const rectOf = () => (typeof anchor === 'function' ? anchor() : anchor.getBoundingClientRect())
  let frame = 0
  const update = () => {
    frame = 0
    const r = rectOf()
    if (o.matchWidth) el.style.minWidth = r.width + 'px'
    const p = computePlacement(r, { width: el.offsetWidth, height: el.offsetHeight }, o)
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
    el.dataset.placement = p.placement
    el.style.setProperty('--arrow-x', p.arrow.x + 'px')
    el.style.setProperty('--arrow-y', p.arrow.y + 'px')
  }
  const request = () => { if (!frame) frame = requestAnimationFrame(update) }

  update()
  window.addEventListener('scroll', request, true)
  window.addEventListener('resize', request)
  const ro = new ResizeObserver(request)
  ro.observe(el)
  if (typeof anchor !== 'function') ro.observe(anchor)

  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener('scroll', request, true)
    window.removeEventListener('resize', request)
    ro.disconnect()
  }
}

// ---------------------------------------------------------------------------
// Fokus
// ---------------------------------------------------------------------------

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function focusableIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(e => e.offsetParent !== null || e === document.activeElement)
}

/** Hält den Tastaturfokus innerhalb des Elements und gibt ihn danach zurück. */
export function trapFocus(el: HTMLElement): () => void {
  const previous = document.activeElement as HTMLElement | null
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1
  // Der Fokus soll auf dem gemeinten Feld landen, nicht auf dem Schließen-Kreuz.
  // Ohne ausdrückliche Angabe bekommt ihn der Behälter selbst: die Tastatur ist
  // gefangen, aber es ist nichts vorausgewählt, was man versehentlich auslöst.
  const wanted = el.querySelector<HTMLElement>('[autofocus],[data-autofocus]') ?? el
  queueMicrotask(() => wanted.focus({ preventScroll: true }))

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = focusableIn(el)
    if (!items.length) { e.preventDefault(); return }
    const active = document.activeElement as HTMLElement
    const i = items.indexOf(active)
    const nextIndex = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1)
    e.preventDefault()
    items[nextIndex].focus({ preventScroll: true })
  }
  el.addEventListener('keydown', onKey)
  return () => {
    el.removeEventListener('keydown', onKey)
    previous?.focus?.({ preventScroll: true })
  }
}

/**
 * Pfeiltasten-Navigation in einer Gruppe (Werkzeugleiste, Menü, Reiter).
 * Nur ein Element der Gruppe ist per Tab erreichbar, innerhalb wird gepfeilt.
 */
export function rovingFocus(container: HTMLElement, o: { selector?: string, orientation?: 'horizontal' | 'vertical' | 'both', loop?: boolean } = {}): () => void {
  const sel = o.selector ?? FOCUSABLE
  const orientation = o.orientation ?? 'both'
  const items = () => Array.from(container.querySelectorAll<HTMLElement>(sel)).filter(e => !e.hasAttribute('disabled'))
  const sync = (active?: HTMLElement) => {
    const list = items()
    const target = active ?? list.find(e => e.tabIndex === 0) ?? list[0]
    for (const e of list) e.tabIndex = e === target ? 0 : -1
  }
  sync()
  const onKey = (e: KeyboardEvent) => {
    const list = items()
    if (!list.length) return
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const horizontal = orientation !== 'vertical'
    const vertical = orientation !== 'horizontal'
    let next = -1
    if ((horizontal && e.key === 'ArrowRight') || (vertical && e.key === 'ArrowDown')) next = i + 1
    else if ((horizontal && e.key === 'ArrowLeft') || (vertical && e.key === 'ArrowUp')) next = i - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = list.length - 1
    if (next < 0 && next !== -1) return
    if (next === -1) return
    if (o.loop !== false) next = (next + list.length) % list.length
    else next = Math.min(Math.max(0, next), list.length - 1)
    e.preventDefault()
    list[next].focus({ preventScroll: true })
    sync(list[next])
  }
  const onFocusIn = (e: FocusEvent) => sync(e.target as HTMLElement)
  container.addEventListener('keydown', onKey)
  container.addEventListener('focusin', onFocusIn)
  return () => {
    container.removeEventListener('keydown', onKey)
    container.removeEventListener('focusin', onFocusIn)
  }
}

// ---------------------------------------------------------------------------
// Öffnen von Ebenen
// ---------------------------------------------------------------------------

export interface OpenOptions extends PlaceOptions {
  kind?: LayerKind
  /** Anker, an dem das Element klebt. Ohne Anker wird nicht positioniert. */
  anchor?: HTMLElement | (() => DOMRect)
  modal?: boolean
  /** Weitere Elemente, deren Klicks nicht als „außerhalb“ gelten. */
  keepOpenFor?: HTMLElement[]
  class?: string
  onClose?: () => void
}

export interface OpenHandle { el: HTMLElement, close: () => void }

/** Öffnet eine schwebende Ebene und liefert sie samt Schließfunktion. */
export function openLayer(view: View | (() => View), o: OpenOptions = {}): OpenHandle {
  const kind = o.kind ?? 'popover'
  const el = h('div', {
    class: `rc-layer rc-layer-${kind}${o.class ? ' ' + o.class : ''}`,
    role: kind === 'dialog' ? 'dialog' : kind === 'menu' ? 'menu' : undefined,
    'aria-modal': o.modal ? 'true' : undefined,
  })
  el.style.pointerEvents = 'auto'
  if (o.anchor) el.style.position = 'fixed', el.style.top = '0', el.style.left = '0'

  const cleanups: (() => void)[] = []
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]()
    el.remove()
    o.onClose?.()
  }

  overlayRoot().appendChild(el)
  insert(el, view as View)

  if (o.anchor) cleanups.push(anchorTo(el, o.anchor, o))
  if (o.modal) cleanups.push(trapFocus(el))
  cleanups.push(pushLayer({
    el, kind, close, modal: !!o.modal,
    anchors: [
      ...(o.anchor && typeof o.anchor !== 'function' ? [o.anchor] : []),
      ...(o.keepOpenFor ?? []),
    ],
  }))

  onCleanup(close)
  return { el, close }
}

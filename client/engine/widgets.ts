// Real Command UI-Engine · Bedienelemente
// =============================================================================
// Nüchterne, dichte Steuerelemente für eine Leitstandsoberfläche. Jedes ist
// eine Funktion, die ein Element liefert; reaktive Werte werden als Funktion
// übergeben und binden sich selbst.
//
//   Button({ label: 'Bauen', icon: 'build', command: 'base.build' })
//   Field('Sichtweite', NumberInput({ value: range, onInput: setRange, unit: 'm' }))
//
// Zugänglichkeit ist nicht optional: Rollen, Beschriftungen, Fokusreihenfolge
// und Tastaturbedienung gehören zum Element, nicht zur Anwendung.

import { h, Show, For, text, insert, type View } from './render.ts'
import { signal, computed, effect, onCleanup, untrack, type Accessor } from './signal.ts'
import { Icon, type IconName } from './icons.ts'
import { openLayer, rovingFocus, type Placement } from './overlay.ts'
import { getCommand, isEnabled, run as runCommand, shortcutFor, searchCommands, activeCommands, pushScope, type Command } from './commands.ts'

type Reactive<T> = T | Accessor<T>
const val = <T>(v: Reactive<T> | undefined, fallback: T): T =>
  v === undefined ? fallback : (typeof v === 'function' ? (v as Accessor<T>)() : v)
const acc = <T>(v: Reactive<T> | undefined, fallback: T): Accessor<T> => () => val(v, fallback)

export type Variant = 'default' | 'primary' | 'quiet' | 'danger'
export type Scale = 'sm' | 'md' | 'lg'

// ---------------------------------------------------------------------------
// Knöpfe
// ---------------------------------------------------------------------------

export interface ButtonProps {
  label?: Reactive<string>
  icon?: IconName
  iconAfter?: IconName
  variant?: Reactive<Variant>
  size?: Scale
  disabled?: Reactive<boolean>
  pressed?: Reactive<boolean>
  loading?: Reactive<boolean>
  title?: Reactive<string>
  /** Statt onClick: löst einen registrierten Befehl aus und zeigt sein Kürzel. */
  command?: string
  shortcut?: string
  full?: boolean
  /** Nur die Ikone zeigen. Der Titel des Befehls wandert dann in Tooltip und aria-label. */
  iconOnly?: boolean
  onClick?: (e: MouseEvent) => void
}

export function Button(p: ButtonProps): HTMLElement {
  const cmd = p.command ? getCommand(p.command) : undefined
  const label = p.iconOnly ? undefined : (p.label ?? cmd?.title)
  const accessibleName = p.label ?? cmd?.title ?? ''
  const shortcut = p.shortcut ?? (p.command ? shortcutFor(p.command) : '')
  const disabled = () => val(p.disabled, false) || val(p.loading, false) || (cmd ? !isEnabled(cmd) : false)

  return h('button', {
    type: 'button',
    class: {
      'rc-btn': true,
      // Jede Tonart als eigene reaktive Klasse: der Schlüssel eines
      // Klassenobjekts muss fest sein, der Wert darf sich ändern. So kann ein
      // Knopf seine Tonart wechseln, etwa um die aktive Wahl zu markieren.
      'rc-btn-default': () => val(p.variant, 'default') === 'default',
      'rc-btn-primary': () => val(p.variant, 'default') === 'primary',
      'rc-btn-quiet': () => val(p.variant, 'default') === 'quiet',
      'rc-btn-danger': () => val(p.variant, 'default') === 'danger',
      [`rc-${p.size ?? 'md'}`]: true,
      'is-full': !!p.full,
      'is-icon-only': !label,
      'is-pressed': acc(p.pressed, false),
      'is-loading': acc(p.loading, false),
    },
    disabled,
    'aria-pressed': p.pressed !== undefined ? (() => String(val(p.pressed, false))) : undefined,
    'aria-busy': () => (val(p.loading, false) ? 'true' : undefined),
    title: () => (val(p.title, '') || (typeof accessibleName === 'function' ? accessibleName() : accessibleName)) + (shortcut ? `  ${shortcut}` : ''),
    'aria-label': p.iconOnly ? (() => String(val(p.title, '') || accessibleName)) : undefined,
    onClick: (e: Event) => {
      if (disabled()) return
      p.onClick?.(e as MouseEvent)
      if (p.command) runCommand(p.command)
    },
  },
    p.icon && Icon(p.icon, { size: p.size === 'lg' ? 18 : 16 }),
    label && h('span', { class: 'rc-btn-label' }, typeof label === 'function' ? text(label) : label),
    p.iconAfter && Icon(p.iconAfter, { size: 14 }),
    shortcut && !p.iconOnly && h('kbd', { class: 'rc-kbd rc-kbd-inline' }, shortcut),
  )
}

export function IconButton(icon: IconName, p: Omit<ButtonProps, 'icon' | 'label'> & { label: string }): HTMLElement {
  return Button({ ...p, icon, iconOnly: true, title: p.title ?? p.label })
}

export function ButtonGroup(...children: View[]): HTMLElement {
  const el = h('div', { class: 'rc-btn-group', role: 'group' }, ...children)
  onCleanup(rovingFocus(el, { selector: 'button', orientation: 'horizontal' }))
  return el
}

export interface SegmentedProps<T extends string> {
  options: { value: T, label: string, icon?: IconName, title?: string }[]
  value: Accessor<T>
  onChange: (v: T) => void
  size?: Scale
  label?: string
}

export function Segmented<T extends string>(p: SegmentedProps<T>): HTMLElement {
  const el = h('div', { class: `rc-segmented rc-${p.size ?? 'md'}`, role: 'radiogroup', 'aria-label': p.label ?? '' },
    ...p.options.map(o => h('button', {
      type: 'button',
      role: 'radio',
      class: { 'rc-segment': true, 'is-active': () => p.value() === o.value },
      'aria-checked': () => String(p.value() === o.value),
      title: o.title ?? o.label,
      onClick: () => p.onChange(o.value),
    }, o.icon && Icon(o.icon, { size: 14 }), h('span', o.label))),
  )
  onCleanup(rovingFocus(el, { selector: 'button', orientation: 'horizontal' }))
  return el
}

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

let fieldSeq = 0

export interface FieldProps {
  label: string
  hint?: string
  error?: Reactive<string>
  required?: boolean
  /** Beschriftung links statt darüber – für dichte Einstellungslisten. */
  inline?: boolean
}

/** Umschlag mit Beschriftung, Hinweis und Fehlermeldung; verbindet beides per id. */
export function Field(p: FieldProps, control: HTMLElement): HTMLElement {
  const id = control.id || (control.id = `rc-f${++fieldSeq}`)
  const errId = id + '-err'
  control.setAttribute('aria-describedby', errId)
  return h('div', { class: { 'rc-field': true, 'is-inline': !!p.inline, 'has-error': () => !!val(p.error, '') } },
    h('label', { class: 'rc-field-label', for: id }, p.label, p.required && h('span', { class: 'rc-req', 'aria-hidden': 'true' }, '*')),
    h('div', { class: 'rc-field-control' }, control,
      p.hint && h('div', { class: 'rc-field-hint' }, p.hint),
      h('div', { class: 'rc-field-error', id: errId, role: 'alert' }, text(() => val(p.error, '')))),
  )
}

export interface TextInputProps {
  value: Accessor<string>
  onInput?: (v: string) => void
  onCommit?: (v: string) => void
  placeholder?: string
  disabled?: Reactive<boolean>
  readonly?: boolean
  monospace?: boolean
  icon?: IconName
  size?: Scale
  maxlength?: number
  type?: 'text' | 'password' | 'search' | 'email' | 'url'
}

export function TextInput(p: TextInputProps): HTMLElement {
  let input!: HTMLInputElement
  const wrap = h('div', { class: `rc-input rc-${p.size ?? 'md'}${p.monospace ? ' is-mono' : ''}` },
    p.icon && Icon(p.icon, { size: 14, class: 'rc-input-icon' }),
    h('input', {
      ref: (e: HTMLElement) => { input = e as HTMLInputElement },
      type: p.type ?? 'text',
      value: p.value,
      placeholder: p.placeholder ?? '',
      disabled: acc(p.disabled, false),
      readonly: p.readonly,
      maxlength: p.maxlength,
      onInput: (e: Event) => p.onInput?.((e.target as HTMLInputElement).value),
      onChange: (e: Event) => p.onCommit?.((e.target as HTMLInputElement).value),
      onKeyDown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') p.onCommit?.(input.value) },
    }),
  )
  // Der Umschlag trägt die id, damit Field das Eingabefeld trifft.
  Object.defineProperty(wrap, 'id', {
    get: () => input.id,
    set: (v: string) => { input.id = v },
    configurable: true,
  })
  return wrap
}

export interface NumberInputProps {
  value: Accessor<number>
  onInput: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  disabled?: Reactive<boolean>
  size?: Scale
  /** Zahl beim Ziehen am Feld verändern – wie in Grafikprogrammen. */
  scrub?: boolean
}

export function NumberInput(p: NumberInputProps): HTMLElement {
  const clamp = (v: number) => Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v))
  const step = p.step ?? 1
  let input!: HTMLInputElement

  const el = h('div', { class: `rc-input rc-number rc-${p.size ?? 'md'}` },
    h('input', {
      ref: (e: HTMLElement) => { input = e as HTMLInputElement },
      type: 'number',
      value: () => String(p.value()),
      min: p.min, max: p.max, step,
      disabled: acc(p.disabled, false),
      inputmode: 'decimal',
      onInput: (e: Event) => {
        const raw = Number((e.target as HTMLInputElement).value)
        if (!Number.isNaN(raw)) p.onInput(clamp(raw))
      },
    }),
    p.unit && h('span', { class: 'rc-unit' }, p.unit),
    h('div', { class: 'rc-spin' },
      h('button', { type: 'button', tabindex: -1, 'aria-label': 'erhöhen', onClick: () => p.onInput(clamp(p.value() + step)) }, Icon('chevronUp', { size: 11 })),
      h('button', { type: 'button', tabindex: -1, 'aria-label': 'verringern', onClick: () => p.onInput(clamp(p.value() - step)) }, Icon('chevronDown', { size: 11 })),
    ),
  )

  if (p.scrub) {
    let dragging = false, startX = 0, startValue = 0
    el.classList.add('is-scrub')
    el.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      dragging = true; startX = e.clientX; startValue = p.value()
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', e => {
      if (!dragging) return
      const delta = Math.round((e.clientX - startX) / 3) * step
      p.onInput(clamp(startValue + delta))
    })
    el.addEventListener('pointerup', e => { dragging = false; el.releasePointerCapture(e.pointerId) })
  }
  Object.defineProperty(el, 'id', { get: () => input.id, set: (v: string) => { input.id = v }, configurable: true })
  return el
}

export interface SelectProps<T extends string> {
  value: Accessor<T>
  onChange: (v: T) => void
  options: Reactive<{ value: T, label: string, group?: string, disabled?: boolean }[]>
  disabled?: Reactive<boolean>
  size?: Scale
}

export function Select<T extends string>(p: SelectProps<T>): HTMLElement {
  let select!: HTMLSelectElement
  const el = h('div', { class: `rc-input rc-select rc-${p.size ?? 'md'}` },
    h('select', {
      ref: (e: HTMLElement) => { select = e as HTMLSelectElement },
      disabled: acc(p.disabled, false),
      onChange: (e: Event) => p.onChange((e.target as HTMLSelectElement).value as T),
    }, () => {
      const opts = val(p.options, [])
      const current = p.value()
      return opts.map(o => h('option', { value: o.value, disabled: o.disabled, selected: o.value === current }, o.label))
    }),
    Icon('chevronDown', { size: 13, class: 'rc-select-arrow' }),
  )
  Object.defineProperty(el, 'id', { get: () => select.id, set: (v: string) => { select.id = v }, configurable: true })
  return el
}

export interface CheckProps {
  checked: Accessor<boolean>
  onChange: (v: boolean) => void
  label?: string
  disabled?: Reactive<boolean>
  indeterminate?: Accessor<boolean>
}

export function Checkbox(p: CheckProps): HTMLElement {
  let input!: HTMLInputElement
  const el = h('label', { class: 'rc-check' },
    h('input', {
      ref: (e: HTMLElement) => {
        input = e as HTMLInputElement
        if (p.indeterminate) effect(() => { input.indeterminate = p.indeterminate!() })
      },
      type: 'checkbox',
      checked: p.checked,
      disabled: acc(p.disabled, false),
      onChange: (e: Event) => p.onChange((e.target as HTMLInputElement).checked),
    }),
    h('span', { class: 'rc-check-box', 'aria-hidden': 'true' }, Icon('check', { size: 12, stroke: 2.4 })),
    p.label && h('span', { class: 'rc-check-label' }, p.label),
  )
  Object.defineProperty(el, 'id', { get: () => input.id, set: (v: string) => { input.id = v }, configurable: true })
  return el
}

export function Switch(p: CheckProps): HTMLElement {
  let input!: HTMLInputElement
  const el = h('label', { class: 'rc-switch' },
    h('input', {
      ref: (e: HTMLElement) => { input = e as HTMLInputElement },
      type: 'checkbox', role: 'switch',
      checked: p.checked,
      disabled: acc(p.disabled, false),
      onChange: (e: Event) => p.onChange((e.target as HTMLInputElement).checked),
    }),
    h('span', { class: 'rc-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'rc-switch-thumb' })),
    p.label && h('span', { class: 'rc-switch-label' }, p.label),
  )
  Object.defineProperty(el, 'id', { get: () => input.id, set: (v: string) => { input.id = v }, configurable: true })
  return el
}

export interface SliderProps {
  value: Accessor<number>
  onInput: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  /** Markierungen mit Beschriftung unter der Schiene. */
  ticks?: { value: number, label?: string }[]
  disabled?: Reactive<boolean>
}

export function Slider(p: SliderProps): HTMLElement {
  const min = p.min ?? 0, max = p.max ?? 100
  const pct = () => ((p.value() - min) / (max - min)) * 100
  let input!: HTMLInputElement
  const el = h('div', { class: `rc-slider${p.ticks?.length ? ' has-ticks' : ''}` },
    h('div', { class: 'rc-slider-track' },
      h('div', { class: 'rc-slider-fill', style: { width: () => pct() + '%' } }),
      h('input', {
        ref: (e: HTMLElement) => { input = e as HTMLInputElement },
        type: 'range', min, max, step: p.step ?? 1,
        value: () => String(p.value()),
        disabled: acc(p.disabled, false),
        onInput: (e: Event) => p.onInput(Number((e.target as HTMLInputElement).value)),
      }),
    ),
    p.format && h('output', { class: 'rc-slider-value' }, text(() => p.format!(p.value()))),
    p.ticks && h('div', { class: 'rc-slider-ticks' }, ...p.ticks.map(t =>
      h('span', { class: 'rc-slider-tick', style: { left: ((t.value - min) / (max - min)) * 100 + '%' } }, t.label ?? ''))),
  )
  Object.defineProperty(el, 'id', { get: () => input.id, set: (v: string) => { input.id = v }, configurable: true })
  return el
}

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

export function Tag(label: Reactive<string>, kind: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'accent' = 'neutral'): HTMLElement {
  return h('span', { class: `rc-tag rc-tag-${kind}` }, typeof label === 'function' ? text(label) : label)
}

export function Kbd(keys: string): HTMLElement {
  return h('kbd', { class: 'rc-kbd' }, keys)
}

export interface MeterProps {
  value: Accessor<number>
  max?: Reactive<number>
  kind?: 'accent' | 'ok' | 'warn' | 'crit'
  label?: string
  /** Zweite Marke, etwa der Bedarf gegenüber der Leistung. */
  threshold?: Accessor<number>
  showValue?: (v: number, max: number) => string
}

export function Meter(p: MeterProps): HTMLElement {
  const max = () => val(p.max, 100)
  const pct = () => Math.max(0, Math.min(100, (p.value() / (max() || 1)) * 100))
  return h('div', { class: 'rc-meter', role: 'meter', 'aria-valuenow': () => String(Math.round(p.value())), 'aria-valuemax': () => String(max()), 'aria-label': p.label ?? '' },
    p.label && h('span', { class: 'rc-meter-label' }, p.label),
    h('div', { class: `rc-meter-track rc-meter-${p.kind ?? 'accent'}` },
      h('div', { class: 'rc-meter-fill', style: { width: () => pct() + '%' } }),
      p.threshold && h('div', { class: 'rc-meter-mark', style: { left: () => Math.min(100, (p.threshold!() / (max() || 1)) * 100) + '%' } }),
    ),
    p.showValue && h('span', { class: 'rc-meter-value' }, text(() => p.showValue!(p.value(), max()))),
  )
}

export function Progress(value: Accessor<number | null>, label?: string): HTMLElement {
  return h('div', { class: { 'rc-progress': true, 'is-indeterminate': () => value() === null }, role: 'progressbar', 'aria-label': label ?? '' },
    h('div', { class: 'rc-progress-fill', style: { width: () => (value() === null ? '30%' : (value()! * 100).toFixed(1) + '%') } }),
  )
}

export function Spinner(size = 14): HTMLElement {
  return h('span', { class: 'rc-spinner', style: { width: size, height: size }, 'aria-hidden': 'true' })
}

export function EmptyState(p: { icon?: IconName, title: string, hint?: string, action?: View }): HTMLElement {
  return h('div', { class: 'rc-empty' },
    p.icon && Icon(p.icon, { size: 28, class: 'rc-empty-icon' }),
    h('div', { class: 'rc-empty-title' }, p.title),
    p.hint && h('div', { class: 'rc-empty-hint' }, p.hint),
    p.action,
  )
}

// ---------------------------------------------------------------------------
// Flächen
// ---------------------------------------------------------------------------

export interface PanelProps {
  title?: Reactive<string>
  subtitle?: Reactive<string>
  icon?: IconName
  actions?: View
  /** Einklappbar; der Zustand gehört dem Aufrufer. */
  collapsed?: Accessor<boolean>
  onToggle?: () => void
  scroll?: boolean
  pad?: boolean
}

export function Panel(p: PanelProps, ...body: View[]): HTMLElement {
  const head = (p.title || p.actions) && h('header', { class: 'rc-panel-head' },
    p.onToggle && h('button', {
      type: 'button', class: 'rc-panel-toggle',
      'aria-expanded': () => String(!val(p.collapsed, false)),
      onClick: () => p.onToggle!(),
    }, Icon('chevronDown', { size: 13 })),
    p.icon && Icon(p.icon, { size: 14, class: 'rc-panel-icon' }),
    p.title && h('h2', { class: 'rc-panel-title' }, typeof p.title === 'function' ? text(p.title) : p.title),
    p.subtitle && h('span', { class: 'rc-panel-sub' }, typeof p.subtitle === 'function' ? text(p.subtitle) : p.subtitle),
    p.actions && h('div', { class: 'rc-panel-actions' }, p.actions),
  )
  return h('section', { class: { 'rc-panel': true, 'is-collapsed': acc(p.collapsed, false) } },
    head,
    h('div', { class: { 'rc-panel-body': true, 'is-scroll': p.scroll !== false, 'is-pad': p.pad !== false } }, ...body),
  )
}

export function Toolbar(p: { label?: string, dense?: boolean } = {}, ...children: View[]): HTMLElement {
  const el = h('div', { class: { 'rc-toolbar': true, 'is-dense': !!p.dense }, role: 'toolbar', 'aria-label': p.label ?? '' }, ...children)
  onCleanup(rovingFocus(el, { selector: 'button,input,select,[tabindex]', orientation: 'horizontal' }))
  return el
}

export function Separator(vertical = false): HTMLElement {
  return h('div', { class: `rc-sep${vertical ? ' is-vertical' : ''}`, role: 'separator' })
}

export function Spacer(): HTMLElement { return h('div', { class: 'rc-spacer' }) }

export interface TabsProps<T extends string> {
  items: Reactive<{ id: T, label: string, icon?: IconName, badge?: Reactive<string | number>, disabled?: boolean }[]>
  active: Accessor<T>
  onChange: (id: T) => void
  /** Untergeordnete Reiter sitzen enger und ohne Rahmen. */
  subtle?: boolean
}

export function Tabs<T extends string>(p: TabsProps<T>): HTMLElement {
  const el = h('div', { class: { 'rc-tabs': true, 'is-subtle': !!p.subtle }, role: 'tablist' },
    For(() => val(p.items, []), i => i.id, item => h('button', {
      type: 'button', role: 'tab',
      class: { 'rc-tab': true, 'is-active': () => p.active() === item.id },
      'aria-selected': () => String(p.active() === item.id),
      disabled: !!item.disabled,
      onClick: () => p.onChange(item.id),
    },
      item.icon && Icon(item.icon, { size: 14 }),
      h('span', item.label),
      item.badge !== undefined && h('span', { class: 'rc-tab-badge' }, text(() => String(val(item.badge, '')))),
    )),
  )
  onCleanup(rovingFocus(el, { selector: '[role=tab]', orientation: 'horizontal' }))
  return el
}

/** Größenveränderliche Teilung. `size` ist die Breite bzw. Höhe des ersten Bereichs. */
export function Split(p: { vertical?: boolean, size: Accessor<number>, onResize: (v: number) => void, min?: number, max?: number },
                      first: View, second: View): HTMLElement {
  const vertical = !!p.vertical
  const handle = h('div', {
    class: { 'rc-split-handle': true, 'is-vertical': vertical },
    role: 'separator', tabindex: 0,
    'aria-orientation': vertical ? 'horizontal' : 'vertical',
    'aria-valuenow': () => String(Math.round(p.size())),
    onKeyDown: (e: Event) => {
      const k = (e as KeyboardEvent).key
      const d = k === 'ArrowLeft' || k === 'ArrowUp' ? -16 : k === 'ArrowRight' || k === 'ArrowDown' ? 16 : 0
      if (!d) return
      e.preventDefault()
      p.onResize(clampSize(p.size() + d))
    },
  })
  const clampSize = (v: number) => Math.min(p.max ?? Infinity, Math.max(p.min ?? 80, v))

  let dragging = false, origin = 0, start = 0
  handle.addEventListener('pointerdown', e => {
    dragging = true
    origin = vertical ? e.clientY : e.clientX
    start = p.size()
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add(vertical ? 'rc-resizing-v' : 'rc-resizing-h')
  })
  handle.addEventListener('pointermove', e => {
    if (!dragging) return
    p.onResize(clampSize(start + ((vertical ? e.clientY : e.clientX) - origin)))
  })
  const stop = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    handle.releasePointerCapture(e.pointerId)
    document.body.classList.remove('rc-resizing-v', 'rc-resizing-h')
  }
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)

  return h('div', { class: { 'rc-split': true, 'is-vertical': vertical } },
    h('div', { class: 'rc-split-pane', style: vertical ? { height: () => p.size() + 'px' } : { width: () => p.size() + 'px' } }, first),
    handle,
    h('div', { class: 'rc-split-pane is-flex' }, second),
  )
}

// ---------------------------------------------------------------------------
// Schwebende Elemente
// ---------------------------------------------------------------------------

/** Hinweisblase. Erscheint verzögert, verschwindet sofort. */
export function tooltip(el: HTMLElement, content: () => View, o: { placement?: Placement, delay?: number } = {}) {
  let timer = 0
  let handle: { close: () => void } | null = null
  const show = () => {
    handle?.close()
    handle = openLayer(h('div', { class: 'rc-tooltip' }, content()), {
      kind: 'tooltip', anchor: el, placement: o.placement ?? 'top', offset: 6,
    })
  }
  const enter = () => { clearTimeout(timer); timer = window.setTimeout(show, o.delay ?? 400) }
  const leave = () => { clearTimeout(timer); handle?.close(); handle = null }
  el.addEventListener('pointerenter', enter)
  el.addEventListener('pointerleave', leave)
  el.addEventListener('focus', show)
  el.addEventListener('blur', leave)
  onCleanup(() => { clearTimeout(timer); handle?.close(); el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave) })
  return el
}

export interface MenuItem {
  id?: string
  label?: string
  icon?: IconName
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  separator?: boolean
  /** Untermenü. */
  items?: MenuItem[]
  command?: string
  onSelect?: () => void
}

function menuView(items: MenuItem[], close: () => void): HTMLElement {
  const el = h('div', { class: 'rc-menu', role: 'menu' },
    ...items.map(item => {
      if (item.separator) return h('div', { class: 'rc-menu-sep', role: 'separator' })
      const cmd = item.command ? getCommand(item.command) : undefined
      const label = item.label ?? cmd?.title ?? ''
      const shortcut = item.shortcut ?? (item.command ? shortcutFor(item.command) : '')
      const disabled = item.disabled || (cmd ? !isEnabled(cmd) : false)
      return h('button', {
        type: 'button', role: 'menuitem',
        class: { 'rc-menu-item': true, 'is-danger': !!item.danger, 'is-checked': !!item.checked },
        disabled,
        onClick: () => { close(); item.onSelect?.(); if (item.command) runCommand(item.command) },
      },
        h('span', { class: 'rc-menu-check' }, item.checked ? Icon('check', { size: 12, stroke: 2.2 }) : null),
        item.icon && Icon(item.icon, { size: 14, class: 'rc-menu-icon' }),
        h('span', { class: 'rc-menu-label' }, label),
        shortcut && h('kbd', { class: 'rc-kbd' }, shortcut),
      )
    }),
  )
  onCleanup(rovingFocus(el, { selector: '[role=menuitem]:not([disabled])', orientation: 'vertical' }))
  return el
}

/** Menü an einem Element. */
export function openMenu(items: MenuItem[], anchor: HTMLElement, placement: Placement = 'bottom-start') {
  const handle = openLayer(() => menuView(items, () => handle.close()), { kind: 'menu', anchor, placement, offset: 4 })
  return handle
}

/** Menü an einer Bildschirmposition (Rechtsklick). */
export function openContextMenu(items: MenuItem[], x: number, y: number) {
  const rect = () => new DOMRect(x, y, 0, 0)
  const handle = openLayer(() => menuView(items, () => handle.close()), { kind: 'menu', anchor: rect, placement: 'bottom-start', offset: 2 })
  return handle
}

export interface DialogProps {
  title: string
  subtitle?: string
  icon?: IconName
  width?: number
  danger?: boolean
  dismissable?: boolean
  actions?: { label: string, variant?: Variant, onSelect?: () => void, close?: boolean }[]
}

export function openDialog(p: DialogProps, body: View) {
  const popScope = pushScope('dialog')
  // Abdunkeln hinter dem Dialog. Der Schleier muss am Leben des Layers hängen,
  // nicht am zurückgegebenen close(): geschlossen wird der Dialog meist über
  // seine eigenen Knöpfe, das Kreuz oder Escape – und dann blieb der Schleier
  // liegen und legte als bildschirmfüllende Fläche die ganze Oberfläche lahm.
  const scrim = h('div', { class: 'rc-scrim' })
  const handle = openLayer(() => h('div', { class: { 'rc-dialog': true, 'is-danger': !!p.danger }, style: { width: (p.width ?? 480) + 'px' } },
    h('header', { class: 'rc-dialog-head' },
      p.icon && Icon(p.icon, { size: 18, class: 'rc-dialog-icon' }),
      h('div', null,
        h('h2', { class: 'rc-dialog-title' }, p.title),
        p.subtitle && h('p', { class: 'rc-dialog-sub' }, p.subtitle)),
      p.dismissable !== false && IconButton('close', { label: 'Schließen', variant: 'quiet', size: 'sm', onClick: () => handle.close() }),
    ),
    h('div', { class: 'rc-dialog-body' }, body),
    p.actions && h('footer', { class: 'rc-dialog-foot' },
      ...p.actions.map(a => Button({
        label: a.label, variant: a.variant ?? 'quiet',
        onClick: () => { a.onSelect?.(); if (a.close !== false) handle.close() },
      }))),
  ), { kind: 'dialog', modal: true, class: 'rc-dialog-layer', onClose: () => { scrim.remove(); popScope() } })
  handle.el.parentElement?.insertBefore(scrim, handle.el)
  return handle
}

// ---------------------------------------------------------------------------
// Meldungen
// ---------------------------------------------------------------------------

export type ToastKind = 'info' | 'ok' | 'warn' | 'crit'
interface Toast { id: number, kind: ToastKind, title: string, detail?: string, action?: { label: string, onSelect: () => void }, count: number }

const [toasts, setToasts] = signal<Toast[]>([])
let toastSeq = 0
let toastHost: HTMLElement | null = null

export function toast(title: string, o: { kind?: ToastKind, detail?: string, ttl?: number, action?: Toast['action'] } = {}): () => void {
  ensureToastHost()
  // Dieselbe Meldung zweimal hintereinander ist keine zweite Meldung. Sie bekommt
  // einen Zähler, statt den Bildschirm zuzustapeln.
  const existing = toasts().find(t => t.title === title && t.detail === o.detail)
  if (existing) {
    setToasts(list => list.map(t => (t.id === existing.id ? { ...t, count: t.count + 1 } : t)))
    return () => setToasts(list => list.filter(t => t.id !== existing.id))
  }
  const id = ++toastSeq
  setToasts(list => [...list, { id, kind: o.kind ?? 'info', title, detail: o.detail, action: o.action, count: 1 }])
  const dismiss = () => setToasts(list => list.filter(t => t.id !== id))
  if (o.ttl !== 0) window.setTimeout(dismiss, o.ttl ?? (o.kind === 'crit' ? 9000 : 5000))
  return dismiss
}

function ensureToastHost() {
  if (toastHost) return
  toastHost = h('div', { class: 'rc-toasts', role: 'status', 'aria-live': 'polite' })
  document.body.appendChild(toastHost)
  insert(toastHost, For(toasts, t => t.id, t => h('div', { class: `rc-toast is-${t.kind}` },
    Icon(t.kind === 'ok' ? 'check' : t.kind === 'crit' ? 'error' : t.kind === 'warn' ? 'alert' : 'info', { size: 15, class: 'rc-toast-icon' }),
    h('div', { class: 'rc-toast-text' },
      h('div', { class: 'rc-toast-title' }, t.title, t.count > 1 ? h('span', { class: 'rc-toast-count' }, ` ×${t.count}`) : null),
      t.detail && h('div', { class: 'rc-toast-detail' }, t.detail)),
    t.action && h('button', { type: 'button', class: 'rc-toast-action', onClick: () => { t.action!.onSelect(); setToasts(l => l.filter(x => x.id !== t.id)) } }, t.action.label),
    h('button', { type: 'button', class: 'rc-toast-close', 'aria-label': 'Schließen', onClick: () => setToasts(l => l.filter(x => x.id !== t.id)) }, Icon('close', { size: 12 })),
  )))
}

// ---------------------------------------------------------------------------
// Befehlspalette
// ---------------------------------------------------------------------------

/** Suche über alle im aktuellen Bereich gültigen Befehle. */
export function openCommandPalette() {
  const [query, setQuery] = signal('')
  const [cursor, setCursor] = signal(0)
  const results = computed(() => (query() ? searchCommands(query()) : activeCommands()).slice(0, 40))
  const popScope = pushScope('palette')

  const choose = (cmd: Command) => { handle.close(); runCommand(cmd.id) }

  const onKey = (e: Event) => {
    const k = (e as KeyboardEvent).key
    const list = results()
    if (k === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(list.length - 1, c + 1)) }
    else if (k === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
    else if (k === 'Enter') { e.preventDefault(); const cmd = list[cursor()]; if (cmd) choose(cmd) }
  }

  const handle = openLayer(() => h('div', { class: 'rc-palette' },
    h('div', { class: 'rc-palette-input' },
      Icon('search', { size: 15 }),
      h('input', {
        type: 'text', placeholder: 'Befehl suchen …', autofocus: true, 'aria-label': 'Befehl suchen',
        onInput: (e: Event) => { setQuery((e.target as HTMLInputElement).value); setCursor(0) },
        onKeyDown: onKey,
      }),
      h('kbd', { class: 'rc-kbd' }, 'Esc'),
    ),
    h('div', { class: 'rc-palette-list', role: 'listbox' },
      For(results, c => c.id, (cmd, i) => h('button', {
        type: 'button', role: 'option',
        class: { 'rc-palette-item': true, 'is-cursor': () => cursor() === i() },
        'aria-selected': () => String(cursor() === i()),
        disabled: !isEnabled(cmd),
        onPointerEnter: () => setCursor(i()),
        onClick: () => choose(cmd),
      },
        cmd.icon && Icon(cmd.icon as IconName, { size: 14 }),
        h('span', { class: 'rc-palette-group' }, cmd.group),
        h('span', { class: 'rc-palette-title' }, cmd.title),
        cmd.keys?.[0] && h('kbd', { class: 'rc-kbd' }, shortcutFor(cmd.id)),
      )),
      Show(() => results().length === 0, () => h('div', { class: 'rc-palette-empty' }, 'Kein Befehl gefunden')),
    ),
  ), { kind: 'dialog', modal: true, class: 'rc-palette-layer', onClose: popScope })

  const scrim = h('div', { class: 'rc-scrim' })
  handle.el.parentElement?.insertBefore(scrim, handle.el)
  const close = handle.close
  return { close: () => { scrim.remove(); close() } }
}

/** Tastaturhilfe, direkt aus dem Befehlsregister erzeugt. */
export function openShortcutHelp() {
  const groups = new Map<string, Command[]>()
  for (const c of activeCommands()) {
    if (!c.keys?.length) continue
    const list = groups.get(c.group) ?? []
    list.push(c)
    groups.set(c.group, list)
  }
  return openDialog({ title: 'Tastenkürzel', subtitle: 'Alle Kürzel des aktuellen Bereichs', icon: 'help', width: 620 },
    h('div', { class: 'rc-shortcut-grid' },
      ...Array.from(groups.entries()).map(([group, cmds]) => h('section', null,
        h('h3', { class: 'rc-shortcut-group' }, group),
        ...cmds.map(c => h('div', { class: 'rc-shortcut-row' },
          h('span', c.title),
          h('kbd', { class: 'rc-kbd' }, shortcutFor(c.id)))),
      )),
    ))
}

void untrack

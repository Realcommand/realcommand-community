// Real Command UI-Engine · Befehle und Tastatur
// =============================================================================
// Jede Handlung der Oberfläche ist ein benannter Befehl. Knöpfe, Menüeinträge,
// Tastenkürzel, die Befehlspalette und – später – die API-Agenten lösen
// denselben Befehl aus. Das hat drei Folgen, die man sofort merkt:
//   · Kürzel sind an einer Stelle definiert und nirgends doppelt vergeben.
//   · Die Hilfe schreibt sich selbst aus dem Register.
//   · Ein deaktivierter Befehl ist überall deaktiviert, nicht nur im Menü.
//
// Gültigkeitsbereiche stapeln sich: Ein offener Dialog schiebt seinen Bereich
// oben auf, seine Kürzel gewinnen, und die darunter ruhen so lange.

import { signal, computed, type Accessor } from './signal.ts'

export interface Command {
  id: string
  title: string
  /** Gruppierung in Palette und Hilfe. */
  group: string
  /** Kürzel in Schreibweise "mod+k", "shift+?", "g s" (Folge). */
  keys?: string[]
  /** In welchem Bereich das Kürzel gilt. Ohne Angabe: global. */
  scope?: string
  description?: string
  icon?: string
  /** Liefert false, wenn der Befehl gerade nicht sinnvoll ist. */
  enabled?: Accessor<boolean>
  run: (arg?: unknown) => void
}

const registry = new Map<string, Command>()
const [version, bumpVersion] = signal(0)
const [scopes, setScopes] = signal<string[]>(['global'])

/** Registriert einen Befehl. Der Rückgabewert entfernt ihn wieder. */
export function defineCommand(cmd: Command): () => void {
  if (registry.has(cmd.id)) throw new Error(`Befehl doppelt vergeben: ${cmd.id}`)
  const conflict = cmd.keys && findKeyConflict(cmd)
  if (conflict) {
    console.warn(`Tastenkürzel doppelt: "${conflict.key}" ist bereits an ${conflict.id} vergeben (Bereich ${conflict.scope ?? 'global'})`)
  }
  registry.set(cmd.id, cmd)
  bumpVersion(v => v + 1)
  return () => { registry.delete(cmd.id); bumpVersion(v => v + 1) }
}

export function defineCommands(list: Command[]): () => void {
  const offs = list.map(defineCommand)
  return () => { for (const off of offs) off() }
}

function findKeyConflict(cmd: Command): { key: string, id: string, scope?: string } | null {
  for (const key of cmd.keys ?? []) {
    const norm = normalizeCombo(key)
    for (const other of registry.values()) {
      if ((other.scope ?? 'global') !== (cmd.scope ?? 'global')) continue
      for (const k of other.keys ?? []) if (normalizeCombo(k) === norm) return { key, id: other.id, scope: other.scope }
    }
  }
  return null
}

export function getCommand(id: string): Command | undefined { return registry.get(id) }

export function allCommands(): Command[] {
  version()
  return Array.from(registry.values())
}

/** Befehle, die im aktuellen Bereich gelten – für Palette und Hilfe. */
export const activeCommands: Accessor<Command[]> = computed(() => {
  const active = scopes()
  return allCommands().filter(c => active.includes(c.scope ?? 'global'))
})

export function isEnabled(cmd: Command): boolean {
  return cmd.enabled ? !!cmd.enabled() : true
}

/** Führt einen Befehl aus, wenn er zulässig ist. Liefert, ob er lief. */
export function run(id: string, arg?: unknown): boolean {
  const cmd = registry.get(id)
  if (!cmd) { console.warn('Unbekannter Befehl:', id); return false }
  if (!isEnabled(cmd)) return false
  cmd.run(arg)
  return true
}

// ---------------------------------------------------------------------------
// Gültigkeitsbereiche
// ---------------------------------------------------------------------------

/** Schiebt einen Bereich auf den Stapel. Der Rückgabewert nimmt ihn wieder herunter. */
export function pushScope(name: string): () => void {
  setScopes(s => [...s, name])
  return () => setScopes(s => { const i = s.lastIndexOf(name); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)] })
}

export const currentScopes: Accessor<string[]> = scopes

// ---------------------------------------------------------------------------
// Tastenerkennung
// ---------------------------------------------------------------------------

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** "mod" ist Cmd auf dem Mac und Strg sonst. */
export function normalizeCombo(combo: string): string {
  const parts = combo.trim().toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  const mods = new Set<string>()
  let key = ''
  for (const p of parts) {
    if (p === 'mod') mods.add(isMac ? 'meta' : 'ctrl')
    else if (p === 'cmd' || p === 'meta') mods.add('meta')
    else if (p === 'ctrl' || p === 'control') mods.add('ctrl')
    else if (p === 'shift') mods.add('shift')
    else if (p === 'alt' || p === 'option') mods.add('alt')
    else key = p
  }
  return [...['ctrl', 'alt', 'shift', 'meta'].filter(m => mods.has(m)), key].join('+')
}

function comboFromEvent(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('ctrl')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')
  if (e.metaKey) mods.push('meta')
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  else if (key === 'escape') key = 'esc'
  else if (key === 'arrowup') key = 'up'
  else if (key === 'arrowdown') key = 'down'
  else if (key === 'arrowleft') key = 'left'
  else if (key === 'arrowright') key = 'right'
  return [...mods, key].join('+')
}

/** Anzeigeform eines Kürzels: "⌘K" auf dem Mac, "Strg+K" sonst. */
export function displayCombo(combo: string): string {
  const parts = normalizeCombo(combo).split('+')
  const key = parts.pop() ?? ''
  const map: Record<string, string> = isMac
    ? { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { ctrl: 'Strg', alt: 'Alt', shift: 'Umschalt', meta: 'Win' }
  const label = key.length === 1 ? key.toUpperCase()
    : { esc: 'Esc', space: 'Leer', up: '↑', down: '↓', left: '←', right: '→', enter: '↵', backspace: '⌫', delete: 'Entf', tab: '⇥' }[key] ?? key.toUpperCase()
  const shown = parts.map(p => map[p] ?? p)
  return isMac ? shown.join('') + label : [...shown, label].join('+')
}

// Sequenzen wie "g s": erste Taste öffnet ein kurzes Zeitfenster.
let sequence: string[] = []
let sequenceTimer = 0
const SEQUENCE_MS = 900

function matches(cmd: Command, combo: string): boolean {
  for (const raw of cmd.keys ?? []) {
    const steps = raw.trim().split(/\s+/)
    if (steps.length === 1) { if (normalizeCombo(steps[0]) === combo) return true; continue }
    const wanted = steps.map(normalizeCombo)
    const tail = [...sequence, combo].slice(-wanted.length)
    if (tail.length === wanted.length && tail.every((c, i) => c === wanted[i])) return true
  }
  return false
}

function anySequenceStartsWith(prefix: string[]): boolean {
  for (const cmd of registry.values()) {
    for (const raw of cmd.keys ?? []) {
      const steps = raw.trim().split(/\s+/).map(normalizeCombo)
      if (steps.length > 1 && steps.length > prefix.length && prefix.every((c, i) => c === steps[i])) return true
    }
  }
  return false
}

/** In Eingabefeldern dürfen nur Kürzel mit Zusatztaste zünden. */
function isTextEntry(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node || !node.tagName) return false
  const tag = node.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable
}

let attached = false

/** Hängt die Tastaturerkennung ans Fenster. Einmal beim Start rufen. */
export function installKeyboard(target: Window | HTMLElement = window): () => void {
  if (attached) return () => {}
  attached = true
  const handler = (ev: Event) => {
    const e = ev as KeyboardEvent
    if (e.defaultPrevented || e.repeat) return
    const combo = comboFromEvent(e)
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey
    if (isTextEntry(e.target) && plain && combo !== 'esc') return

    const active = scopes()
    // Von oben nach unten: der zuletzt geöffnete Bereich gewinnt.
    for (let i = active.length - 1; i >= 0; i--) {
      const scopeName = active[i]
      for (const cmd of registry.values()) {
        if ((cmd.scope ?? 'global') !== scopeName) continue
        if (!matches(cmd, combo)) continue
        if (!isEnabled(cmd)) continue
        e.preventDefault()
        clearSequence()
        cmd.run()
        return
      }
    }
    // Kein Treffer: vielleicht der Anfang einer Folge.
    const prefix = [...sequence, combo]
    if (anySequenceStartsWith(prefix)) {
      sequence = prefix
      clearTimeout(sequenceTimer)
      sequenceTimer = window.setTimeout(clearSequence, SEQUENCE_MS)
      e.preventDefault()
    } else clearSequence()
  }
  target.addEventListener('keydown', handler as EventListener)
  return () => {
    attached = false
    target.removeEventListener('keydown', handler as EventListener)
  }
}

function clearSequence() {
  sequence = []
  clearTimeout(sequenceTimer)
  sequenceTimer = 0
}

/** Das Kürzel eines Befehls in Anzeigeform, für Knöpfe und Menüs. */
export function shortcutFor(id: string): string {
  const cmd = registry.get(id)
  const first = cmd?.keys?.[0]
  if (!first) return ''
  return first.trim().split(/\s+/).map(displayCombo).join(' ')
}

/** Unscharfe Suche für die Befehlspalette: Buchstaben in Reihenfolge, Treffer gewichtet. */
export function fuzzyScore(text: string, query: string): number {
  if (!query) return 1
  const t = text.toLowerCase(), q = query.toLowerCase()
  let score = 0, ti = 0, streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]
    const found = t.indexOf(c, ti)
    if (found < 0) return 0
    streak = found === ti ? streak + 1 : 0
    score += 1 + streak * 2 + (found === 0 || t[found - 1] === ' ' || t[found - 1] === '·' ? 3 : 0)
    ti = found + 1
  }
  return score / (1 + t.length * 0.01)
}

export function searchCommands(query: string): Command[] {
  return activeCommands()
    .map(c => ({ c, s: Math.max(fuzzyScore(c.title, query), fuzzyScore(c.group + ' ' + c.title, query) * 0.9) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.c)
}

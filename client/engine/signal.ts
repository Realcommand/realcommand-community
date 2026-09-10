// Real Command UI-Engine · Reaktivität
// =============================================================================
// Feingranulare Signale nach dem Push-Pull-Verfahren. Kein virtuelles DOM, kein
// Diffing: wer einen Wert liest, wird beim Schreiben genau dort aktualisiert.
//
// Warum selbst gebaut und nicht eine Bibliothek: Die Oberfläche liegt über einer
// Simulation, die mit 10 Hz Zustände liefert und mit 60 Hz zeichnet. Die Engine
// muss ihre Arbeit deshalb an den Bildtakt hängen können (flushFrame) statt an
// Microtasks, und sie muss in einer Schleife zehntausende Aktualisierungen
// verschlucken, ohne Speicher zu fressen.
//
// Kernbegriffe
//   signal(v)     – veränderlicher Wert
//   computed(fn)  – abgeleiteter Wert, faul und gemerkt
//   effect(fn)    – Nebenwirkung, läuft erneut, wenn eine Abhängigkeit sich ändert
//   batch(fn)     – mehrere Schreibvorgänge, ein Durchlauf
//   scope(fn)     – Lebensdauer: alles darin wird gemeinsam entsorgt

export type Accessor<T> = () => T
export type Setter<T> = (next: T | ((prev: T) => T)) => T
export type Signal<T> = [Accessor<T>, Setter<T>]

const enum State { CLEAN = 0, CHECK = 1, DIRTY = 2 }

interface Node {
  /** Rechenvorschrift; fehlt bei reinen Signalen. */
  fn?: () => unknown
  value: unknown
  state: State
  /** Knoten, von denen dieser liest. */
  sources: Node[] | null
  /** Knoten, die von diesem lesen. */
  observers: Node[] | null
  /** Aufräumfunktionen aus onCleanup. */
  cleanups: (() => void)[] | null
  /** Kindknoten, die mit diesem sterben. */
  children: Node[] | null
  owner: Node | null
  /** Effekte werden geplant, berechnete Werte nicht. */
  effect: boolean
  /** Vergleich, um unnötige Ausbreitung zu vermeiden. */
  equals: false | ((a: unknown, b: unknown) => boolean)
  disposed: boolean
}

let listener: Node | null = null
let owner: Node | null = null
let batchDepth = 0
let pending: Node[] = []
let pendingSet: Set<Node> | null = null
let flushScheduled = false
let frameMode = false

const defaultEquals = (a: unknown, b: unknown) => a === b

function makeNode(partial: Partial<Node>): Node {
  return {
    fn: undefined,
    value: undefined,
    state: State.CLEAN,
    sources: null,
    observers: null,
    cleanups: null,
    children: null,
    owner,
    effect: false,
    equals: defaultEquals,
    disposed: false,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Lesen und Schreiben
// ---------------------------------------------------------------------------

function readNode(node: Node): unknown {
  if (node.disposed) return node.value
  if (listener) link(node, listener)
  if (node.fn) {
    if (node.state === State.CHECK) resolveCheck(node)
    if (node.state === State.DIRTY) recompute(node)
  }
  return node.value
}

function link(source: Node, target: Node) {
  ;(source.observers ??= []).push(target)
  ;(target.sources ??= []).push(source)
}

/** Ein CHECK-Knoten weiß nur, dass eine Quelle sich geändert haben könnte. */
function resolveCheck(node: Node) {
  const sources = node.sources
  if (!sources) { node.state = State.CLEAN; return }
  for (const s of sources) {
    if (s.fn) {
      if (s.state === State.CHECK) resolveCheck(s)
      if (s.state === State.DIRTY) recompute(s)
    }
    // recompute setzt bei echter Änderung unseren Zustand auf DIRTY
    if ((node.state as State) === State.DIRTY) return
  }
  node.state = State.CLEAN
}

function recompute(node: Node) {
  const prevValue = node.value
  runWithOwner(node, () => {
    disposeChildren(node)
    unlinkSources(node)
    const prevListener = listener
    listener = node
    try {
      node.value = node.fn!()
    } finally {
      listener = prevListener
    }
  })
  node.state = State.CLEAN
  const eq = node.equals
  const changed = eq === false ? true : !eq(prevValue, node.value)
  if (changed) markObservers(node, State.DIRTY)
}

function markObservers(node: Node, state: State) {
  const observers = node.observers
  if (!observers) return
  for (const o of observers) {
    if (o.disposed) continue
    if (o.state >= state) continue
    const wasClean = o.state === State.CLEAN
    o.state = state
    if (o.effect) { if (wasClean) schedule(o) }
    else if (wasClean) markObservers(o, State.CHECK)
  }
}

function unlinkSources(node: Node) {
  const sources = node.sources
  if (!sources) return
  for (const s of sources) {
    const obs = s.observers
    if (!obs) continue
    const i = obs.indexOf(node)
    if (i >= 0) { obs[i] = obs[obs.length - 1]; obs.pop() }
  }
  node.sources = null
}

// ---------------------------------------------------------------------------
// Planung: Microtask im Normalfall, Bildtakt im Spielbetrieb
// ---------------------------------------------------------------------------

function schedule(node: Node) {
  if (pendingSet) { if (pendingSet.has(node)) return; pendingSet.add(node) }
  pending.push(node)
  if (pending.length > 64 && !pendingSet) pendingSet = new Set(pending)
  if (batchDepth > 0 || frameMode || flushScheduled) return
  flushScheduled = true
  queueMicrotask(flush)
}

/**
 * Aktualisierungen an den Bildtakt hängen. Danach muss der Aufrufer je Bild
 * flushFrame() rufen. Das verhindert, dass ein Zustandspaket vom Server
 * hunderte Zwischenzustände ins DOM schreibt.
 */
export function useFrameScheduling(on = true) {
  frameMode = on
  if (!on && pending.length) { flushScheduled = true; queueMicrotask(flush) }
}

/** Alle anstehenden Effekte jetzt ausführen. Im Bildtakt einmal pro Frame rufen. */
export function flushFrame() { flush() }

function flush() {
  flushScheduled = false
  let guard = 0
  while (pending.length) {
    if (++guard > 100) {
      // Endlosschleife: ein Effekt schreibt in seine eigene Quelle.
      pending.length = 0
      pendingSet = null
      throw new Error('signal: Aktualisierung konvergiert nicht (Effekt schreibt in eigene Abhängigkeit?)')
    }
    const run = pending
    pending = []
    pendingSet = null
    for (const node of run) {
      if (node.disposed || node.state === State.CLEAN) continue
      if (node.state === State.CHECK) resolveCheck(node)
      if (node.state === State.DIRTY) recompute(node)
      else node.state = State.CLEAN
    }
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++
  try { return fn() } finally {
    batchDepth--
    if (batchDepth === 0 && !frameMode && pending.length && !flushScheduled) {
      flushScheduled = true
      queueMicrotask(flush)
    }
  }
}

/** Lesen, ohne eine Abhängigkeit zu erzeugen. */
export function untrack<T>(fn: () => T): T {
  const prev = listener
  listener = null
  try { return fn() } finally { listener = prev }
}

// ---------------------------------------------------------------------------
// Lebensdauer
// ---------------------------------------------------------------------------

function runWithOwner<T>(next: Node | null, fn: () => T): T {
  const prev = owner
  owner = next
  try { return fn() } finally { owner = prev }
}

function disposeChildren(node: Node) {
  const kids = node.children
  if (kids) { for (const k of kids) disposeNode(k); node.children = null }
  const cleanups = node.cleanups
  if (cleanups) { for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i](); node.cleanups = null }
}

function disposeNode(node: Node) {
  if (node.disposed) return
  node.disposed = true
  disposeChildren(node)
  unlinkSources(node)
  node.observers = null
  node.value = undefined
}

/** Aufräumen, wenn der umgebende Bereich stirbt oder ein Effekt neu läuft. */
export function onCleanup(fn: () => void) {
  if (owner) (owner.cleanups ??= []).push(fn)
}

/** Ein Lebensdauer-Bereich. Der Rückgabewert entsorgt alles darin. */
export function scope<T>(fn: (dispose: () => void) => T): [T, () => void] {
  const node = makeNode({})
  if (owner) (owner.children ??= []).push(node)
  const dispose = () => disposeNode(node)
  const value = runWithOwner(node, () => fn(dispose))
  return [value, dispose]
}

/** Der aktuelle Bereich, um ihn an asynchrone Fortsetzungen weiterzureichen. */
export function getOwner(): unknown { return owner }
export function withOwner<T>(o: unknown, fn: () => T): T { return runWithOwner(o as Node | null, fn) }

// ---------------------------------------------------------------------------
// Öffentliche Bausteine
// ---------------------------------------------------------------------------

export interface SignalOptions<T> { equals?: false | ((a: T, b: T) => boolean) }

export function signal<T>(value: T, options?: SignalOptions<T>): Signal<T> {
  const node = makeNode({
    value,
    equals: options?.equals === undefined ? defaultEquals : (options.equals as Node['equals']),
  })
  const read = () => readNode(node) as T
  const write: Setter<T> = (next) => {
    const nextValue = typeof next === 'function' ? (next as (p: T) => T)(node.value as T) : next
    const eq = node.equals
    if (eq !== false && eq(node.value, nextValue)) return node.value as T
    node.value = nextValue
    markObservers(node, State.DIRTY)
    if (batchDepth === 0 && !frameMode && pending.length && !flushScheduled) {
      flushScheduled = true
      queueMicrotask(flush)
    }
    return nextValue
  }
  return [read, write]
}

export function computed<T>(fn: () => T, options?: SignalOptions<T>): Accessor<T> {
  const node = makeNode({
    fn: fn as () => unknown,
    state: State.DIRTY,
    equals: options?.equals === undefined ? defaultEquals : (options.equals as Node['equals']),
  })
  if (owner) (owner.children ??= []).push(node)
  return () => readNode(node) as T
}

export function effect(fn: () => void): () => void {
  const node = makeNode({ fn: fn as () => unknown, state: State.DIRTY, effect: true, equals: false })
  if (owner) (owner.children ??= []).push(node)
  recompute(node)
  return () => disposeNode(node)
}

/** Effekt, der erst beim nächsten Durchlauf feuert und den vorherigen Wert kennt. */
export function watch<T>(source: Accessor<T>, fn: (value: T, prev: T | undefined) => void, immediate = false) {
  let prev: T | undefined
  let first = true
  return effect(() => {
    const value = source()
    if (first && !immediate) { first = false; prev = value; return }
    first = false
    untrack(() => fn(value, prev))
    prev = value
  })
}

/** Bequemer Zugriff, wenn ein Wert auch eine Funktion sein darf. */
export type MaybeAccessor<T> = T | Accessor<T>
export function read<T>(v: MaybeAccessor<T>): T {
  return typeof v === 'function' ? (v as Accessor<T>)() : v
}

/** Reaktiver Speicher für flache Objekte: store.x liest, setStore({x}) schreibt. */
export function store<T extends object>(initial: T): [T, (patch: Partial<T>) => void] {
  const signals = new Map<string | symbol, Signal<unknown>>()
  const sig = (k: string | symbol, v: unknown) => {
    let s = signals.get(k)
    if (!s) signals.set(k, s = signal(v))
    return s
  }
  for (const k of Object.keys(initial)) sig(k, (initial as Record<string, unknown>)[k])
  const proxy = new Proxy(initial, {
    get(target, k) { return k in target || signals.has(k) ? sig(k, (target as Record<string | symbol, unknown>)[k])[0]() : undefined },
    set() { throw new Error('store: direkt schreiben ist nicht erlaubt, benutze die Setzfunktion') },
  }) as T
  const set = (patch: Partial<T>) => batch(() => {
    for (const k of Object.keys(patch) as (keyof T)[]) {
      const v = patch[k]
      ;(initial as Record<string, unknown>)[k as string] = v
      sig(k as string, v)[1](v)
    }
  })
  return [proxy, set]
}

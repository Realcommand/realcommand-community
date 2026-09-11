import type { Context } from 'cordis'
import { DEFS, type Category, type Def } from '../shared/data.ts'
import type { ProductionWire } from '../shared/protocol.ts'

/** Explicitly cancel one finished building, independently of the active queue. */
export function cancelReadyBuilding(ctx: Pick<Context, 'state' | 'link' | 'input'>, def: Def) {
  const { state, link, input } = ctx
  if (!state.me?.prod[def.category]?.ready.includes(def.id)) return
  link.send({ t: 'cancel', category: def.category, readyType: def.id })
  if (input.placing === def.id) input.placing = undefined
}

/** Eine Kategorie beschäftigt: sie baut, hat Aufträge oder etwas Fertiges liegen. */
export function categoryBusy(slot: ProductionWire | undefined): boolean {
  return !!slot && (!!slot.type || slot.queue.length > 0 || slot.ready.length > 0)
}

/**
 * Welche Kategorie die Warteschlangenzeile zeigt: bevorzugt den offenen Reiter,
 * sonst die erste, in der wirklich etwas passiert. Ohne diese Umleitung stand
 * „Keine Produktion aktiv“ da, während die Fahrzeughalle baute.
 */
export function shownCategory(
  prod: Partial<Record<Category, ProductionWire>>,
  tab: Category,
  order: readonly Category[],
): Category | undefined {
  if (categoryBusy(prod[tab])) return tab
  return order.find(cat => categoryBusy(prod[cat]))
}

/**
 * Was der Bauen-Knopf der unteren Leiste trägt: der weiteste laufende Fortschritt,
 * die Zahl fertiger Bauten und ob etwas klemmt. Auf schmalen Fenstern ist das die
 * einzige Stelle, an der man die Produktion überhaupt sieht.
 */
export function productionMark(prod: Partial<Record<Category, ProductionWire>>, order: readonly Category[]) {
  let progress = 0, ready = 0, blocked = false
  for (const cat of order) {
    const slot = prod[cat]
    if (!slot) continue
    ready += slot.ready.length
    if (!slot.type) continue
    progress = Math.max(progress, slot.progress ?? 0)
    if (slot.blocked) blocked = true
  }
  return { progress, ready, blocked }
}

export type CancelKind = 'queued' | 'active' | 'ready'
export interface CancelTarget {
  kind: CancelKind
  message: { t: 'cancel', category: Category, index?: number, readyType?: string }
}

/**
 * Was ein Abbruch für diesen Bauplan bedeutet. Der Server erstattet in allen drei
 * Fällen die vollen Kosten, deshalb darf der Knopf ohne Rückfrage auslösen.
 *
 * `prefer` entscheidet die Reihenfolge: der Knopf an der Karte räumt zuerst den
 * fertigen Bau weg (er belegt den Platz in der Halle), der Rechtsklick nimmt
 * zuerst den zuletzt eingereihten Auftrag zurück – das übliche „einmal zu oft geklickt“.
 */
export function cancelTarget(
  prod: Partial<Record<Category, ProductionWire>>,
  def: Def,
  prefer: 'ready' | 'queue' = 'queue',
): CancelTarget | undefined {
  const slot = prod[def.category]
  if (!slot) return undefined
  const category = def.category
  const ready = (): CancelTarget | undefined =>
    slot.ready.includes(def.id) ? { kind: 'ready', message: { t: 'cancel', category, readyType: def.id } } : undefined
  const queued = (): CancelTarget | undefined => {
    const index = slot.queue.lastIndexOf(def.id)
    return index >= 0 ? { kind: 'queued', message: { t: 'cancel', category, index } } : undefined
  }
  const active = (): CancelTarget | undefined =>
    slot.type === def.id ? { kind: 'active', message: { t: 'cancel', category } } : undefined
  return prefer === 'ready' ? (ready() ?? active() ?? queued()) : (queued() ?? active() ?? ready())
}

/** Beschriftung des Abbruchknopfes – jeder Fall heißt anders, damit klar ist, was verschwindet. */
export const CANCEL_LABEL: Record<CancelKind, string> = {
  ready: 'Stornieren',
  active: 'Bau abbrechen',
  queued: 'Auftrag streichen',
}

/**
 * Was fehlt, um diesen Bauplan freizuschalten: die Voraussetzungen, von denen der
 * Spieler noch kein Gebäude besitzt. Der Server entscheidet dasselbe (`available`),
 * aber nur die Liste hier sagt auch **welches** Gebäude fehlt – und darauf zeigt
 * die Oberfläche einen Kurzweg.
 */
export function missingPrereqs(
  def: Def,
  owned: Iterable<{ owner?: number, kind?: string, type?: string }>,
  myId: number | undefined,
): string[] {
  const prereq = (def as { prereq?: string[] }).prereq
  if (!prereq?.length) return []
  const have = new Set<string>()
  for (const e of owned) if (e.owner === myId && e.kind === 'b' && e.type) have.add(e.type)
  return prereq.filter(id => !have.has(id) && DEFS[id])
}

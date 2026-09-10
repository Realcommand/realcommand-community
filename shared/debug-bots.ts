import { WORLD_W, WORLD_H } from './constants.ts'
import type { CivicReport } from './civic.ts'

export const MAX_DEBUG_BOTS = 10_000
export const BOT_PLAN = ['housing', 'farm', 'power', 'market_hall', 'civic_workshop', 'school', 'training_center', 'office', 'power', 'farm', 'housing', 'civic_workshop', 'skyscraper', 'farm', 'civic_workshop', 'transport_hub', 'farm', 'farm'] as const
export interface DebugBotState {
  index: number, stage: number, lastSim: number, blocked?: string,
  diplomacyTurn?:number, nextDiplomacyAt?:number, intent?:'trade'|'war', partner?:number, diplomacyNote?:string,
  /** Game time of the next decision. Cities without a pending decision sleep. */
  wakeAt?: number,
  /** Completed developments after the opening plan. */
  grown?: number,
  /** Spielzeit der nächsten Bündnis-Hilferufe dieser Stadt. */
  nextCallAt?: number,
  /** Wohin diese Stadt einem angegriffenen Verbündeten zu Hilfe zieht. */
  helpAt?: { x: number, y: number },
  /** Spielzeit des nächsten möglichen Gegenschlags gegen den Angreifer. */
  raidAt?: number,
  /** Made way for a landed human and never returns. */
  retired?: boolean,
}
export interface DebugBotRun { target: number, seed: number, candidate: number, running: boolean, error?: string }
export interface BotPoint { id: number, index: number, x: number, y: number, stage: number }
export interface BotStatus {
  target: number, spawned: number, running: boolean, seed: number, settled: number, blocked: number,
  buildings: number, residents: number, stages: number, humans: number, connections: number,
  lastPulseMs: number, maxPulseMs: number, decisions: number, error?: string,
  trades:number, wars:number, activeWars:number,
  /** Development beyond the opening plan and the cost of running it. */
  developing: number, grown: number, upgrades: number, asleep: number, skipped: number,
  limit: number, avgPulseMs: number, pulses: number, sweeps: number,
}
export interface BotDetail {
  id: number, index: number, name: string, stage: number, totalStages: number, blocked?: string,
  grown: number, sleepingFor: number, next?: string,
  home: { x: number, y: number }, civic: CivicReport,
  diplomacy:{intent?:'trade'|'war',partner?:number,note?:string},
  production?: { type?: string, progress: number, ready: string[] },
  entities: { id: number, type: string, owner: number, x: number, y: number, heading: number, hp: number }[],
}
export function botRoll(seed:number,index:number,turn:number,salt=0) {
  let x=(Math.imul(seed+1,0x9e3779b1)^Math.imul(index,0x85ebca6b)^Math.imul(turn+salt,0xc2b2ae35))>>>0
  x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b)
  return ((x^(x>>>16))>>>0)/4294967296
}
function halton(index: number, base: number) {
  let value = 0, fraction = 1
  while (index > 0) { fraction /= base; value += fraction * (index % base); index = Math.floor(index / base) }
  return value
}
/** Reproducible equal-area candidate sequence across habitable latitudes. */
export function botCandidate(index: number, seed: number) {
  const u = (halton(index + 1, 2) + (seed * .61803398875) % 1) % 1
  const v = halton(index + 1, 3)
  const low = Math.sin(-55 * Math.PI / 180), high = Math.sin(75 * Math.PI / 180)
  const latitude = Math.asin(low + (high - low) * v) * 180 / Math.PI
  return { x: (.001 + u * .998) * WORLD_W, y: (90 - latitude) / 180 * WORLD_H }
}
/** Distinct plots remain within the existing 2.5 km construction radius. */
export function botPlot(stage: number, attempt = 0) {
  const index = stage + attempt * BOT_PLAN.length
  const ring = Math.floor(index / 16) + 1
  const angle = index % 16 * Math.PI / 8
  return { x: Math.cos(angle) * (180 + ring * 150), y: Math.sin(angle) * (180 + ring * 150) }
}

/**
 * Entity budget of a single bot city. Ten thousand cities share one process, so
 * a city grows in value through upgrades once it reaches this many buildings —
 * never in objects. MAX_BUILDINGS_PER_PLAYER stays the rule for human players.
 */
export const BOT_CITY_LIMIT = 32
/** Power headroom kept free so the next civic building never browns out the city. */
export const BOT_POWER_MARGIN = 12
/** Longest a settled city sleeps between two aggregate economy steps (game seconds). */
export const BOT_MAX_SLEEP = 300
/** Shortest gap between two decisions of the same city (game seconds). */
export const BOT_MIN_SLEEP = 5

/**
 * Wehrhaftigkeit einer Stadt. Ohne sie ist jede Siedlung ein Selbstbedienungs-
 * laden: Angreifer schießen ungestört. Die Bauten sind statisch – kein Bot
 * unterhält eine stehende Armee, das würde bei 10.000 Städten nichts als Last
 * erzeugen. Sie zählen nicht gegen das zivile Gebäudebudget.
 */
export const BOT_DEFENCE = ['barracks', 'turret', 'turret', 'turret', 'turret', 'refinery', 'radar', 'factory', 'tech', 'turret', 'turret', 'turret', 'turret'] as const
/**
 * Stehende Garnison jeder ausgebauten Stadt. Sie kostet keinen Rechenschritt,
 * solange niemand angreift – Bot-Einheiten werden nur im Alarmfall simuliert –,
 * aber sie ist der Unterschied zwischen „wehrt sich" und „stirbt beim Aufwachen".
 */
export const BOT_GARRISON = 10
/** Aufwuchs unter Beschuss: so viele Verteidiger stellt eine Stadt im Alarm auf. */
export const BOT_DEFENDERS = 16
/**
 * Sichtweite der Frühwarnung. 40 km sind bei 60 km/h vierzig Minuten Vorwarnzeit –
 * genug, um die Fabrik anzuwerfen, statt beim ersten Einschlag aufzuwachen.
 */
export const BOT_WATCH_RANGE = 40_000
/** Umkreis, in dem verbündete Städte einer angegriffenen Stadt zu Hilfe kommen. */
export const BOT_HELP_RANGE = 160_000
/**
 * Womit sich eine Stadt wehrt, in dieser Reihenfolge. Geschütztürme reichen 950 m
 * und werden von Artillerie (2.600 m) aus sicherer Entfernung zerlegt; ohne
 * eigene Gegenbatterie ist eine Stadt trotz Türmen wehrlos.
 */
export const BOT_DEFENDER_TYPES = ['mlrs', 'heavytank', 'artillery', 'mbt', 'lighttank'] as const
/** Zweite Fertigungslinie: Infanterie läuft parallel zur Fahrzeugproduktion. */
export const BOT_DEFENDER_INFANTRY = ['sniper', 'rocketeer'] as const
export const BOT_DEFENDER_TYPE = BOT_DEFENDER_INFANTRY[1]
/** Wie lange eine beschossene Stadt nach dem letzten Treffer wach bleibt (Spielsekunden). */
export const BOT_ALERT = 300
export const isBotDefence = (type: string) => (BOT_DEFENCE as readonly string[]).includes(type)

export type BotStep = { kind: 'build', type: string } | { kind: 'upgrade' }
export interface BotCity {
  /** All buildings including headquarters and power plants. */
  buildings: number
  powerProd: number
  powerCons: number
  limit?: number
  /** Vorhandene Abwehrbauten aus BOT_DEFENCE. */
  defence?: number
  /** Die Stadt steht unter Beschuss: Abwehr geht allem anderen vor. */
  threatened?: boolean
}

/**
 * The endless development rule: pick the one building that widens the tightest
 * bottleneck of this city, in prerequisite order. Pure and deterministic — the
 * same report always yields the same step, which is what makes it testable and
 * cheap enough for ten thousand cities.
 */
export function botNextStep(report: CivicReport, city: BotCity): BotStep | undefined {
  const b = report.buildings, limit = city.limit ?? BOT_CITY_LIMIT
  const defence = city.defence ?? 0
  // Abwehrbauten haben ein eigenes Budget und blockieren den Stadtausbau nicht.
  const room = city.buildings - defence < limit
  const build = (type: string): BotStep => ({ kind: 'build', type })
  // Unter Beschuss zählt nur noch, was zurückschießt.
  if (city.threatened && defence < BOT_DEFENCE.length) return build(BOT_DEFENCE[defence])
  // Vertical housing is the only way past 80 residents; it needs the full chain.
  const canUpgrade = b.housing > 0 && b.office > 0 && b.training_center > 0 && b.transport_hub > 0
  if (room) {
    if (!b.housing) return build('housing')
    if (city.powerProd - city.powerCons < BOT_POWER_MARGIN) return build('power')
    if (!b.farm) return build('farm')
    // A city only starves once it has mouths to feed; an empty one must not stall here.
    if (report.stock.food < 60 || (report.residents > 0 && report.foodPerMinute <= 0)) return build('farm')
    if (!b.market_hall) return build('market_hall')
    if (!b.civic_workshop) return build('civic_workshop')
    if (!b.school) return build('school')
    if (!b.transport_hub) return build('transport_hub')
    if (!b.training_center) return build('training_center')
    if (!b.office) return build('office')
  }
  // Erst wenn die Stadt trägt, wird sie wehrhaft – vor jedem weiteren Wachstum.
  if (defence < BOT_DEFENCE.length) return build(BOT_DEFENCE[defence])
  // Which of the three growth ceilings actually binds right now?
  const network = report.infrastructure
  const vertical = 80 + b.skyscraper * 160
  const serviced = 80 + 300 * b.transport_hub * (network.total ? Math.min(1, network.connected / network.total) : 0)
  const growth = Math.min(report.capacity, serviced, vertical)
  if (report.residents >= growth * .95) {
    if (vertical <= serviced && vertical <= report.capacity) return canUpgrade ? { kind: 'upgrade' } : room ? build('housing') : undefined
    if (serviced <= report.capacity) return room ? build('transport_hub') : canUpgrade ? { kind: 'upgrade' } : undefined
    return room ? build('housing') : canUpgrade ? { kind: 'upgrade' } : undefined
  }
  if (room) {
    if (report.goodsPerMinute <= 0) return build('civic_workshop')
    if (report.qualified >= report.educationSeats * .8) return build(b.training_center <= b.school ? 'training_center' : 'school')
    if (report.employed >= report.jobs * .9) return build('office')
    if (report.residents >= report.capacity * .8) return build('housing')
    if (network.connected < network.total) return build('transport_hub')
    return build('farm')
  }
  // At the entity limit the city keeps developing by replacing homes with towers.
  return canUpgrade && b.housing > 0 ? { kind: 'upgrade' } : undefined
}

/** When the next step becomes affordable, in game seconds. Keeps sleeping cities cheap. */
export function botSleep(missing: number, incomePerSecond: number): number {
  if (missing <= 0) return BOT_MIN_SLEEP
  if (!(incomePerSecond > 0)) return BOT_MAX_SLEEP
  return Math.min(BOT_MAX_SLEEP, Math.max(BOT_MIN_SLEEP, missing / incomePerSecond))
}

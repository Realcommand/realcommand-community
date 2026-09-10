import type { CivicReport } from './civic.ts'
import type { FireDiscipline, RouteWaypoint } from './tactics.ts'
/**
 * WebSocket-Protokoll (Server ↔ Client). v2-Typen (SPEC-v2 §13) stehen Seite an Seite mit v1:
 * v1-Mitglieder (`produce`, `cancel`, `place`, `bases`, `funds`, `prod`, `faction`) bleiben bis P2-T00 erhalten.
 * PROTOCOL_VERSION liegt in shared/constants.ts.
 */

import type { Category, FactionId } from './data.ts'
import type { Blueprint, BlueprintKind, BuildingClass } from './blueprints.ts'
import type { Goal, HintCode, ProtectedReason, TaskKind } from './pacing.ts'

// ---------------------------------------------------------------------------
// Befehle
// ---------------------------------------------------------------------------

/** v1-Befehle (Legacy-Einheiten). */
export type LegacyOrderKind = 'move' | 'attackmove' | 'attack' | 'stop' | 'harvest' | 'deploy' | 'load' | 'unload' | 'capture' | 'return' | 'guard' | 'fire'
/** v2-Befehle des Avatars (SPEC-v2 §6); Personen erhalten sie als Einmalbefehle (§10). */
export type AvatarOrderKind = 'gather' | 'hunt' | 'fish' | 'build' | 'work' | 'craft' | 'deposit' | 'pickup' | 'eat' | 'study' | 'equip' | 'explore'
export type OrderKind = LegacyOrderKind | AvatarOrderKind

export const LEGACY_ORDER_KINDS: readonly LegacyOrderKind[] = ['move', 'attackmove', 'attack', 'stop', 'harvest', 'deploy', 'load', 'unload', 'capture', 'return', 'guard', 'fire']
export const AVATAR_ORDER_KINDS: readonly AvatarOrderKind[] = ['gather', 'hunt', 'fish', 'build', 'work', 'craft', 'deposit', 'pickup', 'eat', 'study', 'equip', 'explore']
export const ORDER_KINDS: readonly OrderKind[] = [...LEGACY_ORDER_KINDS, ...AVATAR_ORDER_KINDS]

export type OrderSpec =
  // ---- v1 ----
  | { k: 'move', x: number, y: number, queued?: boolean, repeat?: boolean }
  | { k: 'attackmove', x: number, y: number, queued?: boolean, repeat?: boolean }
  | { k: 'fire', mode: FireDiscipline }
  | { k: 'attack', target: number }
  | { k: 'stop' }
  | { k: 'harvest', target?: number }
  | { k: 'deploy' }
  | { k: 'load', target: number }
  | { k: 'unload', x?: number, y?: number }
  | { k: 'capture', target: number }
  | { k: 'return' }
  | { k: 'guard' }
  // ---- v2 (§6) ----
  /** Sammeln: nächster Patch mit Bestand innerhalb `radius` (Standard 800 m) um `x,y` bzw. den Avatar; `patch` = Patch-Schlüssel. */
  | { k: 'gather', resource: string, patch?: number, x?: number, y?: number, n?: number, radius?: number }
  /** Jagen: `target` = Hirsch-Knoten, sonst der nächste innerhalb `radius`. */
  | { k: 'hunt', target?: number, radius?: number }
  /** Fischen: Sammel-Variante auf Fisch-Patches. */
  | { k: 'fish', patch?: number, x?: number, y?: number, n?: number, radius?: number }
  /** Bauen an einem Bauplatz (`target` = Bauplatz-Id). */
  | { k: 'build', target: number }
  /** Arbeiten an Bauplatz oder Rezeptgebäude. */
  | { k: 'work', target: number }
  /** Herstellen in der besten eigenen Werkstatt (`at` = Gebäude-Id, sonst automatisch). */
  | { k: 'craft', blueprint: string, n?: number, at?: number }
  /** Abliefern in `target` oder das nächste eigene Lager ≤ 400 m; `resources` = Teilmenge. */
  | { k: 'deposit', target?: number, resources?: string[] }
  /** Nachlass/Cache aufnehmen. */
  | { k: 'pickup', target: number }
  | { k: 'eat' }
  /** Studieren am besten eigenen Studiengebäude. */
  | { k: 'study', tag: string, at?: number }
  /** Werkzeug aus dem Pool ≤ 400 m nehmen (`tool` = Arbeitsart oder Bauplan-Id). */
  | { k: 'equip', tool: string }
  /** = move mit Sichthinweis. */
  | { k: 'explore', x: number, y: number }

/** Letzter beendeter Befehl (Avatar, §6). */
export interface LastOrderWire {
  k: OrderKind
  target?: number
  endedAt: number
  result?: Record<string, unknown>
  code?: string
}

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

/** Aufgabe auf dem Aufgabenbrett (§10) – Anlage und Änderung. */
export interface TaskSpec {
  settlement?: number
  kind?: TaskKind
  resource?: string
  blueprint?: string
  target?: number
  recipe?: string
  tag?: string
  x?: number
  y?: number
  radius?: number
  want?: number
  n?: number
  workers?: number
  priority?: number
  paused?: boolean
}

/** Entwurfsanfrage der Design-Engine (§9). */
export interface DesignRequest {
  name: string
  kind: BlueprintKind
  class: BuildingClass
  shape?: string
  parts: { id: string, n?: number }[]
  dryRun?: boolean
}

export type ClientMessage =
  | { t: 'hello', name: string, token?: string, v: number }
  /** v2: ohne Fraktion; `faction` nur noch von v1-Clients. */
  | { t: 'spawn', x: number, y: number, faction?: FactionId }
  | { t: 'view', x0: number, y0: number, x1: number, y1: number }
  | { t: 'order', ids: number[], order: OrderSpec }
  | { t: 'produce', category: Category, type: string }
  | { t: 'cancel', category: Category, index?: number, readyType?: string }
  | { t: 'place', type: string, x: number, y: number }
  | { t: 'sell', id: number }
  | { t: 'repair', id: number }
  | { t: 'rally', id: number, x: number, y: number }
  | { t: 'chat', text: string }
  | { t: 'ping', c: number }
  // ---- v2 ----
  /** Befehl(e) an den Avatar; ersetzt die Warteschlange (≤ 8). */
  | { t: 'avatar', orders: OrderSpec[] }
  /** Gebäude-Bauplan platzieren; `avatar` = Avatar geht hin und baut. */
  | { t: 'build', bp: string, x: number, y: number, workers?: number, avatar?: boolean }
  /** Werkzeug/Gegenstand herstellen. */
  | { t: 'craft', bp: string, n: number, at?: number }
  /** Bauplan entwerfen (dryRun = nur prüfen). */
  | { t: 'design', spec: DesignRequest }
  /** Aufgabenbrett: add (mit TaskSpec), patch (id + Felder), del (id). */
  | ({ t: 'task', op: 'add' | 'patch' | 'del', id?: number } & TaskSpec)
  /** Rezept eines Gebäudes setzen (`recipe` null = anhalten). */
  | { t: 'recipe', id: number, recipe: string | null, workers: number }
  | { t: 'study', tag: string, workers: number, at?: number }
  | { t: 'respawn', at?: number | { x: number, y: number } }
  | { t: 'auto', on: boolean }
  | { t: 'settings', helpBuild?: boolean, autoDeposit?: boolean }
  /** Siedlung für die Seitenleiste anheften. */
  | { t: 'pin', settlement: number }
  /** Phase 4/5: Firmen, Handel, Raketenstart. */
  | { t: 'firm', action: 'found' | 'patch' | 'withdraw' | 'dissolve', id?: number, data?: Record<string, unknown> }
  | { t: 'trade', action: 'buy' | 'sell', settlement: number, resource: string, n: number }
  | { t: 'launch', id: number, x: number, y: number, warhead: 'he' | 'nuclear' }

// ---------------------------------------------------------------------------
// Entitäten auf der Leitung
// ---------------------------------------------------------------------------

/** u Einheit, b Gebäude, d Lagerstätte, a Avatar, p Person, n Knoten (Cache, Ruine, Wild, Fallout). */
export type EntityKind = 'u' | 'b' | 'd' | 'a' | 'p' | 'n'

/**
 * Ein Radarkontakt. Bewusst arm an Information: Radar liefert einen Ort und eine
 * grobe Klasse, mehr nicht. Wer wissen will, was dort steht, muss hinsehen.
 */
/** Eigene Radarstellung: Ort und Reichweite gegen ein Ziel der Signatur 1. */
export interface RadarStationWire { x: number, y: number, r: number }

export interface ContactWire {
  /** Stabile Kennung, damit der Kontakt zwischen zwei Paketen nicht springt. */
  i: number
  x: number
  y: number
  /** Klasse: a = Luft, g = Boden, n = See */
  c: 'a' | 'g' | 'n'
  /** Besitzer, wenn die Kennung erkannt wurde; 0 = unbekannt. */
  o: number
}

export interface EntityWire {
  i: number
  k: EntityKind
  ty: string
  o: number
  x: number
  y: number
  h: number
  hp: number
  /** Zustand (Einheiten): idle, move, attack, harvest, return, deploy, load, rearm, gather, work, ... */
  s?: string
  /** Ziel-ID */
  tg?: number
  /** Ladung Förderfahrzeug 0..1 */
  ld?: number
  /** Munition (Luftfahrzeuge) */
  am?: number
  /** Battery percentage, own units only. */
  bt?: number
  /** Anzahl geladener Einheiten (Transporter) */
  cg?: number
  /** Eigener Passagier: Kennung des Transporters, nicht auf der Karte zeichnen. */
  inside?: number
  /** Aktuelle Geschwindigkeit in m/s */
  sp?: number
  /** Restbestand einer Lagerstätte bzw. eines Knotens */
  a?: number
  /** Reparatur aktiv */
  rp?: 1
  /** Zielkoordinaten (nur eigene Einheiten) */
  dx?: number
  dy?: number
  /** Active destination and queued waypoints, own units only. */
  rt?: RouteWaypoint[]
  /** Whether the own unit's route repeats as a patrol. */
  rr?: boolean
  /** Persistent fire discipline, own units only. */
  fd?: FireDiscipline
  /** Sammelpunkt (eigene Produktionsgebäude) */
  rx?: number
  ry?: number
  /** Deaktiviert wegen Strommangel (Verteidigung) */
  off?: 1
  // ---- v2 ----
  /** Baufortschritt eines Bauplatzes 0..1 (Gebäude im Bau). */
  pg?: number
  /** Inventar (nur eigene): die 8 größten Posten `[Rohstoff, Menge]`. */
  iv?: [string, number][]
  /** Aufgabenart einer Person. */
  jb?: TaskKind | string
  /** Werkzeuge des Avatars: Arbeitsart → Bauplan-Id. */
  eq?: Record<string, string>
  /** Rohstoff einer Lagerstätte oder eines Knotens (Cache/Wild/Fallout). */
  rs?: string
  /** Innenarbeiter im Gebäude. */
  wk?: number
  /** Laufendes Rezept. */
  rc?: string
  /** Blockadecode (nur eigene): missing_inputs, no_power, ... */
  bl?: string
  /** Hungrig (Avatar/Person). */
  hg?: 1
  /** Geschützt bis (Spielzeit). */
  pr?: number
  /** Zeichen-Essentials für Baupläne außerhalb von BASE_CATALOG/Legacy: Form, Größe, max. HP, Stockwerke. */
  sh?: string
  sz?: number
  mh?: number
  st?: number
  /** Gruppengröße (Flüchtlinge). */
  n?: number
}

/** Rohstoff-Patch (§5): Schlüssel, Rohstoff, Mitte, Kapazität, Rest (null = außerhalb eigener Sicht), Einschlag 0..1 (Holz). */
export interface PatchWire {
  k: number
  rs: string
  x: number
  y: number
  cp: number
  rm: number | null
  ct?: number
}

// ---------------------------------------------------------------------------
// Spielerzustand
// ---------------------------------------------------------------------------

export interface ProductionWire {
  type?: string
  progress?: number
  remaining?: number
  ready: string[]
  queue: string[]
  blocked?: string
}

export type BlockCode = 'no_idle' | 'no_patch' | 'person_cap' | 'storage_full' | 'paused_want' | 'no_tool' | 'missing_inputs' | 'no_power' | 'no_building' | 'no_site'
/** Blockadegrund einer Aufgabe, eines Bauplatzes oder Rezepts (§3). */
export interface BlockReasonWire {
  code: BlockCode | string
  detail?: Record<string, unknown>
  suggestion?: string
}

/** Aufgabe auf der Leitung (§10, §13). */
export interface TaskWire {
  id: number
  kind: TaskKind
  resource?: string
  blueprint?: string
  target?: number
  recipe?: string
  tag?: string
  x?: number
  y?: number
  radius?: number
  want?: number
  /** Poolbestand des Rohstoffs (zu `want`). */
  have?: number
  n?: number
  done: number
  workers: number
  assigned: number
  priority: number
  auto?: boolean
  oneShot?: boolean
  paused?: boolean
  blocked: BlockReasonWire | null
}

/** Bauplatz auf der Leitung (§10). */
export interface SiteWire {
  id: number
  bp: string
  progress: number
  blocked: BlockReasonWire | null
  etaSeconds: number | null
  x?: number
  y?: number
  labour?: number
  done?: number
  inputs?: Record<string, number>
  delivered?: Record<string, number>
  missing?: Record<string, number>
  builders?: number
  maxBuilders?: number
}

/** Regelbasierter Hinweis `{code, params, text}` (§13); der Client formatiert `code` + `params` deutsch. */
export interface Hint {
  code: HintCode | string
  params: Record<string, unknown>
  text: string
}

/** Zielzustand: bool, Zähler oder zusammengesetzt (`shown` nur bei defense). */
export type GoalState = boolean | number | { done: boolean, missing: string[], shown?: boolean }

export interface AvatarState {
  id?: number
  alive: boolean
  /** Sekunden bis zur Wiederkehr, null wenn lebendig. */
  respawnIn: number | null
  hp: number
  maxHp: number
  hunger: number
  hungry: boolean
  inv: [string, number][]
  free: number
  /** Arbeitsart → Bauplan-Id. */
  tools: Record<string, string>
  auto: boolean
  helpBuild: boolean
  autoDeposit?: boolean
  level: number
  lastOrder?: LastOrderWire
  /** Länge der Befehlswarteschlange. */
  queue: number
  state?: string
  order?: { k: OrderKind, target?: number }
  protectedUntil?: number
  x?: number
  y?: number
}

export interface SettlementState {
  id: number
  name: string
  pop: number
  beds: number
  idle: number
  foodHours: number
  hunger: number
  /** Pool, die 12 größten Posten. */
  pool: [string, number][]
  capacity: number
  used: number
  personCap: number
  personsUsed: number
  migration: { nextIn: number | null, blockedBy: string[], walking?: boolean }
  tasks: TaskWire[]
  sites: SiteWire[]
  power: { prod: number, cons: number }
  outpostOf?: number
}

export interface PlayerState {
  civic?: CivicReport
  id: number
  name: string
  faction?: FactionId
  color: string
  funds: number
  powerProd: number
  powerCons: number
  units: number
  buildings: number
  spawned: boolean
  home?: { x: number, y: number }
  prod: Partial<Record<Category, ProductionWire>>
  /** Baubare Bauplan-Ids (Material ignoriert) für die Seitenleiste. */
  available: string[]
  /** Restlicher Landeschutz in Spielsekunden, sonst nicht gesetzt. */
  protectedFor?: number
  // ---- v2 (§13 PlayerState) ----
  /** Zustandsversion; `state.me` wird nur bei Änderung gesendet. */
  version?: number
  credits?: number
  avatar?: AvatarState
  /** Die angeheftete Siedlung (Client-Wahl), sonst die dem Avatar nächste. */
  settlement?: SettlementState
  settlements?: { id: number, name: string, pop: number }[]
  /** Anzahl bekannter Wissens-Tags. */
  knowledge?: number
  tier?: number
  blueprintCount?: number
  goals?: Partial<Record<Goal, GoalState>>
  hints?: Hint[]
  nextSteps?: Hint[]
}

export interface PlayerInfo {
  id: number
  allianceId?: number
  name: string
  faction?: FactionId
  color: string
  online: boolean
  spawned: boolean
}

export interface BaseInfo {
  source?: 'sight' | 'radar'
  name?: string
  seenAt?: number
  stale?: boolean
  /** Objekt-Id der Kommandozentrale – dient als Gedächtnis für aufgeklärte Basen. */
  id: number
  /** Besitzer beim letzten optischen Kontakt. */
  player: number
  x: number
  y: number
}

/** Öffentliche Siedlung (≥ 20 Bewohner; `settlements`-Nachricht und GET /settlements). */
export interface SettlementInfo {
  id: number
  player: number
  name: string
  x: number
  y: number
  pop: number
  city?: boolean
  /** Für den Betrachter angreifbar (Schutzregeln §11). */
  attackable?: boolean
  protectedReason?: ProtectedReason | null
}

// ---------------------------------------------------------------------------
// Ereignisse auf der Leitung (Effekte im Client)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { e: 'shot', from: number, x: number, y: number, tx: number, ty: number, w: string, ttl: number }
  | { e: 'hit', x: number, y: number, w: string, r: number }
  /** k: a Avatar, p Person, u Einheit, b Gebäude, n Knoten. */
  | { e: 'die', owner?: number, id: number, x: number, y: number, ty: string, k: EntityKind, c?: string }
  | { e: 'placed', id: number, x: number, y: number, ty: string }
  | { e: 'capture', id: number, by: number }
  // ---- v2 ----
  /** Eine Einheit hat eine Sammel-Einheit von `rs` bei x,y genommen (Baumwackeln, Staub). */
  | { e: 'gather', id: number, x: number, y: number, rs: string }
  | { e: 'knowledge', tag: string }
  | { e: 'site_done', id: number, ty: string }
  | { e: 'avatar_died', id: number, x: number, y: number }
  /** Zuwanderer/Flüchtlinge angekommen. */
  | { e: 'arrive', id: number }

/** Ereignisarten des Spieler-Ereignispuffers (GET /me/events, §13). */
export type ApiEventKind =
  | 'spawned' | 'avatar_died' | 'avatar_respawned' | 'avatar_hungry' | 'order_done' | 'order_failed' | 'inventory_full' | 'storage_full'
  | 'tool_broken' | 'site_placed' | 'site_blocked' | 'site_done' | 'craft_done' | 'settler_arrived' | 'settler_left' | 'migrant_killed'
  | 'hungry' | 'homeless' | 'task_done' | 'task_blocked' | 'knowledge_gained' | 'blueprint_registered' | 'patch_depleted' | 'pocket_found'
  | 'under_attack' | 'unit_lost' | 'building_lost' | 'settlement_lost' | 'capture' | 'declaration' | 'protection_ended'
  | 'firm_founded' | 'firm_bankrupt' | 'market_shortage' | 'market_illiquid' | 'trade_done' | 'fuel_low' | 'missile_launched'
  | 'missile_inbound' | 'power_low' | 'power_ok' | 'unit_produced' | 'milestone'
/** Ereignisarten, die pro Siedlung und Minute zusammengefasst werden (`count`). */
export const COALESCED_EVENT_KINDS: readonly ApiEventKind[] = ['task_done', 'inventory_full', 'craft_done']

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { t: 'welcome', player: PlayerInfo, token: string, now: number, protocol: number, faction?: FactionId, created?: boolean }
  | { t: 'error', msg: string, code?: string, details?: Record<string, unknown> }
  | { t: 'notice', msg: string }
  /** `me` nur bei geänderter `version`; `pt`/`ptGone` = Patch-Deltas (v2). */
  | { t: 'state', now: number, me?: PlayerState, ents: EntityWire[], gone: number[], dead: number[], evs: GameEvent[], pt?: PatchWire[], ptGone?: number[], rc?: ContactWire[], rd?: RadarStationWire[] }
  | { t: 'bases', list: BaseInfo[] }
  | { t: 'players', list: PlayerInfo[], online?: number, total?: number }
  | { t: 'chat', from: number, name: string, text: string }
  | { t: 'pong', c: number, now: number }
  // ---- v2 ----
  /** Katalog (Basis + Legacy + eigene Baupläne) nach `welcome` und bei jeder Änderung eigener Baupläne. */
  | { t: 'catalog', list: Blueprint[] }
  /** Ersetzt `bases`. */
  | { t: 'settlements', list: SettlementInfo[] }

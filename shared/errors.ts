/**
 * Spielfehler mit Code (für die API englisch), strukturierten Details (SPEC-v2 §13) und deutscher Übersetzung für die Oberfläche.
 * rest.ts serialisiert `{error, code, details}`; ERROR_STATUS liefert den HTTP-Status je Code.
 */

/** Fehlercodes von v1 und v2 (SPEC-v2 §13). Weitere Codes bleiben als String erlaubt. */
export type ErrorCode =
  // v1
  | 'unknown_type' | 'prerequisites_missing' | 'no_producer' | 'insufficient_funds' | 'unit_limit' | 'building_limit'
  | 'queue_full' | 'outside_world' | 'land_only' | 'coast_required' | 'overlap' | 'too_far_from_base' | 'unknown_building'
  | 'not_ready' | 'not_own_building' | 'not_production_building' | 'already_spawned' | 'unknown_faction' | 'spawn_on_water'
  | 'spawn_too_close' | 'foreign_units_nearby' | 'deploy_invalid' | 'not_logged_in' | 'invalid_message' | 'version_mismatch'
  | 'name_too_short' | 'no_units' | 'invalid_timescale' | 'api_error'
  // v2 §13 Tabelle
  | 'missing_inputs' | 'missing_knowledge' | 'terrain' | 'too_far_from_avatar' | 'inventory_full' | 'storage_full'
  | 'no_patch' | 'no_storage' | 'no_study_building' | 'class_rules' | 'below_floor' | 'unknown_material'
  | 'use_craft' | 'use_build' | 'use_queue' | 'protected' | 'not_hostile' | 'foreign_nearby' | 'wall_gap'
  | 'siege_requires_declaration' | 'person_cap' | 'task_limit' | 'blueprint_limit' | 'rate_limited'
  | 'not_alive' | 'alive' | 'respawn_threatened' | 'unknown_blueprint' | 'needs_crane' | 'slots_full'
  // v2 weitere Codes aus §6, §10, §11, §13
  | 'order_failed' | 'internal' | 'not_spawned' | 'unknown_entity' | 'unknown_settlement' | 'unknown_task' | 'unknown_site'
  | 'unknown_recipe' | 'unknown_tag' | 'unknown_part' | 'unknown_resource' | 'not_own' | 'not_buildable' | 'not_craftable'
  | 'no_site' | 'no_building' | 'no_idle' | 'no_tool' | 'no_power' | 'paused_want' | 'no_food' | 'no_deer'
  | 'cache_locked' | 'no_doctrine' | 'doctrine_set' | 'gone' | 'invalid_argument'

/** Detailschemata der v2-Codes (SPEC-v2 §13); `GameError.details` folgt für diese Codes der jeweiligen Form. */
export interface ErrorDetails {
  missing_inputs: { missing: Record<string, number>, have: Record<string, number>, nearest?: Record<string, { x: number, y: number, distance: number }> }
  missing_knowledge: { tags: { tag: string, costLp?: number, prereqOk?: boolean, how?: string, at?: string | null, path?: string[], totalHours?: number }[] }
  terrain: { requirement: string, nearestSpot?: { x: number, y: number, distance: number } }
  too_far_from_avatar: { maxM: number, distanceM: number, avatarEtaSeconds: number }
  inventory_full: { free: number, needed: number }
  storage_full: { free: number, capacity: number, nearestOther?: { id: number, x: number, y: number, distance: number } }
  no_patch: { resource: string, nearest?: { x: number, y: number, distance: number, remaining: number | null } }
  no_storage: { nearest?: { id: number, x: number, y: number, distance: number } }
  no_study_building: { needs: string[], tag: string }
  class_rules: { rule: string, value?: unknown, limit?: unknown, part?: string }
  below_floor: { rule: string, value: number, limit: number, part?: string }
  unknown_material: { rule: string, value: string, limit?: unknown, part?: string }
  use_craft: { kind: string, verb: 'craft', at: { blueprint: string | null, id?: number } }
  use_build: { kind: string, verb: 'build', at: { blueprint: string | null, id?: number } }
  use_queue: { kind: string, verb: 'queue', at: { blueprint: string | null, id?: number } }
  protected: { reason: 'new_player' | 'tech_gap' | 'respawn', until?: number, declareAt?: number }
  not_hostile: { player: number, declareAt?: number }
  foreign_nearby: { distance: number, minM: number, protected?: boolean }
  wall_gap: { spacing: number, maxSpacing: number, snapTo: { x: number, y: number } }
  siege_requires_declaration: { declaredAt?: number }
  person_cap: { used: number, cap: number, retryAfterSeconds?: number }
  task_limit: { used: number, cap: number }
  blueprint_limit: { used: number, cap: number }
  rate_limited: { used: number, cap: number, retryAfterSeconds?: number }
  not_alive: { respawnIn: number }
  alive: Record<string, never>
  respawn_threatened: { options: RespawnOptionDetail[] }
  unknown_blueprint: { id: string }
  needs_crane: { nearestCrane?: { id: number, x: number, y: number, distance: number } }
  slots_full: { slots: number, used: number }
}
/** Wiederkehrpunkt in `respawn_threatened.details.options` (SPEC-v2 §6). */
export interface RespawnOptionDetail { kind: 'building' | 'ruin' | 'spot', id?: number, x: number, y: number, threat: number, distanceToCache: number | null }

/** HTTP-Status je Fehlercode (SPEC-v2 §13); unbekannte Codes → 400. */
export const ERROR_STATUS: Partial<Record<ErrorCode, number>> = {
  missing_inputs: 422, missing_knowledge: 422, terrain: 422, too_far_from_avatar: 422,
  inventory_full: 409, storage_full: 409,
  no_patch: 404, no_storage: 404, unknown_entity: 404, unknown_settlement: 404, unknown_task: 404, unknown_site: 404,
  unknown_recipe: 404, unknown_tag: 404, unknown_part: 404, unknown_resource: 404, unknown_blueprint: 404,
  no_study_building: 422, class_rules: 422, below_floor: 422, unknown_material: 422,
  use_craft: 400, use_build: 400, use_queue: 400,
  protected: 403, not_hostile: 403, not_own: 403, cache_locked: 403,
  foreign_nearby: 422, wall_gap: 422, siege_requires_declaration: 422, needs_crane: 422,
  person_cap: 429, task_limit: 429, blueprint_limit: 429, rate_limited: 429,
  not_alive: 409, alive: 409, respawn_threatened: 409, slots_full: 409, already_spawned: 409, doctrine_set: 409,
  not_logged_in: 401, gone: 410, internal: 500,
}
export function statusOf(code: string | undefined, fallback = 400): number {
  return (code && (ERROR_STATUS as Record<string, number>)[code]) || fallback
}

/** Spielfehler mit Code (für die API englisch), optionalen Details und deutscher Übersetzung für die Oberfläche. */
export class GameError extends Error {
  code: string
  details?: Record<string, unknown>
  constructor(code: ErrorCode | string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.name = 'GameError'
    if (details) this.details = details
  }
}

/** Typsicherer Konstruktor für Codes mit Detailschema. */
export function gameError<K extends keyof ErrorDetails>(code: K, message: string, details: ErrorDetails[K]): GameError {
  return new GameError(code, message, details as Record<string, unknown>)
}

export const ERROR_DE: Record<string, string> = {
  // ---- v1 ----
  unknown_type: 'Unbekannter Typ',
  prerequisites_missing: 'Voraussetzungen fehlen',
  no_producer: 'Kein Produktionsgebäude vorhanden',
  insufficient_funds: 'Nicht genug Geld',
  unit_limit: 'Einheitenlimit erreicht',
  building_limit: 'Gebäudelimit erreicht',
  queue_full: 'Warteschlange voll',
  outside_world: 'Außerhalb der Karte',
  land_only: 'Nur auf Land baubar',
  coast_required: 'Muss an der Küste stehen',
  overlap: 'Überschneidet sich mit einem anderen Gebäude',
  occupied_unit: 'Baufläche durch eine Einheit belegt – zuerst freimachen',
  occupied_deposit: 'Baufläche durch eine Lagerstätte belegt',
  foreign_territory: 'Fremdes Gebiet: Bündnis mit Baurecht schließen oder zuerst erobern. Eine Kriegserklärung allein erlaubt keinen Bau.',
  too_far_from_base: 'Zu weit von der eigenen Basis entfernt',
  unknown_building: 'Unbekanntes Gebäude',
  not_ready: 'Gebäude ist nicht fertig',
  not_own_building: 'Kein eigenes Gebäude',
  not_production_building: 'Kein Produktionsgebäude',
  already_spawned: 'Bereits im Spiel',
  unknown_faction: 'Unbekannte Fraktion',
  spawn_on_water: 'Startpunkt muss auf Land liegen',
  spawn_too_close: 'Zu nah an einer fremden Siedlung',
  foreign_units_nearby: 'Fremde Einheiten in der Nähe',
  deploy_invalid: 'Hier kann die Bauraupe nicht entfaltet werden',
  not_logged_in: 'Nicht angemeldet',
  invalid_message: 'Ungültige Nachricht',
  version_mismatch: 'Client-Version passt nicht zum Server. Bitte Seite neu laden.',
  name_too_short: 'Name muss mindestens 2 Zeichen haben',
  no_units: 'Keine eigenen Einheiten ausgewählt',
  invalid_timescale: 'Ungültiger Zeitfaktor',
  api_error: 'Anfrage fehlgeschlagen',
  // ---- v2 §13 ----
  missing_inputs: 'Material fehlt',
  missing_knowledge: 'Wissen fehlt',
  terrain: 'Gelände ungeeignet',
  too_far_from_avatar: 'Zu weit vom Avatar entfernt',
  inventory_full: 'Inventar voll',
  storage_full: 'Lager voll',
  no_patch: 'Kein Vorkommen in Reichweite',
  no_storage: 'Kein Lager in Reichweite',
  no_study_building: 'Kein passendes Studiengebäude',
  class_rules: 'Bauplan verletzt die Klassenregeln',
  below_floor: 'Bauplan unterschreitet die Untergrenze des Grundkatalogs',
  unknown_material: 'Unbekanntes Bauteil',
  use_craft: 'Wird hergestellt, nicht gebaut (Herstellen)',
  use_build: 'Wird gebaut, nicht hergestellt (Bauen)',
  use_queue: 'Wird in einem Produktionsgebäude gefertigt (Warteschlange)',
  protected: 'Ziel steht unter Schutz',
  not_hostile: 'Kein Kriegszustand mit diesem Spieler',
  foreign_nearby: 'Zu nah an einer fremden Siedlung',
  wall_gap: 'Lücke in der Mauer: Segmente müssen sich berühren',
  siege_requires_declaration: 'Belagerung nur nach Kriegserklärung',
  person_cap: 'Personenlimit der Siedlung erreicht',
  task_limit: 'Aufgabenlimit erreicht',
  blueprint_limit: 'Bauplanlimit erreicht',
  rate_limited: 'Zu viele Anfragen, bitte später erneut versuchen',
  not_alive: 'Dein Avatar ist tot',
  alive: 'Dein Avatar lebt bereits',
  respawn_threatened: 'Wiederkehrpunkt ist bedroht',
  unknown_blueprint: 'Unbekannter Bauplan',
  needs_crane: 'Ein Kran muss in der Nähe stehen',
  slots_full: 'Alle Arbeitsplätze belegt',
  // ---- v2 weitere ----
  order_failed: 'Befehl fehlgeschlagen',
  internal: 'Interner Fehler',
  not_spawned: 'Noch nicht im Spiel',
  unknown_entity: 'Unbekanntes Objekt',
  unknown_settlement: 'Unbekannte Siedlung',
  unknown_task: 'Unbekannte Aufgabe',
  unknown_site: 'Unbekannter Bauplatz',
  unknown_recipe: 'Unbekanntes Rezept',
  unknown_tag: 'Unbekanntes Wissen',
  unknown_part: 'Unbekanntes Bauteil',
  unknown_resource: 'Unbekannter Rohstoff',
  not_own: 'Gehört dir nicht',
  not_buildable: 'Kann nicht gebaut werden',
  not_craftable: 'Kann nicht hergestellt werden',
  no_site: 'Kein Bauplatz vorhanden',
  no_building: 'Kein passendes Gebäude vorhanden',
  no_idle: 'Keine freien Bewohner',
  no_tool: 'Werkzeug fehlt',
  no_power: 'Kein Strom',
  paused_want: 'Pausiert: Sollmenge erreicht',
  no_food: 'Keine Nahrung in Reichweite',
  no_deer: 'Kein Wild in Reichweite',
  cache_locked: 'Nachlass ist noch für den Besitzer reserviert',
  no_doctrine: 'Doktrin fehlt (POST /me/doctrine)',
  doctrine_set: 'Doktrin ist bereits gewählt',
  gone: 'Endpunkt entfernt: nutze /me/build, /me/craft und /me/buildings/:id/queue',
  invalid_argument: 'Ungültiger Parameter',
}

export function translateError(code: string | undefined, fallback: string) {
  return (code && ERROR_DE[code]) || fallback
}

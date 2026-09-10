/**
 * Pacing-Konstanten von Real Command v2 (SPEC-v2 §2, §5, §6, §8, §10, §11, §13).
 * Alle Zeiten in Spielsekunden, Längen in Metern, Arbeit in Arbeitspunkten (LP).
 * 1 LP = 1 Sekunde Arbeit eines ungeübten Menschen ohne Werkzeug.
 * Server und Client importieren diese Datei; sie enthält nur Daten und reine Funktionen.
 */

import { clamp } from './math.ts'

// ---------------------------------------------------------------------------
// §2 Arbeitspunkte und Raten
// ---------------------------------------------------------------------------

/** LP pro Sekunde eines ungeübten Bewohners ohne Werkzeug. */
export const WORKER_LP = 1
/** LP pro Sekunde des Avatars (Stufe 0). */
export const AVATAR_LP = 2.5
/** LP-Bonus des Avatars pro Stufe (+5 %). */
export const AVATAR_LEVEL_BONUS = 0.05
/** Höchste Avatar-Stufe. */
export const AVATAR_MAX_LEVEL = 10
/** Eine Arbeitsstunde (wh) in LP. */
export const LP_PER_WORK_HOUR = 3_600
/** LP pro Sekunde eines Gelehrten beim Studium (× MACHINE_MUL des Gebäudes). */
export const SCHOLAR_LP = WORKER_LP
/** Kein Handwerk, keine Sammel-Einheit und kein Rezept-Durchgang endet früher als 3 s nach Beginn. */
export const MIN_ACTION_S = 3

export type ToolTier = 'none' | 'stone' | 'iron' | 'steel'
/** Arbeitsmultiplikator nach Werkzeugstufe (nur für das zur Arbeit passende Werkzeug). */
export const TOOL_MUL: Record<ToolTier, number> = { none: 1, stone: 1.5, iron: 2, steel: 3 }

/** Arbeitsarten, denen ein Werkzeug zugeordnet ist. */
export type ToolJob = 'wood' | 'stone' | 'build' | 'farm' | 'hunt' | 'fiber' | 'butcher'
/** Werkzeugfamilie -> Arbeitsart (axe → wood, pick → stone/ore/clay, hammer → build, hoe/plough → farm, spear/bow → hunt, sickle → fiber/grain, knife → butcher). */
export const TOOL_JOB: Record<string, ToolJob> = {
  axe: 'wood', pick: 'stone', hammer: 'build', hoe: 'farm', plough: 'farm', spear: 'hunt', bow: 'hunt', sickle: 'fiber', knife: 'butcher',
}
/** Rohstoff -> Arbeitsart, deren Werkzeug das Sammeln beschleunigt (fehlt: kein Werkzeugbonus). */
export const JOB_OF_RESOURCE: Partial<Record<string, ToolJob>> = {
  wood: 'wood', stone: 'stone', iron_ore: 'stone', copper_ore: 'stone', coal: 'stone', clay: 'stone', sand: 'stone',
  fiber: 'fiber', grain: 'fiber', deer: 'hunt',
}

/** Maschinenfaktor eines Gebäudes (Rezepte, Studium, Bauplätze mit Kran). `mill` ist 1 + mech/6, siehe millMachineMul. */
export const MACHINE_MUL: Record<string, number> = {
  workbench: 1, campfire: 1, kiln: 1, kiln_stone: 0.8, clay_pit: 1, quarry: 1, fishing_hut: 1, hunter_lodge: 1,
  bloomery: 2, forge: 2, sawmill: 3, mine: 1.5, furnace: 4, school: 2, laboratory: 4, university: 6,
  machine_shop: 6, electronics_workshop: 4, factory: 6, barracks: 2, airfield: 4, shipyard: 4, assembly_hall: 8,
  cement_works: 2, refinery: 4, mill: 1,
}
/** Maschinenfaktor einer Mühle aus ihrer mechanischen Leistung. */
export function millMachineMul(mech: number) { return 1 + mech / 6 }
/** Bauplatz-Faktor mit Kran innerhalb CRANE_RADIUS. */
export const CRANE_MUL = 3
export const CRANE_RADIUS = 40
/** Bauplatz-Faktor ohne Kran. */
export const SITE_MUL = 1

/** Rohstoffe, die je Einheit Arbeit kosten (Sammeln, Jagen, Feld). */
export type GatherResource =
  | 'wood' | 'stone' | 'fiber' | 'berry' | 'clay' | 'sand' | 'iron_ore' | 'copper_ore' | 'coal' | 'fish' | 'deer' | 'grain'
/** LP je gesammelter Einheit. */
export const GATHER_LP: Record<GatherResource, number> = {
  wood: 15, stone: 40, fiber: 6, berry: 8, clay: 20, sand: 10, iron_ore: 45, copper_ore: 45, coal: 45, fish: 20, deer: 120, grain: 15,
}
/** Ein Baum = 60 LP -> 4 Holz + 1 Faser. */
export const TREE_LP = 60
export const TREE_YIELD: Record<string, number> = { wood: 4, fiber: 1 }
export const WOOD_PER_TREE = 4
/** Ein Hirsch = 120 LP Ausweiden -> 4 Fleisch + 2 Fell. */
export const DEER_YIELD: Record<string, number> = { meat: 4, hide: 2 }
/** Korb: Beeren und Fasern ×1.3; Speer beim Fischen ×1.3. */
export const BASKET_GATHER_MUL = 1.3
export const SPEAR_FISH_MUL = 1.3
export const BASKET_SLOTS = 10

/** Sekunden je Einheit für einen Arbeiter mit Rate `lpPerSecond` (ohne MIN_ACTION_S-Kappung). */
export function gatherSeconds(resource: GatherResource, lpPerSecond: number) {
  return GATHER_LP[resource] / Math.max(1e-9, lpPerSecond)
}
/** Arbeit in LP -> Arbeitsstunden (auf 2 Stellen). */
export function workHours(lp: number) { return Math.round((lp / LP_PER_WORK_HOUR) * 100) / 100 }
/** Höchstzahl abgeschlossener Einheiten/Durchgänge je Lane-Besuch mit `elapsed` Sekunden. */
export function maxCompletions(elapsed: number) { return Math.floor(elapsed / MIN_ACTION_S) }

/** Avatar-Stufe aus der Zahl bekannter Wissens-Tags: min(10, ⌊√n⌋). */
export function avatarLevel(knownTags: number) { return Math.min(AVATAR_MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, knownTags)))) }
/** LP/s des Avatars auf einer Stufe (+5 % pro Stufe). */
export function avatarLp(level: number) { return AVATAR_LP * (1 + AVATAR_LEVEL_BONUS * clamp(level, 0, AVATAR_MAX_LEVEL)) }

// ---------------------------------------------------------------------------
// §5 Karten-Rohstoffe: Kapazitäten und Regeneration je Patch (90 m × 90 m)
// ---------------------------------------------------------------------------

export type PatchResource = 'wood' | 'stone' | 'clay' | 'sand' | 'berry' | 'fiber' | 'fish' | 'iron_ore' | 'copper_ore'
/** Feste Kapazität je Patch (Holz wird aus der Walddichte berechnet: patchCapacity in shared/nodes.ts). */
export const PATCH_CAP: Record<Exclude<PatchResource, 'wood'>, number> = {
  stone: 120, clay: 80, sand: 200, berry: 30, fiber: 60, fish: 100, iron_ore: 60, copper_ore: 40,
}
/** Regeneration in Einheiten je Stunde (Holz: Anteil der Kapazität, siehe WOOD_REGEN_FRACTION_PER_H). */
export const REGEN_PER_H: Record<PatchResource, number> = {
  wood: 0, stone: 0, clay: 0, sand: 0, berry: 10, fiber: 6, fish: 20, iron_ore: 0, copper_ore: 0,
}
/** Holz wächst mit 1 % der Kapazität je Stunde nach (voll in ≈ 4 Tagen). */
export const WOOD_REGEN_FRACTION_PER_H = 0.01
/** Regeneration eines Patches in Einheiten je Stunde. */
export function patchRegenPerH(resource: PatchResource, cap: number) {
  return resource === 'wood' ? cap * WOOD_REGEN_FRACTION_PER_H : REGEN_PER_H[resource]
}
/** Erzvorkommen (Pockets) sind nur innerhalb dieses Abstands sichtbar. */
export const POCKET_SIGHT = 60
/** Rohstoffauskunft (/me/resources, find_resources) reicht bis 5 km um Avatar oder eigene Gebäude. */
export const RESOURCE_SCAN_RADIUS = 5_000
/** Nächster-Patch-Cache der Siedlung: Radius und Auffrischung. */
export const NEAREST_PATCH_RADIUS = 2_000
export const NEAREST_PATCH_REFRESH_S = 30
/** Wild: 1 Hirsch je 25 ha Wald im Umkreis von 2 km um Siedlungen, Nachwuchs 1 je 2 h je km². */
export const DEER_HA_PER_ANIMAL = 25
export const DEER_SETTLEMENT_RADIUS = 2_000
export const DEER_RESPAWN_S_PER_KM2 = 7_200
export const DEER_FLEE_KMH = 8
export const DEER_FLEE_DISTANCE = 40
/** Jagderfolg je Waffe und Reichweite, aus der der Wurf/Schuss erfolgt. */
export const HUNT_SUCCESS: Record<'none' | 'spear' | 'bow', number> = { none: 0.3, spear: 0.6, bow: 0.9 }
export const HUNT_RANGE: Record<'none' | 'spear' | 'bow', number> = { none: 2, spear: 5, bow: 60 }

/** Garantierte Lagerstätten um jeden Startpunkt (ensureDeposits v2). */
export const DEPOSIT_GUARANTEE = {
  nearMinKm: 2, nearMaxKm: 6, spawnMinKm: 2.5, spawnMaxKm: 6, apartKm: 1, oilKm: 25, uraniumKm: 60,
  near: ['iron_ore', 'coal', 'copper'] as const,
}
/** Bergwerk/Ölpumpe müssen innerhalb dieses Abstands zur Lagerstätte stehen. */
export const MINE_DEPOSIT_RADIUS = 60

// ---------------------------------------------------------------------------
// §6 Avatar
// ---------------------------------------------------------------------------

export const AVATAR_SPEED_KMH = 6
export const AVATAR_SIGHT = 400
export const AVATAR_SLOTS = 30
export const WORKER_SLOTS = 10
export const CART_SLOTS = 60
export const TRUCK_SLOTS = 200
/** Lebenspunkte-Regeneration: 1 hp je 60 s, satt und 30 s ohne Schaden. */
export const AVATAR_REGEN_S = 60
export const AVATAR_REGEN_NO_DAMAGE_S = 30
/** Bauen/Abliefern aus dem Inventar nur innerhalb dieses Abstands zum Avatar. */
export const AVATAR_BUILD_RADIUS = 60
/** Standardradius der Sammelsuche und Abstand, bis zu dem zum nächsten Patch weitergesammelt wird. */
export const GATHER_RADIUS_DEFAULT = 800
export const GATHER_CONTINUE_RADIUS = 150
/** Lager, Essen aus dem Pool, Werkzeug aus dem Pool: 400 m um den Avatar. */
export const POOL_REACH = 400
/** Sekunden für essen und equip. */
export const EAT_S = 5
export const EQUIP_S = 5
/** Höchstlänge der Befehlswarteschlange des Avatars. */
export const AVATAR_QUEUE_MAX = 8
/** Nahrungswert je Einheit (virtuelle Summe `food`). */
export const FOOD_VALUE: Record<string, number> = { berry: 1, fish: 1, meat: 1, grain: 1, flour: 2 }
/** Nahrungsfaktor einer Siedlung mit `cook`-Effekt. */
export const COOK_FOOD_MUL = 1.5

/** Hunger des Avatars (Sekunden seit der letzten Mahlzeit). */
export const AUTOEAT_S = 1_800
/** Ab hier arbeitet der Avatar halb so schnell und regeneriert nicht. */
export const HUNGRY_S = 3_600
/** Ab hier verliert der Avatar 1 hp je Minute bis auf 1 hp; Hunger tötet nie. */
export const STARVE_S = 21_600
export const STARVE_HP_PER_MIN = 1
export const HUNGRY_LABOUR_MUL = 0.5

/** Tod und Wiederkehr. */
export const RESPAWN_BASE_S = 60
export const RESPAWN_PER_DEATH_S = 30
export const RESPAWN_DEATHS_CAP = 8
/** Ohne Anfrage kehrt der Avatar 120 s nach respawnAt automatisch zurück. */
export const RESPAWN_AUTO_S = 120
/** Ein Nachlass (cache) ist so lange nur für den Besitzer zugänglich. */
export const CACHE_OWNER_ONLY_S = 600
/** Wartezeit bis zur Wiederkehr nach `deaths` bisherigen Toden. */
export function respawnDelay(deaths: number) { return RESPAWN_BASE_S + RESPAWN_PER_DEATH_S * Math.min(Math.max(0, deaths), RESPAWN_DEATHS_CAP) }
/** Bedrohung eines Wiederkehrpunkts wird in diesem Radius gezählt. */
export const RESPAWN_THREAT_RADIUS = 400
/** Startplätze: Mindestabstand zu fremden Siedlungen (hart) und bevorzugt. */
export const SPAWN_FOREIGN_MIN_KM = 5
export const SPAWN_FOREIGN_PREFERRED_KM = 20
/** Harte Filter der Startplatz-Bewertung (§13 /spawn-spots). */
export const SPAWN_FILTERS = { treesWithin100m: 6, stoneM: 120, berryM: 150, fiberM: 60, clayM: 1_500, orePocketM: 1_500 }

// ---------------------------------------------------------------------------
// §6/§11 Schutz
// ---------------------------------------------------------------------------

/** Wiederkehrschutz nach Spawn/Respawn. */
export const PROTECTION_S = 300
/** Neue Spieler: 24 h nach dem ersten Spawn nicht angreifbar. */
export const NEW_PLAYER_PROTECTION_S = 86_400
/** Feindseligkeit nach einem Angriff hält 24 h. */
export const HOSTILITY_S = 86_400
/** Eine Kriegserklärung wirkt erst nach 1 h und braucht eine Siedlung mit ≥ 20 Bewohnern. */
export const DECLARATION_DELAY_S = 3_600
export const DECLARATION_MIN_POP = 20
/** Technik-Schutz: kein Angriff auf Spieler, deren Stufe ≥ 2 unter der eigenen liegt. */
export const TECH_GAP = 2
export type ProtectedReason = 'new_player' | 'tech_gap' | 'respawn'

// ---------------------------------------------------------------------------
// §10 Siedlungen, Bevölkerung, Personen, Aufgaben
// ---------------------------------------------------------------------------

/** Gebäude ≤ 400 m bilden eine Siedlung; darüber hinaus gründet ein Bau eine neue. */
export const SETTLEMENT_RADIUS = 400
/** Bauradius um eigene Gebäude. */
export const SETTLEMENT_BUILD_RADIUS = 2_500
/** Außenposten: pop 0, beds 0, ≤ 6 km von einer eigenen Siedlung mit ≥ 10 Bewohnern. */
export const OUTPOST_RADIUS = 6_000
export const OUTPOST_PARENT_MIN_POP = 10
export const OUTPOST_SHIFT_S = 8 * 3_600
export const OUTPOST_CARRY_HOME = 10
/** Fremde Siedlungsgebäude: verboten ≤ 500 m, ≤ 2 km bei Schutz, bis 5 km nur mit Erklärung. */
export const FOREIGN_MIN_M = 500
export const FOREIGN_PROTECTED_M = 2_000
export const SIEGE_MAX_M = 5_000
/** Mauersegmente rasten am vorherigen Segment ≤ 3 × size ein und dürfen höchstens 1.6 × size auseinander liegen. */
export const WALL_SNAP_MUL = 3
export const WALL_GAP_MUL = 1.6
/** Neuclusterung verschmutzter Spieler alle 5 s. */
export const RECLUSTER_S = 5

/** Person (blueprint `worker`). */
export const PERSON_SPEED_KMH = 5
export const PERSON_SIGHT = 300
export const PERSON_CARRY = 10
/** Höchstzahl materialisierter Personen je Spieler. */
export const MAX_PERSONS_PER_PLAYER = 200
export const PERSON_CAP_BASE = 10
export const PERSON_CAP_MAX = 80
/** personCap(settlement) = clamp(10 + ⌊pop/4⌋, 10, 80). */
export function personCap(pop: number) { return clamp(PERSON_CAP_BASE + Math.floor(Math.max(0, pop) / 4), PERSON_CAP_BASE, PERSON_CAP_MAX) }

/** Nahrung je Bewohner und Stunde. */
export const FOOD_PER_CAPITA_H = 2
/** foodHours = food / (2 × max(1, pop)). */
export function foodHours(food: number, pop: number) { return food / (FOOD_PER_CAPITA_H * Math.max(1, pop)) }
/** Nahrungsverbrauch einer Siedlung über `elapsed` Sekunden. */
export function foodDemand(pop: number, elapsed: number) { return FOOD_PER_CAPITA_H * pop * elapsed / 3_600 }
/** Siedlungshunger: > 1 800 s Arbeit ×0.5; > 6 h verlässt alle 30 min ein Bewohner die Siedlung. */
export const SETTLEMENT_HUNGRY_S = 1_800
export const SETTLER_LEAVE_AFTER_S = 6 * 3_600
export const SETTLER_LEAVE_INTERVAL_S = 1_800
/** Obdachlose gehen nach 10 min, wenn kein Wohn-Bauplatz aktiv ist. */
export const HOMELESS_LEAVE_S = 600
/** Brunnen: +1 Bett je Haus ≤ 300 m (max +5), Felder ×1.2 ≤ 300 m. */
export const WELL_RADIUS = 300
export const WELL_BED_BONUS_MAX = 5
export const WELL_FARM_MUL = 1.2
/** Dispatcher: unter 2 Nahrungsstunden bekommt die höchste Nahrungsaufgabe den ersten freien Arbeiter. */
export const FOOD_FIRST_H = 2
export const FOOD_TASK_KINDS = ['hunt', 'fish', 'farm'] as const
export const FOOD_RESOURCES = ['berry', 'fish', 'meat', 'grain', 'flour'] as const

/** Migration (je Bevölkerungsschritt, elapsed-basiert). */
export const MIGRATION_S = 240
/** Untergrenze des Migrationsintervalls (Städte). */
export const MIGRATION_MIN_S = 90
/** Erster Zuwanderer 120 s nach dem ersten Bett (Siedlungen < 20 Bewohner). */
export const MIGRATION_FIRST_S = 120
export const MIGRATION_NEWCOMER_POP = 20
/** Zuwanderer erscheinen 200 m außerhalb des Zentrums und gehen zum nächsten Haus. */
export const MIGRANT_SPAWN_DISTANCE = 200
/** Getöteter Zuwanderer: nächster erst 120 s später. */
export const MIGRANT_KILLED_DELAY_S = 120
/** Nahrung für Migration: food ≥ max(4, 1.5 × pop). */
export const MIGRATION_FOOD_MIN = 4
export const MIGRATION_FOOD_PER_POP = 1.5
export const MIGRATION_MORALE_MIN = 0.5
/** Gebäude, die das Migrationsintervall verkürzen. */
export const MIGRATION_MUL: Record<'well' | 'market' | 'school', number> = { well: 0.8, market: 0.7, school: 0.85 }
export function migrationFoodNeeded(pop: number) { return Math.max(MIGRATION_FOOD_MIN, MIGRATION_FOOD_PER_POP * pop) }
/** Intervall bis zum nächsten Zuwanderer aus den vorhandenen Gebäuden. */
export function migrationInterval(has: { well?: boolean, market?: boolean, school?: boolean }) {
  let s = MIGRATION_S
  if (has.well) s *= MIGRATION_MUL.well
  if (has.market) s *= MIGRATION_MUL.market
  if (has.school) s *= MIGRATION_MUL.school
  return Math.max(MIGRATION_MIN_S, s)
}
/** Geburten: ab 8 h Siedlungsalter +1 je 6 h je 10 Bewohner, satt und untergebracht. */
export const BIRTH_MIN_AGE_S = 8 * 3_600
export const BIRTH_INTERVAL_S = 6 * 3_600
export const BIRTH_PER_POP = 10
/** Morale-Glättung und Arbeitsfaktor (Phase 4): labour × (0.6 + 0.4 × morale). */
export const MORALE_TAU_S = 600
export function moraleLabourMul(morale: number) { return 0.6 + 0.4 * clamp(morale, 0, 1) }
/** Stadt: ≥ 200 Bewohner, Markt, Schule, ≥ 1 Hochhaus. */
export const CITY_MIN_POP = 200

/** Aufgabenbrett. */
export const MAX_TASKS_PER_SETTLEMENT = 24
export const TASK_RADIUS_DEFAULT = 400
export const TASK_RADIUS_MAX = 2_000
export const DISPATCH_S = 5
/** Aufgabe mit `want` pausiert bei pool ≥ want und läuft wieder an unter 0.8 × want. */
export const WANT_RESUME_FRACTION = 0.8
/** Wachschicht. */
export const GUARD_SHIFT_S = 8 * 3_600
/** Firmen-Arbeiter folgen Spieleraufgaben nur ab dieser Priorität. */
export const FIRM_OVERRIDE_PRIORITY = 8
/** Bauplatz: maxBuilders = clamp(ceil(labour / 300), 3, 24). */
export const SITE_LP_PER_BUILDER = 300
export const SITE_MIN_BUILDERS = 3
export const SITE_MAX_BUILDERS = 24
export function siteMaxBuilders(labour: number) { return clamp(Math.ceil(labour / SITE_LP_PER_BUILDER), SITE_MIN_BUILDERS, SITE_MAX_BUILDERS) }
/** Hochhaus-Bauplatz: unter 20 aktiven Bauleuten Rate ×0.5. */
export const HIGHRISE_MIN_BUILDERS = 20
export const HIGHRISE_SLOW_MUL = 0.5

export type TaskKind = 'gather' | 'build' | 'work' | 'craft' | 'farm' | 'study' | 'hunt' | 'fish' | 'guard' | 'haul'
/** Aufgabenarten, für die Personen materialisiert werden. */
export const OUTDOOR_TASK_KINDS: readonly TaskKind[] = ['gather', 'build', 'hunt', 'fish', 'guard', 'haul']
export const INDOOR_TASK_KINDS: readonly TaskKind[] = ['work', 'craft', 'farm', 'study']

export interface DefaultTask {
  kind: TaskKind; resource?: string; blueprint?: string; want?: number; workers: number; priority: number
  /** Arbeiter erst, wenn ein Gebäude dieses Typs steht (Werkzeugmacher). */
  workersWhen?: { building: string, workers: number }
  /** Einmalige Ersatzaufgabe, wenn die Aufgabe an fehlendem Rohstoff hängt. */
  onMissing?: { kind: TaskKind, resource: string, n: number, priority: number }
}
/** Standardaufgaben, angelegt mit der ersten Hütte (`auto: true`), in dieser Reihenfolge. */
export const DEFAULT_TASKS: readonly DefaultTask[] = [
  { kind: 'gather', resource: 'berry', priority: 7, want: 30, workers: 1 },
  { kind: 'build', priority: 6, workers: 2 },
  { kind: 'gather', resource: 'wood', priority: 5, want: 60, workers: 2 },
  { kind: 'gather', resource: 'stone', priority: 4, want: 20, workers: 1 },
  { kind: 'craft', blueprint: 'stone_tools', priority: 4, want: 2, workers: 0, workersWhen: { building: 'workbench', workers: 1 },
    onMissing: { kind: 'gather', resource: 'stone', n: 6, priority: 5 } },
]

/** Lanes des Tick-Algorithmus (§12). */
export const FAST_LANE_S = 1
export const SLOW_LANE_S = 60
export const PATCH_REGEN_SHARE = 300

// ---------------------------------------------------------------------------
// §8 Wissen
// ---------------------------------------------------------------------------

export type KnowledgeTier = 0 | 1 | 2 | 3 | 4 | 5 | 6
/** Stufe je Wissens-Tag; p.tier = höchste Stufe bekannter Tags (Schutzregel §11). */
export const KNOWLEDGE_TIER: Record<string, KnowledgeTier> = {
  'k:fire': 0, 'k:woodworking': 0, 'k:carpentry': 0, 'k:hunting': 0, 'k:fishing': 0,
  'k:masonry': 1, 'k:farming': 1, 'k:pottery': 1, 'k:weaving': 1, 'k:writing': 1,
  'k:smelting': 2, 'k:mining': 2, 'k:waterwheel': 2, 'k:glass': 2, 'k:mechanics': 2, 'k:steel': 2,
  'k:steam': 3, 'k:chemistry': 3, 'k:concrete': 3, 'k:electricity': 3,
  'k:combustion': 4, 'k:armour': 4, 'k:ballistics': 4, 'k:radio': 4, 'k:firearms': 4, 'k:drill': 4, 'k:steel_frame': 4,
  'k:flight': 5, 'k:naval': 5, 'k:rocketry': 5, 'k:guidance': 5,
  'k:nuclear_chemistry': 6, 'k:nuclear': 6,
}
/** Alle bekannten Tags in Tabellenreihenfolge. */
export const KNOWLEDGE_TAGS: readonly string[] = Object.keys(KNOWLEDGE_TIER)
/** Stufe eines Tags (unbekannte Tags zählen als 0). */
export function knowledgeTier(tag: string): KnowledgeTier { return KNOWLEDGE_TIER[tag] ?? 0 }
/** p.tier aus einer Menge bekannter Tags. */
export function playerTier(known: Iterable<string>): KnowledgeTier {
  let t: KnowledgeTier = 0
  for (const tag of known) { const k = knowledgeTier(tag); if (k > t) t = k }
  return t
}

/** Zähler, die `p.doing` führt (erhöht beim Aufnehmen einer Einheit, nicht beim Einlagern; Gebäude beim Fertigstellen). */
export type DoingCounter = 'campfire' | 'wood' | 'hut' | 'stone' | 'berry' | 'clay' | 'deer' | 'fish' | 'ore' | 'fiber'
export interface DoingRule {
  tag: string
  counter: DoingCounter
  threshold: number
  /** Zusätzliche Bedingung: ein weiterer Zähler muss diesen Stand haben (Mauerwerk braucht eine Hütte). */
  also?: { counter: DoingCounter, n: number }
  unlocks: string[]
  /** Kurze Anleitung (englisch, API). */
  how: string
}
/** Wissen durch Tun; `checkKnowledge` prüft nach jeder Zähleränderung. */
export const DOING: readonly DoingRule[] = [
  { tag: 'k:fire', counter: 'campfire', threshold: 1, unlocks: ['cook', 'study tier-0 tags at the fire'], how: 'complete a campfire' },
  { tag: 'k:woodworking', counter: 'wood', threshold: 20, unlocks: ['workbench', 'hut', 'storage', 'fishing_hut'], how: 'gather 20 wood' },
  { tag: 'k:carpentry', counter: 'hut', threshold: 1, unlocks: ['palisade', 'watchtower', 'bow', 'cart', 'house', 'design tab'], how: 'complete a hut' },
  { tag: 'k:masonry', counter: 'stone', threshold: 30, also: { counter: 'hut', n: 1 }, unlocks: ['well', 'kiln_stone', 'quarry', 'house'], how: 'gather 30 stone and complete a hut' },
  { tag: 'k:farming', counter: 'berry', threshold: 25, unlocks: ['field'], how: 'gather 25 berries' },
  { tag: 'k:pottery', counter: 'clay', threshold: 20, unlocks: ['kiln', 'clay_pit'], how: 'gather 20 clay' },
  { tag: 'k:hunting', counter: 'deer', threshold: 1, unlocks: ['hunter_lodge', 'spear bonus'], how: 'hunt a deer' },
  { tag: 'k:fishing', counter: 'fish', threshold: 20, unlocks: ['fishing_hut ×1.3'], how: 'catch 20 fish' },
  { tag: 'k:mining', counter: 'ore', threshold: 100, unlocks: ['mine'], how: 'mine 100 ore from a pocket or mine' },
  { tag: 'k:weaving', counter: 'fiber', threshold: 100, unlocks: ['cloth'], how: 'gather 100 fiber' },
]
/** Doing-Regel je Tag. */
export const DOING_BY_TAG: Readonly<Record<string, DoingRule>> = Object.fromEntries(DOING.map(r => [r.tag, r]))
/** Aufgenommener Rohstoff -> Doing-Zähler (Erze und Kohle teilen sich `ore`). */
export const DOING_COUNTER_OF: Partial<Record<string, DoingCounter>> = {
  wood: 'wood', stone: 'stone', berry: 'berry', clay: 'clay', fiber: 'fiber', fish: 'fish', deer: 'deer',
  iron_ore: 'ore', copper_ore: 'ore', coal: 'ore',
}
/** Fertiggestelltes Gebäude -> Doing-Zähler. */
export const DOING_COUNTER_OF_BUILDING: Partial<Record<string, DoingCounter>> = { campfire: 'campfire', hut: 'hut' }
/** Erfüllt der Zählerstand die Regel? */
export function doingSatisfied(rule: DoingRule, doing: Readonly<Record<string, number>>) {
  if ((doing[rule.counter] ?? 0) < rule.threshold) return false
  return !rule.also || (doing[rule.also.counter] ?? 0) >= rule.also.n
}

/** Studiengebäude in aufsteigender Ordnung; `minAt` ist hart: nur dort oder besser. */
export type StudyBuilding = 'campfire' | 'workbench' | 'school' | 'laboratory' | 'university'
export const STUDY_LADDER: readonly StudyBuilding[] = ['campfire', 'workbench', 'school', 'laboratory', 'university']
/** Studienfaktor je Gebäude (= MACHINE_MUL). */
export const STUDY_MUL: Record<StudyBuilding, number> = { campfire: 1, workbench: 1, school: 2, laboratory: 4, university: 6 }
/** Rang eines Gebäudes auf der Leiter (-1: kein Studiengebäude). */
export function studyRank(blueprint: string) { return STUDY_LADDER.indexOf(blueprint as StudyBuilding) }
/** Darf `tag` mit `minAt` an `blueprint` studiert werden? */
export function canStudyAt(minAt: StudyBuilding, blueprint: string) {
  const r = studyRank(blueprint)
  return r >= 0 && r >= STUDY_LADDER.indexOf(minAt)
}

export interface StudyRule {
  tag: string
  costLp: number
  prereq: string[]
  minAt: StudyBuilding
}
/** Wissen durch Studium (`POST /me/study`, Avatar `study`); Reihenfolge = Tabelle §8 (k:weaving ergänzt für den Werkbank-Studienpfad der Phase 1). */
export const STUDY: readonly StudyRule[] = [
  { tag: 'k:writing', costLp: 1_800, prereq: ['k:fire'], minAt: 'campfire' },
  { tag: 'k:weaving', costLp: 1_800, prereq: [], minAt: 'workbench' },
  { tag: 'k:smelting', costLp: 3_600, prereq: ['k:pottery', 'k:fire'], minAt: 'workbench' },
  { tag: 'k:waterwheel', costLp: 5_400, prereq: ['k:carpentry'], minAt: 'workbench' },
  { tag: 'k:glass', costLp: 7_200, prereq: ['k:smelting'], minAt: 'workbench' },
  { tag: 'k:mechanics', costLp: 14_400, prereq: ['k:carpentry', 'k:smelting'], minAt: 'school' },
  { tag: 'k:steel', costLp: 21_600, prereq: ['k:smelting', 'k:mining'], minAt: 'school' },
  { tag: 'k:steam', costLp: 28_800, prereq: ['k:mechanics', 'k:steel'], minAt: 'school' },
  { tag: 'k:chemistry', costLp: 36_000, prereq: ['k:glass', 'k:writing'], minAt: 'laboratory' },
  { tag: 'k:concrete', costLp: 21_600, prereq: ['k:masonry', 'k:chemistry'], minAt: 'school' },
  { tag: 'k:electricity', costLp: 43_200, prereq: ['k:steam'], minAt: 'school' },
  { tag: 'k:combustion', costLp: 43_200, prereq: ['k:steam', 'k:chemistry'], minAt: 'laboratory' },
  { tag: 'k:armour', costLp: 28_800, prereq: ['k:steel'], minAt: 'school' },
  { tag: 'k:ballistics', costLp: 36_000, prereq: ['k:mechanics', 'k:chemistry'], minAt: 'laboratory' },
  { tag: 'k:firearms', costLp: 21_600, prereq: ['k:chemistry', 'k:steel'], minAt: 'school' },
  { tag: 'k:drill', costLp: 7_200, prereq: ['k:writing'], minAt: 'school' },
  { tag: 'k:radio', costLp: 43_200, prereq: ['k:electricity'], minAt: 'laboratory' },
  { tag: 'k:steel_frame', costLp: 28_800, prereq: ['k:steel', 'k:concrete'], minAt: 'school' },
  { tag: 'k:flight', costLp: 108_000, prereq: ['k:combustion', 'k:radio'], minAt: 'laboratory' },
  { tag: 'k:naval', costLp: 72_000, prereq: ['k:steel_frame', 'k:combustion'], minAt: 'laboratory' },
  { tag: 'k:rocketry', costLp: 216_000, prereq: ['k:chemistry', 'k:ballistics', 'k:electricity'], minAt: 'laboratory' },
  { tag: 'k:guidance', costLp: 144_000, prereq: ['k:radio', 'k:ballistics'], minAt: 'laboratory' },
  { tag: 'k:nuclear_chemistry', costLp: 180_000, prereq: ['k:chemistry', 'k:electricity'], minAt: 'laboratory' },
  { tag: 'k:nuclear', costLp: 360_000, prereq: ['k:nuclear_chemistry', 'k:rocketry'], minAt: 'university' },
]
/** Studienregel je Tag. */
export const STUDY_BY_TAG: Readonly<Record<string, StudyRule>> = Object.fromEntries(STUDY.map(r => [r.tag, r]))
/** Voraussetzungen eines Tags (Studium; Doing-Tags haben keine). */
export function prereqOf(tag: string): readonly string[] { return STUDY_BY_TAG[tag]?.prereq ?? [] }
/**
 * Vollständiger, geordneter Studienpfad zu `target`: alle unbekannten Voraussetzungen zuerst (Tiefensuche, dedupliziert).
 * Doing-Tags im Pfad erscheinen ebenfalls, damit der Aufrufer `how` ausgeben kann.
 */
export function studyPath(target: string, known: ReadonlySet<string> | Iterable<string>): string[] {
  const have = known instanceof Set ? known : new Set(known)
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (tag: string) => {
    if (have.has(tag) || seen.has(tag)) return
    seen.add(tag)
    for (const p of prereqOf(tag)) visit(p)
    out.push(tag)
  }
  visit(target)
  return out
}
/** Studien-LP/s aus Gelehrten, Gebäude und Avatar-Beteiligung. */
export function studyRate(at: StudyBuilding, scholars: number, avatarLpPerSecond = 0, hungerFactor = 1) {
  return (scholars * SCHOLAR_LP + avatarLpPerSecond) * STUDY_MUL[at] * hungerFactor
}

// ---------------------------------------------------------------------------
// §13 Ziele, Phasen, Hinweise
// ---------------------------------------------------------------------------

export type Goal =
  | 'shelter' | 'fire' | 'workbench' | 'tools' | 'hut' | 'inhabitant' | 'pop10' | 'village' | 'defense'
  | 'kiln' | 'iron' | 'steel' | 'power' | 'factory' | 'tank' | 'city' | 'silo'
/** bool: erreicht ja/nein; count: Zahl (Hütten, Bewohner); compound: {done, missing[]} (+ shown bei defense). */
export type GoalShape = 'bool' | 'count' | 'compound'
export interface GoalDef {
  id: Goal
  name_de: string
  shape: GoalShape
  /** Lesbares Prädikat (englisch, /rules.pacing.milestones). */
  predicate: string
  /** Zielwert für count-Ziele (Anzeige "4/10"). */
  target?: number
  /** Teilbedingungen eines compound-Ziels in Anzeigereihenfolge (Name -> Sollwert). */
  parts?: { key: string, need: number }[]
  /** Nur nach Erklärung, Feindsichtung oder Schutzende sichtbar. */
  hidden?: boolean
}
/** Ziele in Anzeige- und Meilensteinreihenfolge. */
export const GOALS: readonly GoalDef[] = [
  { id: 'shelter', name_de: 'Unterschlupf', shape: 'bool', predicate: 'a completed building with a house or store effect (shelter)' },
  { id: 'fire', name_de: 'Feuer', shape: 'bool', predicate: 'a completed building with a fire effect (campfire)' },
  { id: 'workbench', name_de: 'Werkbank', shape: 'bool', predicate: 'a completed workbench' },
  { id: 'tools', name_de: 'Werkzeug', shape: 'bool', predicate: 'stone_axe, stone_pick and hammer owned (inventory or pool)' },
  { id: 'hut', name_de: 'Hütte', shape: 'count', target: 1, predicate: 'number of completed huts (goal met at ≥ 1)' },
  { id: 'inhabitant', name_de: 'Bewohner', shape: 'count', target: 10, predicate: 'total pop over own settlements (goal met at ≥ 1)' },
  { id: 'pop10', name_de: '10 Bewohner', shape: 'bool', predicate: 'a settlement with pop ≥ 10' },
  { id: 'village', name_de: 'Dorf', shape: 'compound', predicate: 'village = buildings ≥ 8 && pop ≥ 10 in one settlement', parts: [{ key: 'buildings', need: 8 }, { key: 'pop', need: 10 }] },
  { id: 'defense', name_de: 'Verteidigung', shape: 'compound', predicate: 'defense = palisade ≥ 6 && watchtower ≥ 1', parts: [{ key: 'palisade', need: 6 }, { key: 'watchtower', need: 1 }], hidden: true },
  { id: 'kiln', name_de: 'Brennofen', shape: 'bool', predicate: 'a completed kiln or kiln_stone' },
  { id: 'iron', name_de: 'Eisen', shape: 'bool', predicate: 'first iron unit produced' },
  { id: 'steel', name_de: 'Stahl', shape: 'bool', predicate: 'first steel unit produced' },
  { id: 'power', name_de: 'Strom', shape: 'bool', predicate: 'a completed building with a power effect' },
  { id: 'factory', name_de: 'Fabrik', shape: 'bool', predicate: 'a completed factory' },
  { id: 'tank', name_de: 'Panzer', shape: 'bool', predicate: 'first lighttank, mbt or heavytank produced' },
  { id: 'city', name_de: 'Stadt', shape: 'bool', predicate: 'a settlement with pop ≥ 200, a market, a school and ≥ 1 skyscraper' },
  { id: 'silo', name_de: 'Raketensilo', shape: 'bool', predicate: 'a completed missile_silo' },
]
export const GOAL_BY_ID: Readonly<Record<string, GoalDef>> = Object.fromEntries(GOALS.map(g => [g.id, g]))
export const GOAL_ORDER: readonly Goal[] = GOALS.map(g => g.id)
/** Meilenstein-Grenzen der Spieltest-Harness in Spielsekunden (§15). */
export const MILESTONE_LIMIT_S: Partial<Record<Goal, number>> = {
  shelter: 5 * 60, fire: 9 * 60, workbench: 14 * 60, tools: 18 * 60, hut: 25 * 60, inhabitant: 30 * 60,
  pop10: 90 * 60, village: 130 * 60, iron: 4 * 3_600, steel: 10 * 3_600, tank: 36 * 3_600,
}

/** Spielphase, aus den Zielen abgeleitet: survival (keine Hütte) → village (Hütte) → town (Stahl oder pop ≥ 50) → industry (Strom) → war (Fabrik). */
export type Phase = 'survival' | 'village' | 'town' | 'industry' | 'war'
export const PHASES: readonly Phase[] = ['survival', 'village', 'town', 'industry', 'war']
export const TOWN_MIN_POP = 50
export function phaseOf(g: { hut: number, steel: boolean, maxPop: number, power: boolean, factory: boolean }): Phase {
  if (g.factory) return 'war'
  if (g.power) return 'industry'
  if (g.steel || g.maxPop >= TOWN_MIN_POP) return 'town'
  if (g.hut >= 1) return 'village'
  return 'survival'
}

/** Regelbasierte Hinweise `{code, params, text}`; der Client formatiert deutsch, die API englisch. */
export type HintCode =
  | 'no_shelter' | 'no_fire' | 'food_low' | 'idle_workers' | 'beds_full' | 'site_missing' | 'tool_missing' | 'study_soon'
  | 'storage_full' | 'market_shortage' | 'no_power_highrise' | 'threat' | 'dead_respawn' | 'hungry_avatar' | 'task_blocked'
  | 'protection_ends' | 'next_step' | 'next_field'
export interface HintTemplate {
  code: HintCode
  /** Parameternamen, die die Vorlage erwartet (Dokumentation und Tests). */
  params: readonly string[]
  /** Englische Vorlage (API) mit {param}-Platzhaltern. */
  en: string
  /** Deutsche Vorlage (Client). */
  de: string
  /** Hinweis trägt eine Sprungmarke aus params.x/y. */
  jump?: boolean
}
export const HINT_CODES: readonly HintTemplate[] = [
  { code: 'no_shelter', params: [],
    en: 'Build a shelter: 8 wood and 4 fiber, 36 s of work. It founds your settlement.',
    de: 'Baue einen Unterschlupf: 8 Holz und 4 Fasern, 36 s Arbeit. Er gründet deine Siedlung.' },
  { code: 'no_fire', params: [],
    en: 'Build a campfire (4 stone, 4 wood): nobody moves in without fire, and it teaches k:fire.',
    de: 'Baue ein Lagerfeuer (4 Stein, 4 Holz): ohne Feuer zieht niemand ein, und es lehrt k:fire.' },
  { code: 'food_low', params: ['settlement', 'name', 'foodHours', 'pop'],
    en: '{name} has food for {foodHours} h ({pop} inhabitants): gather berries, fish or hunt, or raise the berry task.',
    de: '{name} hat Nahrung für {foodHours} h ({pop} Bewohner): sammle Beeren, fische oder jage, oder erhöhe die Beeren-Aufgabe.' },
  { code: 'idle_workers', params: ['settlement', 'name', 'idle'],
    en: '{idle} inhabitants in {name} are idle: add a task or raise workers on an existing one.',
    de: '{idle} Bewohner in {name} sind untätig: lege eine Aufgabe an oder erhöhe die Arbeiter einer bestehenden.' },
  { code: 'beds_full', params: ['settlement', 'name', 'pop', 'beds'],
    en: 'All {beds} beds in {name} are taken: build a hut (4 beds) so more people can move in.',
    de: 'Alle {beds} Betten in {name} sind belegt: baue eine Hütte (4 Betten), damit weitere Bewohner einziehen.' },
  { code: 'site_missing', params: ['site', 'bp', 'resource', 'n', 'x', 'y', 'distance'], jump: true,
    en: 'Site {bp}#{site} waits for {n} {resource}: gather {resource} {distance} m away or raise the {resource} task.',
    de: 'Bauplatz {bp}#{site} wartet auf {n} {resource}: sammle {resource} {distance} m entfernt oder erhöhe die {resource}-Aufgabe.' },
  { code: 'tool_missing', params: ['tool', 'job', 'at'],
    en: 'No {tool}: craft one at the {at}, {job} work goes 1.5× faster with a stone tool.',
    de: 'Kein {tool}: stelle eines an der {at} her, {job}-Arbeit geht mit Steinwerkzeug 1,5-mal schneller.' },
  { code: 'study_soon', params: ['tag', 'at', 'workHours', 'unlocks'],
    en: '{tag} can be studied at the {at} ({workHours} work-hours): it unlocks {unlocks}.',
    de: '{tag} kann an der {at} studiert werden ({workHours} Arbeitsstunden): schaltet {unlocks} frei.' },
  { code: 'storage_full', params: ['settlement', 'name', 'used', 'capacity'],
    en: 'Storage in {name} is full ({used}/{capacity}): build a storage (500) or turn materials into buildings and tools.',
    de: 'Das Lager in {name} ist voll ({used}/{capacity}): baue ein Lager (500) oder verarbeite Material zu Gebäuden und Werkzeug.' },
  { code: 'market_shortage', params: ['settlement', 'name', 'resource', 'price'],
    en: '{resource} is scarce on the market of {name} (price {price}): produce or haul it.',
    de: '{resource} ist auf dem Markt von {name} knapp (Preis {price}): produziere oder liefere es.' },
  { code: 'no_power_highrise', params: ['building', 'need', 'prod'],
    en: 'Highrise #{building} is unpowered (needs {need}, produced {prod}): beds are halved until power is available.',
    de: 'Hochhaus #{building} hat keinen Strom (braucht {need}, erzeugt {prod}): die Betten sind halbiert, bis Strom da ist.' },
  { code: 'threat', params: ['kind', 'n', 'player', 'x', 'y', 'distance'], jump: true,
    en: '{n} hostile {kind} of {player} {distance} m away: guard, build palisades and a watchtower, or pull persons in.',
    de: '{n} feindliche {kind} von {player} {distance} m entfernt: bewache, baue Palisaden und einen Wachturm oder hole Personen zurück.' },
  { code: 'dead_respawn', params: ['respawnIn', 'options'],
    en: 'Your avatar is dead: respawn in {respawnIn} s ({options} safe points); knowledge and blueprints are kept.',
    de: 'Dein Avatar ist tot: Wiederkehr in {respawnIn} s ({options} sichere Punkte); Wissen und Baupläne bleiben.' },
  { code: 'hungry_avatar', params: ['hunger', 'foodNearby'],
    en: 'Your avatar has not eaten for {hunger} s and works at half speed: eat ({foodNearby} food within reach) or gather berries.',
    de: 'Dein Avatar hat seit {hunger} s nichts gegessen und arbeitet halb so schnell: iss (F, {foodNearby} Nahrung in Reichweite) oder sammle Beeren.' },
  { code: 'task_blocked', params: ['task', 'kind', 'resource', 'code', 'settlement', 'name'],
    en: 'Task {kind} {resource} in {name} is blocked ({code}): fix the cause or remove the task.',
    de: 'Aufgabe {kind} {resource} in {name} ist blockiert ({code}): behebe die Ursache oder entferne die Aufgabe.' },
  { code: 'protection_ends', params: ['inSeconds'],
    en: 'Newcomer protection ends in {inSeconds} s: build palisades (6) and a watchtower, create a guard task.',
    de: 'Der Neulingsschutz endet in {inSeconds} s: baue Palisaden (6) und einen Wachturm, lege eine Wach-Aufgabe an.' },
  { code: 'next_step', params: ['what'],
    en: 'Next: {what}.',
    de: 'Als Nächstes: {what}.' },
  { code: 'next_field', params: ['berriesLeft'],
    en: 'Pick {berriesLeft} more berries to unlock the field.',
    de: 'Sammle noch {berriesLeft} Beeren, um das Feld freizuschalten.' },
]
export const HINT_BY_CODE: Readonly<Record<string, HintTemplate>> = Object.fromEntries(HINT_CODES.map(h => [h.code, h]))

export interface HintObject { code: HintCode; params: Record<string, unknown>; text: string }

/** Formatiert einen Parameterwert für Hinweise (Zahlen gerundet, Listen mit Komma). */
export function formatHintValue(v: unknown): string {
  if (v == null) return '?'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : (Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (Array.isArray(v)) return v.map(formatHintValue).join(', ')
  return String(v)
}
/** Füllt die Vorlage eines Codes mit Parametern; unbekannte Codes liefern den Code selbst. */
export function formatHint(code: HintCode | string, params: Record<string, unknown> = {}, lang: 'en' | 'de' = 'en'): string {
  const t = HINT_BY_CODE[code]
  if (!t) return String(code)
  return t[lang].replace(/\{(\w+)\}/g, (_, key: string) => formatHintValue(params[key]))
}
/** Baut das API-Hinweisobjekt `{code, params, text}` (englischer Text). */
export function makeHint(code: HintCode, params: Record<string, unknown> = {}): HintObject {
  return { code, params, text: formatHint(code, params, 'en') }
}

/**
 * Baupläne von Real Command v2 (SPEC-v2 §3 Datenmodell, §4 Rohstoffe, §7 Katalog).
 * Alles Baubare – Gebäude, Werkzeuge, Waffen, Fahrzeuge, Einheiten – ist ein Bauplan mit Zutaten,
 * Voraussetzungen, Arbeit (LP) und Wirkungen. Diese Datei enthält nur Daten und reine Funktionen;
 * Server und Client importieren sie. Legacy-Einheiten/-Gebäude kommen über shared/legacy.ts dazu.
 */

import type { Armor, Domain, UnitDef, Warhead, Weapon } from './data.ts'
import {
  AVATAR_LP, AVATAR_SIGHT, AVATAR_SLOTS, AVATAR_SPEED_KMH, CART_SLOTS, DEER_FLEE_KMH, GATHER_LP, HUNT_RANGE, HUNT_SUCCESS,
  MACHINE_MUL, PERSON_CARRY, PERSON_SIGHT, PERSON_SPEED_KMH, WORKER_LP, playerTier,
  type ToolJob, type ToolTier,
} from './pacing.ts'
import { LEGACY_CATALOG } from './legacy.ts'

// ---------------------------------------------------------------------------
// §3 Typen
// ---------------------------------------------------------------------------

export type BlueprintKind = 'building' | 'tool' | 'item' | 'unit' | 'vehicle' | 'weapon'
export type BuildingClass =
  | 'shelter' | 'house' | 'storage' | 'workshop' | 'wall' | 'tower' | 'farm' | 'mill' | 'power' | 'market' | 'highrise' | 'silo' | 'legacy'
export type BlueprintTier = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type TerrainRequirement = 'land' | 'coast' | 'water_adjacent' | 'arable' | 'moist' | 'rock' | 'open'

/** Gefechtsköpfe der v2-Nahkampf-/Bogen-/Nuklearwaffen zusätzlich zu den v1-Gefechtsköpfen (T04 erweitert `Warhead` selbst). */
export type BlueprintWarhead = Warhead | 'melee' | 'arrow' | 'nuke'
/** Waffe eines Bauplans: wie `Weapon`, aber mit den v2-Gefechtsköpfen. */
export interface BlueprintWeapon extends Omit<Weapon, 'warhead'> { warhead: BlueprintWarhead }

export interface Effect {
  /** Betten. */
  house?: number
  /** Lagerkapazität (Siedlungspool). */
  store?: number
  fire?: 1
  cook?: 1
  craft?: 1
  /** Studienfaktor (= MACHINE_MUL des Gebäudes). */
  study?: number
  /** Rezept-Ids, die hier laufen dürfen. */
  recipes?: string[]
  /** Höchstzahl Innenarbeiter bzw. Gelehrter. */
  slots?: number
  machineMul?: number
  farm?: { lpPerUnit: number, output: string }
  wall?: { hp: number }
  tower?: { sight: number, garrison: number }
  /** Stromerzeugung (positiv). Verbrauch steht in `requires.power`. */
  power?: number
  burner?: { resource: string, perHour: number }
  firmSlots?: number
  market?: 1
  respawn?: 1
  crane?: 1
  launch?: { capacity: number, rangeKm: number }
  sight?: number
  morale?: number
  /** Mechanische Leistung (Mühlen). */
  mech?: number
  /** Zusätzliche Inventarplätze (Korb) bzw. Ladeplätze (Karren). */
  carry?: number
  well?: 1
}

export interface Requires {
  knowledge?: string[]
  /** Bauplan-Id der Werkstatt / des Produzenten, in der gefertigt wird. */
  at?: string
  tools?: string[]
  terrain?: TerrainRequirement
  near?: { blueprint: string, radius: number } | { deposit: string, radius: number }
  /** Stromverbrauch. */
  power?: number
  workers?: number
  space?: number
  doctrine?: string
  storeys?: number
  /** Ein Kran-Item muss ≤ CRANE_RADIUS am Bauplatz stehen. */
  crane?: 1
}

export interface Recipe {
  id: string
  inputs: Record<string, number>
  outputs: Record<string, number>
  lp: number
  knowledge?: string[]
  power?: number
}

export interface Blueprint {
  id: string
  name: string
  name_de: string
  description_de?: string
  kind: BlueprintKind
  class?: BuildingClass
  tier: BlueprintTier
  inputs: Record<string, number>
  requires: Requires
  /** Arbeit in LP (= Sekunden eines ungeübten Arbeiters). */
  labour: number
  effects: Effect
  hp: number
  armor: Armor | 'wood'
  /** Radius in Metern. */
  size: number
  /** Bau-Fußabdruck für die Verdichtungsregel (§9). */
  space: number
  storeys?: number
  /** Zeichner im Client. */
  shape: string
  unit?: Pick<UnitDef, 'domain' | 'speed' | 'turnRate' | 'sight' | 'role' | 'cargo' | 'ammo'> & { weapons: BlueprintWeapon[], carry?: number, lp?: number }
  tool?: { job: ToolJob, tier: ToolTier & ('stone' | 'iron' | 'steel'), durability: number }
  weapon?: BlueprintWeapon
  /** Bewaffnung stationärer Gebäude (Legacy-Verteidigung). */
  weapons?: BlueprintWeapon[]
  /** Entworfene und als Teileliste hinterlegte Katalogeinträge. */
  parts?: { id: string, n: number }[]
  owner?: number
  version: number
  /** Entworfene Baupläne: Inhalts-Hash, Id 'd_<16 hex>'. */
  hash?: string
  public: boolean
}

// ---------------------------------------------------------------------------
// §4 Rohstoffe und Güter
// ---------------------------------------------------------------------------

export interface ResourceDef {
  id: string
  name_de: string
  tier: BlueprintTier
  /** Einheiten je Inventarplatz; 0 = nur per Karren transportierbar. */
  stack: number
}
export { INHABITANT } from './legacy.ts'

const R = (id: string, name_de: string, tier: BlueprintTier, stack: number): ResourceDef => ({ id, name_de, tier, stack })
/** Alle Güter mit Stapelgröße (Inventarplätze = Σ ceil(n / stack)). */
export const RESOURCES: readonly ResourceDef[] = [
  R('wood', 'Holz', 0, 1), R('stone', 'Stein', 0, 1), R('fiber', 'Fasern', 0, 5), R('berry', 'Beeren', 0, 5),
  R('fish', 'Fisch', 0, 2), R('meat', 'Fleisch', 0, 2), R('hide', 'Fell', 1, 1), R('grain', 'Getreide', 1, 5),
  R('flour', 'Mehl', 2, 5), R('clay', 'Ton', 1, 1), R('sand', 'Sand', 1, 5), R('planks', 'Bretter', 1, 1),
  R('rope', 'Seil', 1, 2), R('charcoal', 'Holzkohle', 1, 1), R('brick', 'Ziegel', 1, 1), R('leather', 'Leder', 1, 1),
  R('cloth', 'Stoff', 2, 2), R('iron_ore', 'Eisenerz', 2, 1), R('iron', 'Eisen', 2, 1), R('copper_ore', 'Kupfererz', 2, 1),
  R('copper', 'Kupfer', 3, 1), R('coal', 'Kohle', 2, 1), R('steel', 'Stahl', 3, 1), R('glass', 'Glas', 3, 1),
  R('cement', 'Zement', 3, 1), R('concrete', 'Beton', 3, 1), R('gear', 'Zahnrad', 3, 1), R('wire', 'Draht', 4, 5),
  R('electronics', 'Elektronik', 4, 1), R('engine', 'Motor', 4, 0), R('tracks', 'Ketten', 4, 0), R('wheels', 'Räder', 4, 0),
  R('gun', 'Geschütz', 4, 0), R('rifle', 'Gewehr', 4, 1), R('ammunition', 'Munition', 4, 20), R('crude_oil', 'Rohöl', 4, 1),
  R('fuel', 'Treibstoff', 4, 2), R('aluminium', 'Aluminium', 4, 1), R('uranium_ore', 'Uranerz', 5, 1), R('yellowcake', 'Yellowcake', 5, 1),
  R('enriched', 'angereichertes Uran', 6, 1), R('rocket_motor', 'Raketenmotor', 5, 1), R('guidance', 'Lenksystem', 5, 1),
  R('missile', 'Rakete', 6, 0), R('warhead_nuclear', 'Nuklearsprengkopf', 6, 0), R('missile_nuclear', 'Nuklearrakete', 6, 0),
]
export const RESOURCE_BY_ID: Readonly<Record<string, ResourceDef>> = Object.fromEntries(RESOURCES.map(r => [r.id, r]))
/** Stapelgröße eines Guts; Werkzeuge und unbekannte Güter stapeln 1, Karren-Güter 0. */
export function stackOf(resource: string): number {
  const r = RESOURCE_BY_ID[resource]
  return r ? r.stack : 1
}
/** Belegte Inventarplätze eines Bestands (§4). Karren-Güter (stack 0) belegen unendlich viele Plätze einer Person. */
export function slotsUsed(inv: Readonly<Record<string, number>>): number {
  let used = 0
  for (const [res, n] of Object.entries(inv)) {
    if (n <= 0) continue
    const stack = stackOf(res)
    if (stack === 0) return Infinity
    used += Math.ceil(n / stack)
  }
  return used
}

// ---------------------------------------------------------------------------
// §4 Rezepte
// ---------------------------------------------------------------------------

const rec = (id: string, inputs: Record<string, number>, outputs: Record<string, number>, lp: number, extra: Partial<Pick<Recipe, 'knowledge' | 'power'>> = {}): Recipe =>
  ({ id, inputs, outputs, lp, ...extra })

/** Rezepte (§4). Ein Rezept läuft in jedem Gebäude, dessen `effects.recipes` seine Id enthält. */
export const RECIPES: Readonly<Record<string, Recipe>> = Object.fromEntries(([
  // Werkbank
  rec('planks', { wood: 2 }, { planks: 1 }, 20),
  rec('rope', { fiber: 4 }, { rope: 1 }, 15),
  rec('cloth', { fiber: 6 }, { cloth: 1 }, 45, { knowledge: ['k:weaving'] }),
  // Fischerhütte, Tongrube, Steinbruch, Jägerhütte
  rec('fish', {}, { fish: 1 }, 18),
  rec('clay', {}, { clay: 1 }, 25),
  rec('stone', {}, { stone: 1 }, 30),
  rec('sand', {}, { sand: 1 }, 12),
  rec('leather', { hide: 1 }, { leather: 1 }, 30),
  // Brennofen
  rec('charcoal', { wood: 3 }, { charcoal: 2 }, 90),
  rec('brick', { clay: 2, wood: 1 }, { brick: 2 }, 60),
  // Rennofen
  rec('iron', { iron_ore: 2, charcoal: 1 }, { iron: 1 }, 90),
  rec('copper', { copper_ore: 2, charcoal: 1 }, { copper: 1 }, 60),
  // Bergwerk: Erz der Lagerstätte (45 LP je Einheit)
  rec('ore_iron', {}, { iron_ore: 1 }, GATHER_LP.iron_ore),
  rec('ore_copper', {}, { copper_ore: 1 }, GATHER_LP.copper_ore),
  rec('ore_coal', {}, { coal: 1 }, GATHER_LP.coal),
  rec('ore_uranium', {}, { uranium_ore: 1 }, 45, { knowledge: ['k:nuclear_chemistry'] }),
  // Sägewerk, Schmiede
  rec('planks_sawmill', { wood: 2 }, { planks: 3 }, 20),
  rec('gear', { iron: 3 }, { gear: 1 }, 600),
  // Hochofen
  rec('steel', { iron: 1, coal: 1 }, { steel: 1 }, 120),
  rec('steel_charcoal', { iron: 1, charcoal: 2 }, { steel: 1 }, 120),
  rec('glass', { sand: 3, charcoal: 1 }, { glass: 1 }, 60, { knowledge: ['k:glass'] }),
  rec('aluminium', { sand: 4, coal: 2 }, { aluminium: 1 }, 240, { knowledge: ['k:chemistry'], power: 20 }),
  // Windmühle
  rec('flour', { grain: 2 }, { flour: 3 }, 30),
  // Zementwerk
  rec('cement', { stone: 3, clay: 1, coal: 1 }, { cement: 2 }, 60),
  rec('concrete', { cement: 1, sand: 2 }, { concrete: 2 }, 30),
  // Maschinenhalle
  rec('gear_steel', { steel: 2 }, { gear: 1 }, 300),
  rec('wheels', { steel: 8, iron: 4 }, { wheels: 1 }, 300),
  rec('tracks', { steel: 30 }, { tracks: 1 }, 600),
  rec('engine', { steel: 20, gear: 4, copper: 4 }, { engine: 1 }, 1_800, { knowledge: ['k:combustion'] }),
  rec('gun', { steel: 25 }, { gun: 1 }, 900, { knowledge: ['k:ballistics'] }),
  rec('rifle', { steel: 3, planks: 1 }, { rifle: 1 }, 240, { knowledge: ['k:firearms'] }),
  rec('ammunition', { copper: 1, coal: 1 }, { ammunition: 20 }, 60),
  // Elektronikwerkstatt
  rec('wire', { copper: 1 }, { wire: 4 }, 20),
  rec('electronics', { wire: 4, glass: 1, copper: 1 }, { electronics: 1 }, 240),
  // Ölpumpe, Raffinerie
  rec('crude_oil', {}, { crude_oil: 1 }, 20),
  rec('fuel', { crude_oil: 2 }, { fuel: 3 }, 30),
  rec('fuel_coal', { coal: 3 }, { fuel: 1 }, 60),
  // Uran
  rec('yellowcake', { uranium_ore: 4 }, { yellowcake: 1 }, 600),
  rec('enriched', { yellowcake: 2 }, { enriched: 1 }, 7_200, { power: 200 }),
  // Montagehalle
  rec('rocket_motor', { steel: 6, aluminium: 4, fuel: 2 }, { rocket_motor: 1 }, 1_200, { knowledge: ['k:rocketry'] }),
  rec('guidance', { electronics: 4, wire: 8 }, { guidance: 1 }, 2_400, { knowledge: ['k:guidance'] }),
  rec('missile', { aluminium: 40, rocket_motor: 4, guidance: 1, electronics: 6 }, { missile: 1 }, 72_000),
  rec('warhead_nuclear', { enriched: 10 }, { warhead_nuclear: 1 }, 36_000, { knowledge: ['k:nuclear'] }),
  rec('missile_nuclear', { missile: 1, warhead_nuclear: 1 }, { missile_nuclear: 1 }, 3_600, { knowledge: ['k:nuclear'] }),
] as Recipe[]).map(r => [r.id, r]))

/** Gebäude je Rezept (§4 obtained_by); Grundlage für `requires.at`-Auskünfte, auch für Phasen ≥ 2. */
export const RECIPE_BUILDINGS: Readonly<Record<string, readonly string[]>> = {
  planks: ['workbench'], rope: ['workbench'], cloth: ['workbench'],
  fish: ['fishing_hut'], clay: ['clay_pit'], stone: ['quarry'], sand: ['quarry'], leather: ['hunter_lodge'],
  charcoal: ['kiln', 'kiln_stone'], brick: ['kiln', 'kiln_stone'],
  iron: ['bloomery'], copper: ['bloomery'],
  ore_iron: ['mine'], ore_copper: ['mine'], ore_coal: ['mine'], ore_uranium: ['mine'],
  planks_sawmill: ['sawmill'], gear: ['forge'],
  steel: ['furnace'], steel_charcoal: ['furnace'], glass: ['furnace'], aluminium: ['furnace'],
  flour: ['windmill'], cement: ['cement_works'], concrete: ['cement_works'],
  gear_steel: ['machine_shop'], wheels: ['machine_shop'], tracks: ['machine_shop'], engine: ['machine_shop'],
  gun: ['machine_shop'], rifle: ['machine_shop'], ammunition: ['machine_shop'],
  wire: ['electronics_workshop'], electronics: ['electronics_workshop'],
  crude_oil: ['oil_pump'], fuel: ['refinery'], fuel_coal: ['refinery'],
  yellowcake: ['uranium_mill'], enriched: ['enrichment_plant'],
  rocket_motor: ['assembly_hall'], guidance: ['assembly_hall'], missile: ['assembly_hall'],
  warhead_nuclear: ['assembly_hall'], missile_nuclear: ['assembly_hall'],
}
/** Rezept-Id des Bergwerks je Lagerstätten-Rohstoff. */
export const ORE_RECIPE: Readonly<Record<string, string>> = { iron_ore: 'ore_iron', copper: 'ore_copper', copper_ore: 'ore_copper', coal: 'ore_coal', uranium: 'ore_uranium' }

// ---------------------------------------------------------------------------
// §7 Grundkatalog (Einträge 1–18, Phase 1)
// ---------------------------------------------------------------------------

const LAND: Domain[] = ['land']
const LAND_AIR: Domain[] = ['land', 'air']

/** Nahkampfwaffe (dmg / reload / range). */
const melee = (damage: number, reload: number, range: number): BlueprintWeapon =>
  ({ range, damage, reload, warhead: 'melee', targets: LAND, speed: 0 })

type Row = Omit<Blueprint, 'version' | 'public' | 'space'> & { space?: number }
/** Füllt Version, Sichtbarkeit und den Fußabdruck (space = 2 × size, §9) auf. */
const bp = (row: Row): Blueprint => ({ ...row, space: row.space ?? row.size * 2, version: 1, public: true })

export const BASE_CATALOG: readonly Blueprint[] = [
  // 1 Unterschlupf
  bp({
    id: 'shelter', name: 'Shelter', name_de: 'Unterschlupf', kind: 'building', class: 'shelter', tier: 0,
    inputs: { wood: 8, fiber: 4 }, requires: {}, labour: 90,
    effects: { house: 1, store: 40 }, hp: 60, armor: 'wood', size: 3, shape: 'leanto',
    description_de: 'Ein Dach aus Holz und Fasern: ein Bett, 40 Einheiten Lager. Gründet die erste Siedlung.',
  }),
  // 2 Lagerfeuer
  bp({
    id: 'campfire', name: 'Campfire', name_de: 'Lagerfeuer', kind: 'building', class: 'workshop', tier: 0,
    inputs: { stone: 4, wood: 4 }, requires: {}, labour: 60,
    effects: { fire: 1, cook: 1, study: 1, machineMul: 1, burner: { resource: 'wood', perHour: 1 }, slots: 1 },
    hp: 40, armor: 'structure', size: 1.5, shape: 'fire',
    description_de: 'Feuer und Kochstelle; hier lässt sich Grundwissen studieren. Verbrennt 1 Holz je Stunde.',
  }),
  // 3 Werkbank
  bp({
    id: 'workbench', name: 'Workbench', name_de: 'Werkbank', kind: 'building', class: 'workshop', tier: 0,
    inputs: { wood: 12, stone: 4 }, requires: { knowledge: ['k:woodworking'] }, labour: 240,
    effects: { craft: 1, slots: 1, study: 1, machineMul: 1, recipes: ['planks', 'rope', 'cloth'] },
    hp: 80, armor: 'wood', size: 2, shape: 'bench',
    description_de: 'Fertigt Steinwerkzeuge, Korb, Speer und Bogen; Rezepte Bretter, Seil, Stoff; Studium von Schrift, Verhüttung und Weberei.',
  }),
  // 4–6 Steinwerkzeuge
  bp({
    id: 'stone_axe', name: 'Stone axe', name_de: 'Steinaxt', kind: 'tool', tier: 0,
    inputs: { wood: 2, stone: 2 }, requires: { at: 'workbench' }, labour: 45,
    effects: {}, tool: { job: 'wood', tier: 'stone', durability: 300 }, hp: 1, armor: 'wood', size: 0, shape: 'axe',
    description_de: 'Holz ×1.5, hält 300 Einheiten.',
  }),
  bp({
    id: 'stone_pick', name: 'Stone pick', name_de: 'Steinhacke', kind: 'tool', tier: 0,
    inputs: { wood: 2, stone: 3 }, requires: { at: 'workbench' }, labour: 45,
    effects: {}, tool: { job: 'stone', tier: 'stone', durability: 300 }, hp: 1, armor: 'wood', size: 0, shape: 'pick',
    description_de: 'Stein, Erz und Ton ×1.5, hält 300 Einheiten.',
  }),
  bp({
    id: 'hammer', name: 'Hammer', name_de: 'Hammer', kind: 'tool', tier: 0,
    inputs: { wood: 2, stone: 2 }, requires: { at: 'workbench' }, labour: 45,
    effects: {}, tool: { job: 'build', tier: 'stone', durability: 3_000 }, hp: 1, armor: 'wood', size: 0, shape: 'hammer',
    description_de: 'Bauen ×1.5, hält 3 000 LP.',
  }),
  // 7 Korb
  bp({
    id: 'basket', name: 'Basket', name_de: 'Korb', kind: 'tool', tier: 0,
    inputs: { fiber: 12 }, requires: { at: 'workbench' }, labour: 40,
    effects: { carry: 10 }, hp: 1, armor: 'wood', size: 0, shape: 'basket',
    description_de: '+10 Inventarplätze; Beeren und Fasern ×1.3.',
  }),
  // 8 Speer
  bp({
    id: 'spear', name: 'Spear', name_de: 'Speer', kind: 'weapon', tier: 0,
    inputs: { wood: 3, stone: 1 }, requires: { at: 'workbench' }, labour: 60,
    effects: {}, weapon: melee(12, 1.5, 3), hp: 1, armor: 'wood', size: 0, shape: 'spear',
    description_de: `Nahkampf 12 Schaden / 1.5 s / 3 m; Jagd ${Math.round(HUNT_SUCCESS.spear * 100)} % aus ${HUNT_RANGE.spear} m; Fischen ×1.3.`,
  }),
  // 9 Hütte
  bp({
    id: 'hut', name: 'Hut', name_de: 'Hütte', kind: 'building', class: 'house', tier: 0,
    inputs: { wood: 20, stone: 8, fiber: 10 }, requires: { knowledge: ['k:woodworking'] }, labour: 540,
    effects: { house: 4, store: 60 }, hp: 240, armor: 'wood', size: 4, shape: 'hut',
    description_de: 'Vier Betten und 60 Einheiten Lager. Die erste Hütte bringt Zimmerei und legt die Standardaufgaben an.',
  }),
  // 10 Lager
  bp({
    id: 'storage', name: 'Storage', name_de: 'Lager', kind: 'building', class: 'storage', tier: 0,
    inputs: { wood: 20, stone: 4 }, requires: { knowledge: ['k:woodworking'] }, labour: 300,
    effects: { store: 500 }, hp: 200, armor: 'wood', size: 4, shape: 'storage',
    description_de: '500 Einheiten Lager für den Siedlungspool.',
  }),
  // 11 Feld
  bp({
    id: 'field', name: 'Field', name_de: 'Feld', kind: 'building', class: 'farm', tier: 0,
    inputs: { wood: 6 }, requires: { knowledge: ['k:farming'], terrain: 'arable' }, labour: 200,
    effects: { farm: { lpPerUnit: GATHER_LP.grain, output: 'grain' }, slots: 2 }, hp: 60, armor: 'wood', size: 6, shape: 'field',
    description_de: 'Getreide, 15 LP je Einheit × Bodengüte; zwei Arbeiter; ×1.2 mit Brunnen ≤ 300 m.',
  }),
  // 12 Fischerhütte
  bp({
    id: 'fishing_hut', name: 'Fishing hut', name_de: 'Fischerhütte', kind: 'building', class: 'workshop', tier: 0,
    inputs: { wood: 16, fiber: 10 }, requires: { knowledge: ['k:woodworking'], terrain: 'water_adjacent' }, labour: 300,
    effects: { recipes: ['fish'], slots: 2, machineMul: 1 }, hp: 160, armor: 'wood', size: 3, shape: 'hut',
    description_de: 'Fisch, 18 LP je Einheit; zwei Arbeiter; muss am Wasser stehen.',
  }),
  // 13 Palisade
  bp({
    id: 'palisade', name: 'Palisade', name_de: 'Palisade', kind: 'building', class: 'wall', tier: 0,
    inputs: { wood: 6 }, requires: { knowledge: ['k:carpentry'] }, labour: 90,
    effects: { wall: { hp: 120 } }, hp: 120, armor: 'wood', size: 2, shape: 'wall',
    description_de: 'Mauersegment aus Holz, Hindernis für Einheiten; rastet am vorherigen Segment ein.',
  }),
  // 14 Wachturm
  bp({
    id: 'watchtower', name: 'Watchtower', name_de: 'Wachturm', kind: 'building', class: 'tower', tier: 0,
    inputs: { wood: 30, stone: 6 }, requires: { knowledge: ['k:carpentry'] }, labour: 600,
    effects: { tower: { sight: 900, garrison: 2 }, sight: 900 }, hp: 300, armor: 'wood', size: 3, storeys: 2, shape: 'tower',
    description_de: 'Sicht 900 m, Platz für zwei Wachen (Reichweite +50 %).',
  }),
  // 15 Bogen
  bp({
    id: 'bow', name: 'Bow', name_de: 'Bogen', kind: 'weapon', tier: 0,
    inputs: { wood: 4, fiber: 6 }, requires: { knowledge: ['k:carpentry'], at: 'workbench' }, labour: 120,
    effects: {}, weapon: { range: 120, damage: 10, reload: 2, warhead: 'arrow', targets: LAND_AIR, speed: 50 },
    hp: 1, armor: 'wood', size: 0, shape: 'bow',
    description_de: `Pfeil 10 Schaden / 2 s / 120 m; Jagd ${Math.round(HUNT_SUCCESS.bow * 100)} % aus ${HUNT_RANGE.bow} m.`,
  }),
  // 16 Brunnen
  bp({
    id: 'well', name: 'Well', name_de: 'Brunnen', kind: 'building', class: 'workshop', tier: 1,
    inputs: { stone: 20 }, requires: { knowledge: ['k:masonry'] }, labour: 400,
    effects: { well: 1 }, hp: 200, armor: 'structure', size: 2, shape: 'well',
    description_de: '+1 Bett je Haus ≤ 300 m (max +5), Felder ×1.2 ≤ 300 m, Zuwanderung ×0.8.',
  }),
  // 17 Haus
  bp({
    id: 'house', name: 'House', name_de: 'Haus', kind: 'building', class: 'house', tier: 1,
    inputs: { planks: 24, stone: 20, fiber: 6 }, requires: { knowledge: ['k:carpentry', 'k:masonry'] }, labour: 1_200,
    effects: { house: 6, store: 80, morale: 0.05 }, hp: 400, armor: 'structure', size: 5, shape: 'house',
    description_de: 'Sechs Betten, 80 Einheiten Lager, Moral +0.05.',
  }),
  // 18 Karren
  bp({
    id: 'cart', name: 'Cart', name_de: 'Karren', kind: 'vehicle', tier: 1,
    inputs: { wood: 16, rope: 2 }, requires: { knowledge: ['k:carpentry'], at: 'workbench' }, labour: 360,
    effects: { carry: CART_SLOTS },
    unit: { domain: 'land', speed: 4, turnRate: 180, sight: PERSON_SIGHT, weapons: [], carry: CART_SLOTS },
    hp: 80, armor: 'wood', size: 1.5, shape: 'cart',
    description_de: '60 Ladeplätze, 4 km/h, von einem Bewohner gezogen; Transport zwischen Siedlungen.',
  }),
]

// ---------------------------------------------------------------------------
// Systembaupläne (nicht baubar): Avatar, Personen, Knoten, Rakete
// ---------------------------------------------------------------------------

const person = (row: Pick<Blueprint, 'id' | 'name' | 'name_de' | 'hp' | 'shape' | 'description_de'> & { speed?: number, size?: number, weapons?: BlueprintWeapon[] }): Blueprint => bp({
  id: row.id, name: row.name, name_de: row.name_de, kind: 'unit', tier: 0,
  inputs: {}, requires: {}, labour: 0, effects: {},
  unit: { domain: 'land', speed: row.speed ?? PERSON_SPEED_KMH, turnRate: 360, sight: PERSON_SIGHT, weapons: row.weapons ?? [], carry: PERSON_CARRY, lp: WORKER_LP },
  hp: row.hp, armor: 'infantry', size: row.size ?? 1.2, shape: row.shape, description_de: row.description_de,
})

const node = (row: Pick<Blueprint, 'id' | 'name' | 'name_de' | 'size' | 'shape' | 'description_de'> & { hp?: number, unit?: Blueprint['unit'] }): Blueprint => bp({
  id: row.id, name: row.name, name_de: row.name_de, kind: 'item', tier: 0,
  inputs: {}, requires: {}, labour: 0, effects: {}, unit: row.unit,
  hp: row.hp ?? 1, armor: 'structure', size: row.size, shape: row.shape, description_de: row.description_de,
})

/** Baupläne, die das Spiel selbst erzeugt (§6, §10, §11); nie in `buildable`. */
export const SYSTEM_CATALOG: readonly Blueprint[] = [
  bp({
    id: 'avatar', name: 'Avatar', name_de: 'Avatar', kind: 'unit', tier: 0,
    inputs: {}, requires: {}, labour: 0, effects: {},
    unit: { domain: 'land', speed: AVATAR_SPEED_KMH, turnRate: 360, sight: AVATAR_SIGHT, weapons: [melee(4, 1, 2)], carry: AVATAR_SLOTS, lp: AVATAR_LP },
    hp: 100, armor: 'infantry', size: 1.5, shape: 'avatar',
    description_de: 'Du. 6 km/h, Sicht 400 m, 30 Inventarplätze, 2.5 LP/s. Stirbt vielleicht, kehrt aber immer zurück.',
  }),
  person({ id: 'worker', name: 'Worker', name_de: 'Bewohner', hp: 40, shape: 'person', description_de: 'Bewohner bei Außenarbeit: 5 km/h, trägt 10 Einheiten, 1 LP/s.' }),
  person({ id: 'migrant', name: 'Migrant', name_de: 'Zuwanderer', hp: 40, shape: 'migrant', description_de: 'Ein Fremder auf dem Weg zum nächsten Haus.' }),
  person({ id: 'refugees', name: 'Refugees', name_de: 'Flüchtlinge', hp: 40, speed: 4, size: 1.5, shape: 'refugees', description_de: 'Bewohner einer verlorenen Siedlung auf dem Weg in die nächste eigene (hp 40 × √n).' }),
  person({ id: 'militia', name: 'Militia', name_de: 'Miliz', hp: 60, shape: 'militia', weapons: [melee(4, 1, 2)], description_de: 'Wache mit der besten Waffe aus dem Pool; 8-Stunden-Schicht am Wachturm.' }),
  node({ id: 'cache', name: 'Cache', name_de: 'Nachlass', size: 1, shape: 'cache', description_de: 'Abgelegte Güter (Tod, zerstörtes Lager, Pool-Überschuss). 600 s nur für den Besitzer.' }),
  node({ id: 'ruin', name: 'Ruin', name_de: 'Ruine', size: 3, shape: 'ruin', description_de: 'Rest eines zerstörten Gebäudes; 30 % der Zutaten sind 24 h lang bergbar.' }),
  node({
    id: 'deer', name: 'Deer', name_de: 'Hirsch', size: 1, hp: 20, shape: 'deer',
    unit: { domain: 'land', speed: DEER_FLEE_KMH, turnRate: 360, sight: 100, weapons: [] },
    description_de: 'Wild: flieht mit 8 km/h; erlegt gibt es 4 Fleisch und 2 Fell.',
  }),
  node({ id: 'fallout', name: 'Fallout', name_de: 'Fallout', size: 2_000, shape: 'fallout', description_de: 'Verstrahltes Gebiet (2 km): kein Sammeln, Arbeit ×0.5, kein Ackerland; 24 h.' }),
  bp({
    id: 'icbm', name: 'Missile', name_de: 'Interkontinentalrakete', kind: 'vehicle', tier: 6,
    inputs: {}, requires: {}, labour: 0, effects: {},
    unit: { domain: 'air', speed: 3_000, turnRate: 360, sight: 0, weapons: [] },
    hp: 60, armor: 'air', size: 3, shape: 'icbm',
    description_de: 'Gestartete Rakete: 3 000 km/h, detoniert am Ziel.',
  }),
]
export const SYSTEM_IDS: ReadonlySet<string> = new Set(SYSTEM_CATALOG.map(b => b.id))
export function isSystemBlueprint(id: string) { return SYSTEM_IDS.has(id) }

export const BASE_BY_ID: Readonly<Record<string, Blueprint>> = Object.fromEntries([...BASE_CATALOG, ...SYSTEM_CATALOG].map(b => [b.id, b]))

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

export function isBuildingBlueprint(b: Blueprint) { return b.kind === 'building' }
/** Werkzeuge, Gegenstände und Waffen werden gefertigt (craft). */
export function isCraftable(b: Blueprint) { return b.kind === 'tool' || b.kind === 'item' || b.kind === 'weapon' }
/** Einheiten und Fahrzeuge entstehen aus einer Gebäude-Warteschlange – bis auf den Karren, der an der Werkbank gefertigt wird. */
export function isUnitBlueprint(b: Blueprint) { return b.kind === 'unit' || b.kind === 'vehicle' }
export function isToolBlueprint(b: Blueprint) { return b.kind === 'tool' && !!b.tool }
export function isWeaponBlueprint(b: Blueprint) { return b.kind === 'weapon' && !!b.weapon }
export function isBuildable(b: Blueprint) { return !SYSTEM_IDS.has(b.id) }
/** Verb der API: build (Gebäude), craft (Werkzeug/Item/Waffe und alles mit `requires.at` Werkbank/Schmiede), queue (Einheiten am Produzenten). */
export type BuildVerb = 'build' | 'craft' | 'queue'
export function verbOf(b: Blueprint): BuildVerb {
  if (b.kind === 'building') return 'build'
  if (isCraftable(b)) return 'craft'
  return b.requires.at === 'workbench' || b.requires.at === 'forge' || b.requires.at === 'machine_shop' ? 'craft' : 'queue'
}
/** Maschinenfaktor eines Gebäude-Bauplans (Effekt, sonst Tabelle §2, sonst 1). */
export function machineMulOf(b: Blueprint) { return b.effects.machineMul ?? MACHINE_MUL[b.id] ?? 1 }
/** Innenarbeitsplätze eines Gebäudes. */
export function slotsOf(b: Blueprint) { return b.effects.slots ?? 0 }
/** Rezepte, die in diesem Gebäude laufen. */
export function recipesOf(b: Blueprint): Recipe[] { return (b.effects.recipes ?? []).map(id => RECIPES[id]).filter((r): r is Recipe => !!r) }
/** Höchste Wissensstufe der Voraussetzungen (Katalog-Tier von Legacy-Einträgen). */
export function tierOfKnowledge(tags: readonly string[] | undefined): BlueprintTier { return playerTier(tags ?? []) }

/**
 * Gesamtkatalog: Grundkatalog ∪ Systembaupläne ∪ Legacy-Adapter (∪ entworfene Baupläne, wenn übergeben).
 * Spätere Einträge mit gleicher Id überschreiben frühere.
 */
export function makeCatalog(designed?: Iterable<Blueprint>): Map<string, Blueprint> {
  const m = new Map<string, Blueprint>()
  for (const b of BASE_CATALOG) m.set(b.id, b)
  for (const b of SYSTEM_CATALOG) m.set(b.id, b)
  for (const b of LEGACY_CATALOG) m.set(b.id, b)
  if (designed) for (const b of designed) m.set(b.id, b)
  return m
}

/** Ein Bauplan ist eine Siedlungswurzel, wenn er Betten oder Lager bringt (§10). */
export function foundsSettlement(b: Blueprint) { return (b.effects.house ?? 0) > 0 || (b.effects.store ?? 0) > 0 }

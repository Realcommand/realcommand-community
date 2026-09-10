/**
 * Legacy-Adapter (SPEC-v2 §11): wickelt jede v1-Einheit und jedes v1-Gebäude aus shared/data.ts als Bauplan.
 * Werte 1:1 (hp, Panzerung, Sicht, Größe, Waffen), Zutaten aus LEGACY_INPUTS (handgesetzte Tabelle, sonst
 * Kategorieformel), Wissen aus LEGACY_KNOWLEDGE, Doktrin aus `factions`, Produzent aus der Kategorie.
 * Nur Daten und reine Funktionen; importiert aus shared/blueprints.ts ausschließlich Typen (kein Laufzeitzyklus).
 */

import { BUILDINGS, UNITS, type BuildingDef, type Category, type Def, type UnitDef } from './data.ts'
import { MACHINE_MUL, playerTier } from './pacing.ts'
import type { Blueprint, BlueprintKind, BlueprintWeapon, Effect, Requires } from './blueprints.ts'

/** Pseudo-Rohstoff der Legacy-Infanterie: ein Bewohner wird verbraucht (§11 Produktion, pop−−). */
export const INHABITANT = 'inhabitant'

/** Handgesetzte Zutaten (§11). `labour` überschreibt buildTime × 60; `doctrine` setzt requires.doctrine (sonst aus `factions`). */
export interface LegacyInputs {
  inputs: Record<string, number>
  labour?: number
}

const I = (inputs: Record<string, number>, labour?: number): LegacyInputs => ({ inputs, labour })

export const LEGACY_INPUTS: Readonly<Record<string, LegacyInputs>> = {
  // Infanterie: ein Bewohner wird verbraucht (Pseudo-Rohstoff INHABITANT, §11 Produktion)
  rifleman: I({ [INHABITANT]: 1, rifle: 1, ammunition: 20, cloth: 2 }, 2_400),
  rocketeer: I({ [INHABITANT]: 1, rocket_motor: 2, steel: 6, electronics: 1, cloth: 2 }, 3_600),
  engineer: I({ [INHABITANT]: 1, iron_tools: 1, cloth: 2 }, 3_600),
  medic: I({ [INHABITANT]: 1, cloth: 4, glass: 2 }, 3_600),
  sniper: I({ [INHABITANT]: 1, rifle: 1, glass: 4, steel: 1 }, 4_500),
  // Fahrzeuge
  scout: I({ steel: 20, engine: 1, wheels: 1, electronics: 1, fuel: 6 }, 10_800),
  extractor: I({ steel: 40, engine: 1, wheels: 2, gear: 4, fuel: 15 }, 28_800),
  lighttank: I({ steel: 36, engine: 1, tracks: 1, gun: 1, electronics: 1, fuel: 10 }, 21_600),
  mbt: I({ steel: 60, engine: 1, tracks: 1, gun: 1, electronics: 2, fuel: 17 }, 36_000),
  heavytank: I({ steel: 92, engine: 2, tracks: 2, gun: 2, electronics: 3, fuel: 26 }, 54_000),
  artillery: I({ steel: 56, engine: 1, tracks: 1, gun: 1, electronics: 2, fuel: 16 }, 36_000),
  mlrs: I({ steel: 64, engine: 1, tracks: 1, rocket_motor: 6, electronics: 2, fuel: 18 }, 39_600),
  aa: I({ steel: 40, engine: 1, wheels: 1, gun: 1, electronics: 1, fuel: 11 }, 25_200),
  samtruck: I({ steel: 52, engine: 1, wheels: 1, rocket_motor: 4, guidance: 1, electronics: 2, fuel: 14 }, 28_800),
  apc: I({ steel: 36, engine: 1, tracks: 1, fuel: 10 }, 18_000),
  crawler: I({ steel: 200, engine: 2, tracks: 2, electronics: 7, gear: 20, fuel: 55 }, 108_000),
  // Luft
  gunship: I({ aluminium: 38, engine: 1, electronics: 5, rocket_motor: 8, fuel: 30 }, 36_000),
  jet: I({ aluminium: 55, engine: 2, electronics: 7, guidance: 1, fuel: 44 }, 54_000),
  interceptor: I({ aluminium: 50, engine: 2, electronics: 7, rocket_motor: 4, guidance: 2, fuel: 40 }, 50_400),
  cargoheli: I({ aluminium: 40, engine: 1, electronics: 5, fuel: 32 }, 36_000),
  // Marine
  patrol: I({ steel: 50, engine: 1, gun: 1, electronics: 2, fuel: 25 }, 28_800),
  destroyer: I({ steel: 125, engine: 2, gun: 1, rocket_motor: 4, guidance: 1, electronics: 5, fuel: 63 }, 72_000),
  submarine: I({ steel: 100, engine: 2, electronics: 4, rocket_motor: 4, fuel: 50 }, 64_800),
  cruiser: I({ steel: 200, engine: 3, gun: 2, electronics: 8, fuel: 100 }, 108_000),
  landingship: I({ steel: 75, engine: 2, electronics: 3, fuel: 38 }, 43_200),
  // Gebäude
  power: I({ concrete: 40, steel: 20, copper: 10, wire: 10 }, 25_200),
  refinery: I({ concrete: 83, steel: 42, copper: 20 }, 43_200),
  barracks: I({ concrete: 30, steel: 15 }, 21_600),
  factory: I({ concrete: 100, steel: 50, gear: 4 }, 54_000),
  radar: I({ concrete: 50, steel: 25, electronics: 10, wire: 10 }, 36_000),
  airfield: I({ concrete: 83, steel: 42, electronics: 4 }, 54_000),
  shipyard: I({ concrete: 100, steel: 50 }, 54_000),
  tech: I({ concrete: 133, steel: 67, electronics: 20, glass: 20 }, 72_000),
  command: I({ concrete: 167, steel: 83, electronics: 10 }, 90_000),
  // Verteidigung
  bunker: I({ concrete: 20, steel: 10, rifle: 1 }, 14_400),
  turret: I({ concrete: 27, steel: 13, gun: 1 }, 18_000),
  aagun: I({ concrete: 33, steel: 17, gun: 1, electronics: 1 }, 18_000),
  sam: I({ concrete: 50, steel: 25, rocket_motor: 4, guidance: 1, electronics: 2 }, 28_800),
  coastal: I({ concrete: 67, steel: 33, gun: 2 }, 36_000),
}

/** Wissen je Legacy-Eintrag (§11); auch Grundlage der v1→v2-Migration (Wissen aus vorhandenen Gebäudetypen). */
export const LEGACY_KNOWLEDGE: Readonly<Record<string, readonly string[]>> = {
  rifleman: ['k:firearms', 'k:drill'],
  rocketeer: ['k:firearms', 'k:drill', 'k:rocketry'],
  engineer: ['k:drill'],
  medic: ['k:drill'],
  sniper: ['k:firearms'],
  scout: ['k:combustion'],
  extractor: ['k:combustion'],
  lighttank: ['k:combustion', 'k:armour'],
  mbt: ['k:combustion', 'k:armour'],
  heavytank: ['k:combustion', 'k:armour', 'k:steel_frame'],
  artillery: ['k:ballistics'],
  mlrs: ['k:rocketry'],
  aa: ['k:ballistics'],
  samtruck: ['k:guidance'],
  apc: ['k:combustion'],
  crawler: ['k:armour', 'k:radio'],
  gunship: ['k:flight'],
  jet: ['k:flight', 'k:guidance'],
  interceptor: ['k:flight', 'k:guidance'],
  cargoheli: ['k:flight'],
  patrol: ['k:naval'],
  destroyer: ['k:naval', 'k:guidance'],
  submarine: ['k:naval', 'k:electricity'],
  cruiser: ['k:naval', 'k:ballistics'],
  landingship: ['k:naval'],
  power: ['k:electricity', 'k:steam'],
  refinery: ['k:combustion'],
  barracks: ['k:firearms', 'k:drill'],
  factory: ['k:combustion', 'k:armour'],
  radar: ['k:radio'],
  airfield: ['k:flight'],
  shipyard: ['k:naval'],
  tech: ['k:electricity', 'k:chemistry'],
  command: ['k:radio', 'k:concrete'],
  bunker: ['k:firearms'],
  turret: ['k:ballistics'],
  aagun: ['k:ballistics'],
  sam: ['k:rocketry', 'k:guidance'],
  coastal: ['k:ballistics'],
}

/** Englische Namen (data.ts führt nur deutsche); `command` heißt in v2 Rathaus. */
export const LEGACY_NAME_EN: Readonly<Record<string, string>> = {
  rifleman: 'Rifleman', rocketeer: 'Rocketeer', engineer: 'Engineer', medic: 'Medic', sniper: 'Sniper',
  scout: 'Scout car', extractor: 'Extractor', crawler: 'Crawler', lighttank: 'Light tank', mbt: 'Main battle tank',
  heavytank: 'Heavy tank', artillery: 'Artillery', mlrs: 'Rocket launcher', aa: 'AA tank', samtruck: 'SAM truck', apc: 'APC',
  gunship: 'Gunship', jet: 'Jet bomber', interceptor: 'Interceptor', cargoheli: 'Cargo helicopter',
  patrol: 'Patrol boat', destroyer: 'Destroyer', submarine: 'Submarine', cruiser: 'Cruiser', landingship: 'Landing ship',
  command: 'Town hall', power: 'Power plant', refinery: 'Refinery', barracks: 'Barracks', factory: 'Factory', radar: 'Radar',
  airfield: 'Airfield', shipyard: 'Shipyard', tech: 'Research centre', bunker: 'Bunker', turret: 'Gun turret',
  aagun: 'AA gun', sam: 'SAM site', coastal: 'Coastal battery',
}
const LEGACY_NAME_DE_OVERRIDE: Readonly<Record<string, string>> = { command: 'Rathaus' }

/** Produzent je Kategorie (requires.at); Gebäude haben keinen. */
export const LEGACY_PRODUCER: Readonly<Record<Category, string | undefined>> = {
  infantry: 'barracks', vehicle: 'factory', aircraft: 'airfield', ship: 'shipyard', structure: undefined, defense: undefined,
}
/** Innenarbeitsplätze der Produzenten (§11 Produktion). */
export const LEGACY_SLOTS: Readonly<Record<string, number>> = { barracks: 4, factory: 10, airfield: 6, shipyard: 8, refinery: 4 }
/** Gebäudeketten, die als Nähe-Bedingung sinnvoll bleiben (§11): Flugfeld und Raketenstellung brauchen ein Radar. */
export const LEGACY_NEAR: Readonly<Record<string, { blueprint: string, radius: number }>> = {
  airfield: { blueprint: 'radar', radius: 2_500 },
  sam: { blueprint: 'radar', radius: 2_500 },
}
/** Rezepte der Legacy-Werkstätten. */
const LEGACY_RECIPES: Readonly<Record<string, string[]>> = { refinery: ['fuel', 'fuel_coal'] }

/** Kategorieformel für Einträge ohne Zeile in LEGACY_INPUTS (§11). */
export function legacyInputsByFormula(def: Def): Record<string, number> {
  const c = def.cost
  switch (def.category) {
    case 'infantry': return { [INHABITANT]: 1, rifle: 1, cloth: 2 }
    case 'vehicle': return { steel: Math.round(c / 25), electronics: Math.round(c / 700), fuel: Math.round(c / 90) }
    case 'aircraft': return { aluminium: Math.round(c / 40), electronics: Math.round(c / 300), fuel: Math.round(c / 50) }
    case 'ship': return { steel: Math.round(c / 20), electronics: Math.round(c / 500), fuel: Math.round(c / 40) }
    default: return { concrete: Math.round(c / 30), steel: Math.round(c / 60) }
  }
}

/** Zutaten eines Legacy-Eintrags (Tabelle, sonst Formel); Nullwerte der Formel werden entfernt. */
export function legacyInputs(def: Def): Record<string, number> {
  const row = LEGACY_INPUTS[def.id]
  if (row) return { ...row.inputs }
  return Object.fromEntries(Object.entries(legacyInputsByFormula(def)).filter(([, n]) => n > 0))
}

/** Arbeit eines Legacy-Eintrags: Tabellenwert, sonst buildTime × 60. */
export function legacyLabour(def: Def): number {
  return LEGACY_INPUTS[def.id]?.labour ?? def.buildTime * 60
}

function legacyKind(def: Def): BlueprintKind {
  if (def.kind === 'building') return 'building'
  return def.category === 'infantry' ? 'unit' : 'vehicle'
}

function legacyRequires(def: Def): Requires {
  const req: Requires = {}
  const knowledge = LEGACY_KNOWLEDGE[def.id]
  if (knowledge && knowledge.length) req.knowledge = [...knowledge]
  const at = LEGACY_PRODUCER[def.category]
  if (at) req.at = at
  if (def.factions && def.factions.length) req.doctrine = def.factions[0]
  const near = LEGACY_NEAR[def.id]
  if (near) req.near = { ...near }
  if (def.kind === 'building') {
    if (def.power < 0) req.power = -def.power
    if (def.placement === 'coast') req.terrain = 'coast'
  }
  return req
}

function legacyEffects(def: BuildingDef): Effect {
  const fx: Effect = { sight: def.sight }
  if (def.power > 0) fx.power = def.power
  const slots = LEGACY_SLOTS[def.id]
  if (slots) { fx.slots = slots; fx.machineMul = MACHINE_MUL[def.id] ?? 1 }
  const recipes = LEGACY_RECIPES[def.id]
  if (recipes) fx.recipes = [...recipes]
  if (def.id === 'command') { fx.firmSlots = 6; fx.store = 5_000; fx.respawn = 1 }
  return fx
}

const weaponsOf = (def: Def): BlueprintWeapon[] => def.weapons.map(w => ({ ...w, targets: [...w.targets] }))

/** Wickelt eine v1-Definition als Bauplan (§11): gleiche Id, `shape = id`, Werte 1:1. */
export function legacyToBlueprint(def: Def): Blueprint {
  const requires = legacyRequires(def)
  const tier = playerTier(requires.knowledge ?? [])
  const base: Blueprint = {
    id: def.id,
    name: LEGACY_NAME_EN[def.id] ?? def.name,
    name_de: LEGACY_NAME_DE_OVERRIDE[def.id] ?? def.name,
    description_de: def.description,
    kind: legacyKind(def),
    tier: tier < 4 ? 4 : tier,
    inputs: legacyInputs(def),
    requires,
    labour: legacyLabour(def),
    effects: {},
    hp: def.hp,
    armor: def.armor,
    size: def.size,
    space: def.size * 2,
    shape: def.id,
    version: 1,
    public: true,
  }
  if (def.kind === 'unit') {
    const u: UnitDef = def
    base.unit = {
      domain: u.domain, speed: u.speed, turnRate: u.turnRate, sight: u.sight, weapons: weaponsOf(u),
      role: u.role, cargo: u.cargo, ammo: u.ammo,
    }
    if (u.role === 'transport' && u.cargo) base.unit.carry = u.cargo
  } else {
    base.class = 'legacy'
    base.effects = legacyEffects(def)
    if (def.weapons.length) base.weapons = weaponsOf(def)
  }
  return base
}

/** Alle Legacy-Baupläne in Katalogreihenfolge (Einheiten, dann Gebäude). */
export const LEGACY_CATALOG: readonly Blueprint[] = [...UNITS, ...BUILDINGS].map(legacyToBlueprint)
export const LEGACY_BY_ID: Readonly<Record<string, Blueprint>> = Object.fromEntries(LEGACY_CATALOG.map(b => [b.id, b]))
export const LEGACY_IDS: ReadonlySet<string> = new Set(LEGACY_CATALOG.map(b => b.id))
export function isLegacyBlueprint(id: string) { return LEGACY_IDS.has(id) }

/** Wissen, das ein v1-Spieler aus seinen vorhandenen Gebäudetypen mitbringt (Migration §3). */
export function legacyKnowledgeOf(buildingTypes: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const t of buildingTypes) for (const tag of LEGACY_KNOWLEDGE[t] ?? []) out.add(tag)
  return [...out]
}

/**
 * Entwurfsmaschine von Real Command v2 (SPEC-v2 §9).
 * Spieler wählen Teile (`PARTS`); Zutaten, Arbeit und Wirkungen werden daraus abgeleitet – kein LLM, keine
 * gewünschten Effekte. `designBlueprint(spec, ctx)` ist rein und deterministisch und läuft auf Server
 * (Registrierung) und Client (Live-Vorschau) gleich. Die Id ist ein Inhalts-Hash `d_<16 hex>` über
 * `{class, kind, parts sortiert}`; das eingebaute SHA-256 kommt ohne Imports aus (Browser und Node).
 */

import { BASE_CATALOG, tierOfKnowledge, type Blueprint, type BlueprintKind, type BuildingClass, type Effect, type Requires } from './blueprints.ts'
import type { Armor } from './data.ts'
import { DOING_BY_TAG, GATHER_LP, LP_PER_WORK_HOUR, SETTLEMENT_RADIUS, STUDY_BY_TAG, studyPath, workHours } from './pacing.ts'

// ---------------------------------------------------------------------------
// Teile
// ---------------------------------------------------------------------------

/** Eigenschaften eines Teils; alle additiv über die Teileliste (§9). */
export type PartProp =
  | 'structure' | 'load' | 'seal' | 'cover' | 'access' | 'area' | 'beds' | 'store' | 'fire' | 'cook' | 'craft' | 'slots' | 'machine'
  | 'hp' | 'sight' | 'garrison' | 'wallHp' | 'mech' | 'power' | 'powerUse' | 'firmSlots' | 'launch' | 'range' | 'storey' | 'foundation'
export const PART_PROPS: readonly PartProp[] = [
  'structure', 'load', 'seal', 'cover', 'access', 'area', 'beds', 'store', 'fire', 'cook', 'craft', 'slots', 'machine',
  'hp', 'sight', 'garrison', 'wallHp', 'mech', 'power', 'powerUse', 'firmSlots', 'launch', 'range', 'storey', 'foundation',
]
export type PartProps = Partial<Record<PartProp, number>>

/** Entwerfbare Gebäudeklasse (alles außer `legacy`). */
export type DesignClass = Exclude<BuildingClass, 'legacy'>
export const DESIGN_CLASSES: readonly DesignClass[] = ['shelter', 'house', 'storage', 'workshop', 'wall', 'tower', 'farm', 'mill', 'power', 'market', 'highrise', 'silo']

export interface Part {
  id: string
  name_de: string
  /** Arbeit des Teils in LP. */
  lp: number
  inputs: Record<string, number>
  knowledge: string[]
  /** Klassen, in denen das Teil verbaut werden darf. */
  classes: DesignClass[]
  props: PartProps
}

/** Überdachte Holzbauklassen, in die Pfosten, Wände, Dächer, Böden und Türen passen (Phase 3 erweitert um Mühle usw.). */
const SHELL: DesignClass[] = ['shelter', 'house', 'storage', 'workshop', 'tower', 'mill', 'market', 'power']

const part = (id: string, name_de: string, lp: number, inputs: Record<string, number>, classes: DesignClass[], props: PartProps, knowledge: string[] = []): Part =>
  ({ id, name_de, lp, inputs, knowledge, classes, props })

/** Die 15 Teile der Phase 1 (§9); Phase 3 füllt die Tabelle (Stein-/Ziegel-/Betonwände, Stahlrahmen, Rotoren, Dynamos, Startrohre …). */
export const PARTS: readonly Part[] = [
  part('post_wood', 'Holzpfosten', 30, { wood: 2 }, SHELL, { structure: 1 }),
  part('wall_wood', 'Holzwand', 60, { wood: 4 }, SHELL, { structure: 2, seal: 1, hp: 40 }),
  part('wall_wattle', 'Flechtwand', 40, { wood: 2, fiber: 4 }, SHELL, { structure: 1, seal: 1, hp: 20 }),
  part('roof_thatch', 'Reetdach', 60, { fiber: 12, wood: 2 }, SHELL, { seal: 1, cover: 1 }),
  part('roof_plank', 'Bretterdach', 120, { planks: 8 }, SHELL, { seal: 2, cover: 1, hp: 30 }, ['k:carpentry']),
  part('floor_plank', 'Bretterboden', 90, { planks: 6 }, SHELL, { area: 3 }, ['k:carpentry']),
  part('door_wood', 'Holztür', 45, { wood: 3 }, SHELL, { access: 1 }),
  part('bed', 'Bett', 40, { wood: 3, fiber: 4 }, ['shelter', 'house', 'highrise'], { beds: 1, load: 1 }),
  part('hearth_stone', 'Steinherd', 80, { stone: 6 }, ['shelter', 'house', 'workshop'], { fire: 1, cook: 1, load: 1 }),
  part('shelf_wood', 'Holzregal', 50, { wood: 4 }, ['shelter', 'house', 'storage', 'workshop', 'market'], { store: 20, load: 1 }),
  part('bench', 'Werkbank', 60, { wood: 6, stone: 2 }, ['workshop', 'mill'], { slots: 1, craft: 1, load: 2 }, ['k:woodworking']),
  part('palisade_stake', 'Palisadenpfahl', 90, { wood: 6 }, ['wall'], { wallHp: 120 }),
  part('platform_wood', 'Holzplattform', 120, { wood: 10 }, ['tower'], { storey: 1, sight: 150, garrison: 2 }, ['k:carpentry']),
  part('foundation_stone', 'Steinfundament', 150, { stone: 12 }, SHELL, { structure: 4, foundation: 1 }, ['k:masonry']),
  part('foundation_wood', 'Holzfundament', 100, { wood: 8 }, SHELL, { structure: 2, foundation: 1 }),
]
export const PART_BY_ID: Readonly<Record<string, Part>> = Object.fromEntries(PARTS.map(p => [p.id, p]))
export const PART_IDS: readonly string[] = PARTS.map(p => p.id)

/** Teile, die in einer Klasse erlaubt sind. */
export function partsForClass(cls: string): Part[] { return PARTS.filter(p => (p.classes as string[]).includes(cls)) }
/** Klassen der Phase 1 (§16); Phase 3 schaltet farm, mill, power, market frei, Phase 4/5 highrise und silo. */
export const DESIGNABLE_CLASSES: readonly DesignClass[] = ['shelter', 'house', 'storage', 'workshop', 'wall', 'tower']
/** Wissen, das den Entwerfen-Tab freischaltet (§8). */
export const DESIGN_KNOWLEDGE = 'k:carpentry'

// ---------------------------------------------------------------------------
// Klassenregeln, Faktoren, Kappen
// ---------------------------------------------------------------------------

export interface ClassRule {
  /** Genau ein Fundamentteil nötig (alle Klassen außer shelter und wall). */
  foundation: boolean
  /** cover ≥ 1 und seal ≥ storeys. */
  roofed: boolean
  /** Nur Mauerteile (wallHp). */
  wallOnly?: boolean
  /** Mindestfläche (Farm). */
  minArea?: number
  /** Mindestabdichtung (Silo). */
  minSeal?: number
  /** Genau einmal nötige Teile (Silo: Startrohr, Leitstand). */
  requiredParts?: string[]
}
export const CLASS_RULES: Readonly<Record<DesignClass, ClassRule>> = {
  shelter: { foundation: false, roofed: true },
  house: { foundation: true, roofed: true },
  storage: { foundation: true, roofed: true },
  workshop: { foundation: true, roofed: true },
  wall: { foundation: false, roofed: false, wallOnly: true },
  tower: { foundation: true, roofed: true },
  farm: { foundation: true, roofed: false, minArea: 3 },
  mill: { foundation: true, roofed: true },
  power: { foundation: true, roofed: true },
  market: { foundation: true, roofed: true },
  highrise: { foundation: true, roofed: true },
  silo: { foundation: true, roofed: true, minSeal: 3, requiredParts: ['launch_tube', 'control_room'] },
}
/** Arbeitsfaktor je Klasse (§9). */
export const CLASS_FACTOR: Readonly<Record<DesignClass, number>> = {
  shelter: 1.0, house: 1.1, storage: 1.0, workshop: 1.2, wall: 1.0, tower: 1.2, farm: 1.0, mill: 1.2, power: 1.5, market: 1.3, highrise: 1.6, silo: 2.5,
}
/** Achsen, die je Klasse gekappt werden (auf den Endwert der Wirkung). */
export type CapAxis = 'beds' | 'store' | 'slots' | 'machine' | 'wallHp' | 'sight' | 'garrison' | 'area' | 'mech' | 'power' | 'firmSlots' | 'storeys' | 'range' | 'capacity'
export const CLASS_CAPS: Readonly<Record<DesignClass, Partial<Record<CapAxis, number>>>> = {
  shelter: { beds: 2, store: 60 },
  house: { beds: 12, store: 200 },
  storage: { store: 20_000 },
  workshop: { slots: 16, machine: 8 },
  wall: {}, // wallHp ≤ 3 × Basismauer gleichen Materials, siehe wallHpCap()
  tower: { sight: 2_500, garrison: 6 },
  farm: { area: 8 },
  mill: { mech: 40 },
  power: { power: 400 },
  market: { firmSlots: 12 },
  highrise: { beds: 300, firmSlots: 24, storeys: 40 },
  silo: { range: 2_500, capacity: 4, sight: 25_000 },
}
/** Trefferpunkte der Basismauer je Material (Palisade 120; Stein/Ziegel/Beton ab Phase 3). */
export const WALL_BASE_HP: Readonly<Partial<Record<Armor | 'wood', number>>> = { wood: 120, structure: 400 }
export const WALL_CAP_MUL = 3
export function wallHpCap(material: Armor | 'wood') { return WALL_CAP_MUL * (WALL_BASE_HP[material] ?? WALL_BASE_HP.wood!) }

/** Grenzen der Anfrage. */
export const MAX_PART_ENTRIES = 64
export const MAX_PARTS_TOTAL = 400
export const MAX_BLUEPRINTS_PER_PLAYER = 200
export const NAME_MIN = 2
export const NAME_MAX = 40
/** Faktoren der Arbeitsformel. */
export const DISTINCT_STEP = 0.05
export const HEIGHT_STEP = 0.03
export const LOAD_MARGIN = 1.2
export const STRUCTURE_PER_STOREY = 6
export const BASE_HP = 30
export const BASE_SIGHT = 200
export const AREA_PER_SLOT = 3
export const FLOOR_FRACTION = 0.8
/** Startrampen: Kapazität 2 je Rohr, Reichweite 1 500 km + 500 km je Radarschüssel (Silo, Phase 5). */
export const LAUNCH_PER_TUBE = 2
export const RANGE_BASE_KM = 1_500
export const RANGE_PER_DISH_KM = 500
/** Büroflächen zählen erst ab vier Stockwerken (Hochhaus). */
export const FIRM_SLOTS_MIN_STOREYS = 4
/** Hochhaus-Betten: ×1.2 mit Strom, halbiert ohne (angewendet zur Laufzeit, hier als Konstanten). */
export const HIGHRISE_POWERED_MUL = 1.2
export const HIGHRISE_UNPOWERED_MUL = 0.5

/** Verdichtung: ab 12 Gebäuden im 400-m-Cluster +5 % Arbeit je weiterem Gebäude (§9). */
export const CROWD_RADIUS = SETTLEMENT_RADIUS
export const CROWD_FREE = 12
export const CROWD_STEP = 0.05
/** crowdFactor = 1 + 0.05 × max(0, count − 12); `count` = Gebäude, die der Cluster bereits hält. */
export function crowdFactor(count: number) { return 1 + CROWD_STEP * Math.max(0, Math.floor(count) - CROWD_FREE) }
/** Freie Bauplätze schrumpfen mit dem Cluster: spots × 12 / max(12, count). */
export function crowdSpots(spots: number, count: number) { return Math.max(1, Math.floor(spots * CROWD_FREE / Math.max(CROWD_FREE, Math.floor(count)))) }

// ---------------------------------------------------------------------------
// Anfrage, Kontext, Ergebnis
// ---------------------------------------------------------------------------

export interface DesignPartRef { id: string; n?: number }
export interface DesignSpec {
  name: string
  /** Phase 1: nur `building`. */
  kind?: BlueprintKind
  class: string
  /** Zeichner; fehlt er, gilt der Standard der Klasse. */
  shape?: string
  parts: DesignPartRef[]
  /** Nur prüfen, nicht registrieren (entscheidet der Server; die Maschine rechnet gleich). */
  dryRun?: boolean
}

export interface DesignContext {
  /** Bekannte Wissens-Tags; fehlt die Menge, wird Wissen nicht geprüft (Admin, Katalog-Teilelisten). */
  knowledge?: ReadonlySet<string> | Iterable<string>
  /** Katalog für Bodenregel und Duplikate; Standard `BASE_CATALOG`. */
  catalog?: ReadonlyMap<string, Blueprint> | Iterable<Blueprint>
  owner?: number
  /** Anzahl eigener entworfener Baupläne (blueprint_limit). */
  ownCount?: number
  /** Gebäude im 400-m-Cluster des geplanten Bauplatzes (Verdichtung, nur informativ). */
  clusterCount?: number
  /** Siedlungspool oder Inventar für `missing.materials` (nur informativ). */
  pool?: Readonly<Record<string, number>>
}

export type DesignErrorCode =
  | 'invalid_name' | 'invalid_kind' | 'invalid_class' | 'invalid_parts' | 'too_many_parts' | 'unknown_material'
  | 'class_rules' | 'missing_knowledge' | 'below_floor' | 'blueprint_limit'
export interface DesignError {
  code: DesignErrorCode
  part?: string
  /** Englischer Hinweis (API). */
  hint: string
  rule?: string
  tags?: string[]
  value?: number
  limit?: number
  /** Katalogeintrag der Bodenregel. */
  base?: string
  used?: number
  cap?: number
  classes?: string[]
}
/** Objektform fehlenden Wissens (§8): überall gleich. */
export interface MissingKnowledge {
  tag: string
  how: string
  costLp?: number
  at?: string
  prereqOk: boolean
  path: { tag: string, costLp?: number, at?: string, how: string }[]
  totalHours: number
}
export interface DesignSuggestion {
  /** Betroffenes Teil (gesperrt oder unbekannt). */
  part?: string
  /** Nächstes bekanntes Ersatzteil. */
  substitute?: string
  /** Teil, das eine verletzte Regel erfüllen würde. */
  add?: { id: string, n: number }
  hint: string
}
export interface DesignDerived {
  props: Record<PartProp, number>
  distinctParts: number
  totalParts: number
  lpParts: number
  distinctFactor: number
  storeys: number
  heightFactor: number
  classFactor: number
  labour: number
  workHours: number
  crowdFactor?: number
  labourAtSite?: number
  /** Achsen, deren Rohsumme über der Kappe lag. */
  capped: Partial<Record<CapAxis, { raw: number, cap: number }>>
  material: Armor | 'wood'
  hp: number
  size: number
  space: number
  missingMaterials?: Record<string, number>
  /** Ein Bauplan mit dieser Id ist im Katalog schon vorhanden. */
  exists?: boolean
}
export interface DesignOk { ok: true; blueprint: Blueprint; explain: string[]; derived: DesignDerived; warnings: string[]; suggestions: DesignSuggestion[] }
export interface DesignFail {
  ok: false
  code: DesignErrorCode
  errors: DesignError[]
  missing: { knowledge: MissingKnowledge[], materials: Record<string, number> }
  suggestions: DesignSuggestion[]
  explain: string[]
}
export type DesignResult = DesignOk | DesignFail

/** Standard-Zeichner je Klasse (Client-Fallback `hall` mit Stockwerken). */
export const DEFAULT_SHAPE: Readonly<Record<DesignClass, string>> = {
  shelter: 'leanto', house: 'hut', storage: 'storage', workshop: 'hut', wall: 'wall', tower: 'tower', farm: 'field', mill: 'mill', power: 'hall', market: 'hall', highrise: 'hall', silo: 'hall',
}
const SHAPE_RE = /^[a-z][a-z0-9_]{0,23}$/

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const f2 = (x: number) => x.toFixed(2)
const list = (o: Readonly<Record<string, number>>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || '–'

/** Material eines Guts für die Panzerung: Stein, Ziegel, Beton, Metall → `structure`, sonst Holz. */
const STRUCTURE_RESOURCES = new Set(['stone', 'brick', 'clay', 'cement', 'concrete', 'iron', 'steel', 'glass', 'copper', 'aluminium', 'sand'])
function materialOf(inputs: Readonly<Record<string, number>>): Armor | 'wood' {
  let structure = 0, wood = 0
  for (const [res, n] of Object.entries(inputs)) { if (STRUCTURE_RESOURCES.has(res)) structure += n; else wood += n }
  return structure > wood ? 'structure' : 'wood'
}

function toSet(known: DesignContext['knowledge']): ReadonlySet<string> | undefined {
  if (!known) return undefined
  return known instanceof Set ? known : new Set(known)
}
function catalogList(catalog: DesignContext['catalog']): Blueprint[] {
  if (!catalog) return BASE_CATALOG as Blueprint[]
  return catalog instanceof Map ? [...catalog.values()] : [...(catalog as Iterable<Blueprint>)]
}

/** Fehlendes Wissen als Objekt mit Pfad und Stunden (§8); Doing-Tags tragen `how` der Regel und keine Kosten. */
export function knowledgeInfo(tag: string, known: ReadonlySet<string>): MissingKnowledge {
  const study = STUDY_BY_TAG[tag]
  const doing = DOING_BY_TAG[tag]
  const path = studyPath(tag, known).map(t => {
    const s = STUDY_BY_TAG[t], d = DOING_BY_TAG[t]
    return s ? { tag: t, costLp: s.costLp, at: s.minAt, how: `study ${t} at ${s.minAt}` } : { tag: t, how: d ? d.how : `learn ${t}` }
  })
  const totalHours = Math.round(path.reduce((sum, p) => sum + (p.costLp ?? 0), 0) / LP_PER_WORK_HOUR * 100) / 100
  const prereqOk = !study || study.prereq.every(p => known.has(p))
  const how = study
    ? (prereqOk ? `study ${tag} at ${study.minAt}` : `study ${study.prereq.filter(p => !known.has(p)).join(', ')} first, then ${tag} at ${study.minAt}`)
    : doing ? doing.how : `learn ${tag}`
  return { tag, how, costLp: study?.costLp, at: study?.minAt, prereqOk, path, totalHours }
}

/** Levenshtein-Abstand (kleine Ids, für Vorschläge bei Tippfehlern). */
function editDistance(a: string, b: string) {
  const prev = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}
/** Nächste bekannte Teile-Id (Tippfehler), sonst undefined. */
export function nearestPartId(id: string): string | undefined {
  let best: string | undefined, bestD = Infinity
  for (const p of PARTS) {
    const d = editDistance(id.toLowerCase(), p.id)
    if (d < bestD) { bestD = d; best = p.id }
  }
  return bestD <= Math.max(3, Math.floor(id.length / 3)) ? best : undefined
}
/** Rolle eines Teils (für Ersatzvorschläge): erste Eigenschaft dieser Rangfolge. */
const ROLE_PROPS: readonly PartProp[] = ['foundation', 'cover', 'wallHp', 'storey', 'area', 'slots', 'beds', 'store', 'fire', 'access', 'structure']
function roleOf(p: Part): PartProp | undefined { return ROLE_PROPS.find(k => (p.props[k] ?? 0) > 0) }
/** Nächstes Ersatzteil gleicher Rolle, das in der Klasse erlaubt und dem Spieler bekannt ist (günstigstes zuerst). */
export function substituteFor(partId: string, cls: string, known: ReadonlySet<string>): Part | undefined {
  const p = PART_BY_ID[partId]
  if (!p) return undefined
  const role = roleOf(p)
  if (!role) return undefined
  return partsForClass(cls)
    .filter(q => q.id !== p.id && (q.props[role] ?? 0) > 0 && q.knowledge.every(t => known.has(t)))
    .sort((a, b) => a.lp - b.lp)[0]
}

// ---------------------------------------------------------------------------
// SHA-256 (klein, ohne Imports; Browser und Node)
// ---------------------------------------------------------------------------

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
/** UTF-8-Bytes eines Strings (ohne TextEncoder, damit die Funktion überall gleich ist). */
function utf8Bytes(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return out
}
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
/** SHA-256 eines Strings als 64 Hex-Zeichen. */
export function sha256Hex(text: string): string {
  const msg = utf8Bytes(text)
  const len = msg.length
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  const bitsHi = Math.floor(len / 0x20000000), bitsLo = (len * 8) >>> 0
  msg.push((bitsHi >>> 24) & 0xff, (bitsHi >>> 16) & 0xff, (bitsHi >>> 8) & 0xff, bitsHi & 0xff)
  msg.push((bitsLo >>> 24) & 0xff, (bitsLo >>> 16) & 0xff, (bitsLo >>> 8) & 0xff, bitsLo & 0xff)
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4
      W[i] = (msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K256[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  let hex = ''
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0')
  return hex
}

/** Teileliste zusammengefasst (gleiche Ids addiert) und nach Id sortiert – die kanonische Form. */
export function canonicalParts(parts: readonly DesignPartRef[]): { id: string, n: number }[] {
  const m = new Map<string, number>()
  for (const p of parts) m.set(p.id, (m.get(p.id) ?? 0) + (p.n ?? 1))
  return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
/** Kanonisches JSON `{class, kind, parts sortiert}` und daraus die Id `d_<16 hex>`. */
export function canonicalJson(cls: string, kind: BlueprintKind, parts: readonly DesignPartRef[]): string {
  return JSON.stringify({ class: cls, kind, parts: canonicalParts(parts) })
}
export function designId(cls: string, kind: BlueprintKind, parts: readonly DesignPartRef[]): string {
  return 'd_' + sha256Hex(canonicalJson(cls, kind, parts)).slice(0, 16)
}
export function isDesignedId(id: string) { return /^d_[0-9a-f]{16}$/.test(id) }

// ---------------------------------------------------------------------------
// Bodenregel
// ---------------------------------------------------------------------------

/** Vergleichsachsen der Bodenregel: jede Wirkung als Zahl (Flags 0/1, Rezepte gezählt). */
export function effectAxes(e: Effect): Record<string, number> {
  const a: Record<string, number> = {}
  const num = (k: string, v: number | undefined) => { if (v) a[k] = v }
  num('house', e.house); num('store', e.store); num('fire', e.fire); num('cook', e.cook); num('craft', e.craft); num('study', e.study)
  num('recipes', e.recipes?.length); num('slots', e.slots); num('machineMul', e.machineMul); num('farm', e.farm ? 1 : 0)
  num('wall.hp', e.wall?.hp); num('tower.sight', e.tower?.sight); num('tower.garrison', e.tower?.garrison); num('power', e.power)
  num('burner', e.burner ? 1 : 0); num('firmSlots', e.firmSlots); num('market', e.market); num('respawn', e.respawn); num('crane', e.crane)
  num('launch.capacity', e.launch?.capacity); num('launch.rangeKm', e.launch?.rangeKm); num('sight', e.sight); num('morale', e.morale)
  num('mech', e.mech); num('carry', e.carry); num('well', e.well)
  return a
}
/** Ist `design` auf jeder Achse von `base` mindestens gleich gut? Gibt die erste unterlegene Achse zurück, sonst undefined. */
export function dominanceGap(design: Effect, base: Effect): { axis: string, value: number, limit: number } | undefined {
  const d = effectAxes(design), b = effectAxes(base)
  for (const [axis, limit] of Object.entries(b)) {
    const value = d[axis] ?? 0
    if (value < limit) return { axis, value, limit }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Ableitung
// ---------------------------------------------------------------------------

interface Resolved { part: Part, n: number }
const zeroProps = (): Record<PartProp, number> => Object.fromEntries(PART_PROPS.map(k => [k, 0])) as Record<PartProp, number>

/**
 * Kappt eine additive Achse auf `cap` (ab `base`) und meldet das erste Exemplar je Teil, das nichts mehr beiträgt
 * (`roof_plank #3 adds nothing (store capped at 200)`). Rückgabe: gekappter Endwert.
 */
function capAxis(axis: CapAxis, label: string, base: number, contributions: { id: string, n: number, per: number }[], cap: number | undefined, warnings: string[], capped: DesignDerived['capped'], reason?: string): number {
  let cum = base
  const raw = base + contributions.reduce((s, c) => s + c.n * c.per, 0)
  if (cap === undefined || raw <= cap) return raw
  for (const c of contributions) {
    if (c.per <= 0) continue
    for (let k = 1; k <= c.n; k++) {
      if (cum >= cap) { warnings.push(`${c.id} #${k} adds nothing (${reason ?? `${label} capped at ${cap}`})`); break }
      cum += c.per
    }
  }
  capped[axis] = { raw, cap }
  return Math.min(raw, cap)
}

/** Reine, deterministische Ableitung eines Bauplans aus Teilen (§9). */
export function designBlueprint(spec: DesignSpec, ctx: DesignContext = {}): DesignResult {
  const errors: DesignError[] = []
  const warnings: string[] = []
  const explain: string[] = []
  const suggestions: DesignSuggestion[] = []
  const missingKnowledge: MissingKnowledge[] = []
  const known = toSet(ctx.knowledge)
  const fail = (): DesignFail => ({ ok: false, code: errors[0].code, errors, missing: { knowledge: missingKnowledge, materials: {} }, suggestions, explain })

  // --- Anfrage prüfen ---------------------------------------------------------
  const name = typeof spec?.name === 'string' ? spec.name.trim() : ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) errors.push({ code: 'invalid_name', hint: `name must have ${NAME_MIN}–${NAME_MAX} characters` })
  const kind: BlueprintKind = spec?.kind ?? 'building'
  if (kind !== 'building') errors.push({ code: 'invalid_kind', hint: 'only buildings can be designed in this phase' })
  const cls = spec?.class as DesignClass
  if (!(DESIGN_CLASSES as string[]).includes(cls)) {
    errors.push({ code: 'invalid_class', hint: `unknown class; choose one of ${DESIGNABLE_CLASSES.join(', ')}`, classes: [...DESIGNABLE_CLASSES] })
  } else if (!DESIGNABLE_CLASSES.includes(cls)) {
    errors.push({ code: 'class_rules', rule: 'class_unavailable', hint: `no parts for class ${cls} yet; choose one of ${DESIGNABLE_CLASSES.join(', ')}`, classes: [...DESIGNABLE_CLASSES] })
  }
  const shape = spec?.shape === undefined || spec.shape === '' ? undefined : spec.shape
  if (shape !== undefined && (typeof shape !== 'string' || !SHAPE_RE.test(shape))) errors.push({ code: 'invalid_parts', rule: 'shape', hint: 'shape must be a short lowercase identifier' })
  const refs = Array.isArray(spec?.parts) ? spec.parts : undefined
  if (!refs || refs.length === 0) errors.push({ code: 'invalid_parts', hint: 'parts must be a non-empty list of {id, n}' })
  else {
    if (refs.length > MAX_PART_ENTRIES) errors.push({ code: 'too_many_parts', rule: 'entries', hint: `at most ${MAX_PART_ENTRIES} part entries`, value: refs.length, limit: MAX_PART_ENTRIES })
    for (const r of refs) {
      const n = r?.n ?? 1
      if (!r || typeof r.id !== 'string' || !Number.isInteger(n) || n < 1) errors.push({ code: 'invalid_parts', part: r?.id, hint: 'each part needs an id and an integer n ≥ 1' })
    }
  }
  if (errors.some(e => e.code !== 'invalid_name')) return fail()
  const rule = CLASS_RULES[cls]

  // --- Teile auflösen -----------------------------------------------------------
  const merged = canonicalParts(refs!)
  const total = merged.reduce((s, p) => s + p.n, 0)
  if (total > MAX_PARTS_TOTAL) errors.push({ code: 'too_many_parts', rule: 'total', hint: `at most ${MAX_PARTS_TOTAL} parts in total`, value: total, limit: MAX_PARTS_TOTAL })
  const resolved: Resolved[] = []
  const missingTags = new Set<string>()
  for (const { id, n } of merged) {
    const p = PART_BY_ID[id]
    if (!p) {
      const near = nearestPartId(id)
      errors.push({ code: 'unknown_material', part: id, hint: near ? `unknown part ${id}; did you mean ${near}?` : `unknown part ${id}; see GET /parts` })
      if (near) suggestions.push({ part: id, substitute: near, hint: `replace ${id} with ${near}` })
      continue
    }
    if (!p.classes.includes(cls)) {
      errors.push({ code: 'class_rules', rule: 'part_class', part: id, hint: `${id} is not allowed in class ${cls} (allowed: ${p.classes.join(', ')})` })
      continue
    }
    if (known) {
      const lacking = p.knowledge.filter(t => !known.has(t))
      if (lacking.length) {
        for (const t of lacking) missingTags.add(t)
        const sub = substituteFor(id, cls, known)
        if (sub) suggestions.push({ part: id, substitute: sub.id, hint: `${id} needs ${lacking.join(', ')}; ${sub.id} is the nearest known substitute` })
      }
    }
    resolved.push({ part: p, n })
  }
  if (known && !known.has(DESIGN_KNOWLEDGE)) missingTags.add(DESIGN_KNOWLEDGE)
  if (missingTags.size) {
    const tags = [...missingTags].sort()
    for (const t of tags) missingKnowledge.push(knowledgeInfo(t, known!))
    errors.push({ code: 'missing_knowledge', tags, hint: `missing knowledge: ${tags.join(', ')}` })
  }
  if (errors.some(e => e.code === 'unknown_material' || e.code === 'too_many_parts' || (e.code === 'class_rules' && e.rule === 'part_class'))) return fail()

  // --- Summen ---------------------------------------------------------------------
  const props = zeroProps()
  const inputs: Record<string, number> = {}
  let lpParts = 0
  for (const { part: p, n } of resolved) {
    lpParts += p.lp * n
    for (const k of PART_PROPS) props[k] += (p.props[k] ?? 0) * n
    for (const [res, q] of Object.entries(p.inputs)) inputs[res] = (inputs[res] ?? 0) + q * n
  }
  const storeysRaw = Math.max(1, props.storey)
  explain.push(`parts: ${resolved.map(r => `${r.part.id} ×${r.n}`).join(', ')}`)
  explain.push(`inputs = Σ part.inputs × n: ${list(inputs)}`)
  explain.push(`lpParts = ${resolved.map(r => (r.n > 1 ? `${r.n}×${r.part.lp}` : `${r.part.lp}`)).join(' + ')} = ${lpParts}`)

  // --- Klassenregeln ----------------------------------------------------------------
  const foundations = props.foundation
  const structure = props.structure
  const ok = (cond: boolean) => (cond ? '✓' : '✗')
  if (rule.foundation && foundations !== 1) {
    errors.push({ code: 'class_rules', rule: 'foundation', hint: foundations === 0 ? `class ${cls} needs exactly one foundation part` : `class ${cls} allows exactly one foundation part`, value: foundations, limit: 1 })
    if (foundations === 0) {
      const f = partsForClass(cls).filter(p => (p.props.foundation ?? 0) > 0 && (!known || p.knowledge.every(t => known.has(t)))).sort((a, b) => a.lp - b.lp)[0]
      if (f) suggestions.push({ add: { id: f.id, n: 1 }, hint: `add ${f.id} as the foundation` })
    }
  } else if (!rule.foundation && foundations > 1) {
    errors.push({ code: 'class_rules', rule: 'foundation', hint: `class ${cls} allows at most one foundation part`, value: foundations, limit: 1 })
  }
  if (rule.wallOnly) {
    for (const { part: p } of resolved) if (!(p.props.wallHp ?? 0)) errors.push({ code: 'class_rules', rule: 'wall_parts', part: p.id, hint: `walls take wall parts only; ${p.id} is not one` })
  }
  if (rule.roofed) {
    explain.push(`cover ${props.cover} ≥ 1 ${ok(props.cover >= 1)}; seal ${props.seal} ≥ storeys ${storeysRaw} ${ok(props.seal >= storeysRaw)}`)
    if (props.cover < 1) {
      errors.push({ code: 'class_rules', rule: 'cover', hint: 'a building needs a roof (cover ≥ 1)', value: props.cover, limit: 1 })
      const r = partsForClass(cls).filter(p => (p.props.cover ?? 0) > 0 && (!known || p.knowledge.every(t => known.has(t)))).sort((a, b) => a.lp - b.lp)[0]
      if (r) suggestions.push({ add: { id: r.id, n: 1 }, hint: `add ${r.id} for cover` })
    }
    if (props.seal < storeysRaw) {
      errors.push({ code: 'class_rules', rule: 'seal', hint: `seal ${props.seal} must be ≥ storeys ${storeysRaw}; add walls`, value: props.seal, limit: storeysRaw })
      const w = partsForClass(cls).filter(p => (p.props.seal ?? 0) > 0 && !(p.props.cover ?? 0) && (!known || p.knowledge.every(t => known.has(t)))).sort((a, b) => a.lp - b.lp)[0]
      if (w) suggestions.push({ add: { id: w.id, n: storeysRaw - props.seal }, hint: `add ${storeysRaw - props.seal} × ${w.id} for seal` })
    }
  }
  const loadLimit = LOAD_MARGIN * props.load
  explain.push(`structure ${structure} ≥ ${LOAD_MARGIN} × load ${props.load} = ${f2(loadLimit)} ${ok(structure >= loadLimit)}`)
  if (structure < loadLimit) {
    errors.push({ code: 'class_rules', rule: 'structure', hint: `structure ${structure} is below ${LOAD_MARGIN} × load ${props.load}; add posts or walls`, value: structure, limit: loadLimit })
    const s = partsForClass(cls).filter(p => (p.props.structure ?? 0) > 0 && !(p.props.foundation ?? 0) && (!known || p.knowledge.every(t => known.has(t)))).sort((a, b) => a.lp / (a.props.structure ?? 1) - b.lp / (b.props.structure ?? 1))[0]
    if (s) suggestions.push({ add: { id: s.id, n: Math.ceil((loadLimit - structure) / (s.props.structure ?? 1)) }, hint: `add ${Math.ceil((loadLimit - structure) / (s.props.structure ?? 1))} × ${s.id} for structure` })
  }
  const storeyLimit = 1 + structure / STRUCTURE_PER_STOREY
  if (storeysRaw > 1 || props.storey > 0) explain.push(`storeys ${storeysRaw} ≤ 1 + structure/${STRUCTURE_PER_STOREY} = ${f2(storeyLimit)} ${ok(storeysRaw <= storeyLimit)}`)
  if (storeysRaw > storeyLimit) errors.push({ code: 'class_rules', rule: 'storeys', hint: `${storeysRaw} storeys need structure ≥ ${(storeysRaw - 1) * STRUCTURE_PER_STOREY}`, value: storeysRaw, limit: Math.floor(storeyLimit) })
  if (rule.minArea !== undefined && props.area < rule.minArea) errors.push({ code: 'class_rules', rule: 'area', hint: `class ${cls} needs area ≥ ${rule.minArea}`, value: props.area, limit: rule.minArea })
  if (rule.minSeal !== undefined && props.seal < rule.minSeal) errors.push({ code: 'class_rules', rule: 'seal_min', hint: `class ${cls} needs seal ≥ ${rule.minSeal}`, value: props.seal, limit: rule.minSeal })
  for (const req of rule.requiredParts ?? []) {
    const n = resolved.find(r => r.part.id === req)?.n ?? 0
    if (n !== 1) errors.push({ code: 'class_rules', rule: 'required_part', part: req, hint: `class ${cls} needs exactly one ${req}`, value: n, limit: 1 })
  }
  if (cls === 'power' && props.power - props.powerUse <= 0) errors.push({ code: 'class_rules', rule: 'power', hint: 'a power building must generate more than it uses', value: props.power, limit: props.powerUse + 1 })
  if (rule.roofed && props.access < 1 && cls !== 'shelter') warnings.push('no door (access 0): add door_wood so people can enter')

  // --- Kappen und Wirkungen -------------------------------------------------------------
  const material = (() => {
    const by: Record<string, number> = { wood: 0, structure: 0 }
    for (const { part: p, n } of resolved) { const s = p.props.structure ?? 0; if (s > 0) by[materialOf(p.inputs)] += s * n }
    return by.structure > by.wood ? 'structure' : by.structure === 0 && by.wood === 0 ? materialOf(inputs) : 'wood'
  })() as Armor | 'wood'
  const caps: Partial<Record<CapAxis, number>> = { ...CLASS_CAPS[cls] }
  if (cls === 'wall') caps.wallHp = wallHpCap(material)
  const capped: DesignDerived['capped'] = {}
  const contrib = (prop: PartProp) => resolved.map(r => ({ id: r.part.id, n: r.n, per: r.part.props[prop] ?? 0 }))
  const storeys = Math.max(1, capAxis('storeys', 'storeys', 0, contrib('storey'), caps.storeys, warnings, capped))
  const beds = capAxis('beds', 'beds', 0, contrib('beds'), caps.beds, warnings, capped)
  const store = capAxis('store', 'store', 0, contrib('store'), caps.store, warnings, capped)
  const area = capAxis('area', 'area', 0, contrib('area'), caps.area, warnings, capped)
  const slotsByArea = Math.max(1, Math.floor(area / AREA_PER_SLOT))
  const slotsCap = props.slots > 0 ? Math.min(caps.slots ?? Infinity, slotsByArea) : caps.slots
  const byArea = props.slots > slotsByArea && slotsByArea < (caps.slots ?? Infinity)
  const slots = capAxis('slots', 'slots', 0, contrib('slots'), slotsCap, warnings, capped, byArea ? `slots limited to ${slotsByArea} by floor area ${area}` : undefined)
  const machine = capAxis('machine', 'machine', 0, contrib('machine'), caps.machine, warnings, capped)
  const wallHp = capAxis('wallHp', 'wall hp', 0, contrib('wallHp'), caps.wallHp, warnings, capped)
  const sight = props.sight > 0 ? capAxis('sight', 'sight', BASE_SIGHT, contrib('sight'), caps.sight, warnings, capped) : 0
  const garrison = capAxis('garrison', 'garrison', 0, contrib('garrison'), caps.garrison, warnings, capped)
  const mech = capAxis('mech', 'mech', 0, contrib('mech'), caps.mech, warnings, capped)
  const netPower = cls === 'power' ? capAxis('power', 'power', -props.powerUse, contrib('power'), caps.power, warnings, capped) : props.power
  const firmSlots = storeys >= FIRM_SLOTS_MIN_STOREYS ? capAxis('firmSlots', 'firmSlots', 0, contrib('firmSlots'), caps.firmSlots, warnings, capped) : 0
  if (props.firmSlots > 0 && storeys < FIRM_SLOTS_MIN_STOREYS) warnings.push(`office floors give firm slots only from ${FIRM_SLOTS_MIN_STOREYS} storeys (storeys ${storeys})`)
  const capacity = props.launch > 0 ? capAxis('capacity', 'launch capacity', 0, contrib('launch').map(c => ({ ...c, per: c.per * LAUNCH_PER_TUBE })), caps.capacity, warnings, capped) : 0
  const rangeKm = props.launch > 0 ? capAxis('range', 'range', RANGE_BASE_KM, contrib('range').map(c => ({ ...c, per: c.per * RANGE_PER_DISH_KM })), caps.range, warnings, capped) : 0

  const effects: Effect = {}
  if (beds > 0) effects.house = beds
  if (store > 0) effects.store = store
  if (props.fire > 0) effects.fire = 1
  if (props.cook > 0) effects.cook = 1
  if (props.craft > 0) effects.craft = 1
  if (slots > 0) effects.slots = slots
  if (slots > 0 || props.craft > 0 || machine > 0) effects.machineMul = Math.round((1 + machine) * 100) / 100
  if (cls === 'farm' && area > 0) { effects.farm = { lpPerUnit: GATHER_LP.grain, output: 'grain' }; effects.slots = Math.max(1, Math.floor(area / AREA_PER_SLOT)) }
  if (wallHp > 0) effects.wall = { hp: wallHp }
  if (sight > 0) effects.sight = sight
  if (cls === 'tower') effects.tower = { sight: sight > 0 ? sight : BASE_SIGHT, garrison }
  if (mech > 0) effects.mech = mech
  if (netPower > 0) effects.power = netPower
  if (firmSlots > 0) effects.firmSlots = firmSlots
  if (cls === 'market') effects.market = 1
  if (capacity > 0) effects.launch = { capacity, rangeKm }
  const capLines = (Object.entries(caps) as [CapAxis, number][]).filter(([, v]) => v !== undefined && Number.isFinite(v)).map(([k, v]) => `${k} ${({ beds, store, slots, machine, wallHp, sight, garrison, area, mech, power: netPower, firmSlots, storeys, range: rangeKm, capacity } as Record<CapAxis, number>)[k]} (cap ${v})`)
  if (capLines.length) explain.push(`effects: ${capLines.join(', ')}`)

  // --- Arbeit --------------------------------------------------------------------------
  const distinctParts = resolved.length
  const distinctFactor = 1 + DISTINCT_STEP * (distinctParts - 1)
  const heightFactor = 1 + HEIGHT_STEP * (storeys - 1)
  const classFactor = CLASS_FACTOR[cls]
  const labour = Math.round(lpParts * distinctFactor * heightFactor * classFactor)
  explain.push(`distinctFactor = 1 + ${DISTINCT_STEP} × (${distinctParts} − 1) = ${f2(distinctFactor)}`)
  explain.push(`storeys = ${storeys}; heightFactor = 1 + ${HEIGHT_STEP} × (${storeys} − 1) = ${f2(heightFactor)}`)
  explain.push(`classFactor(${cls}) = ${f2(classFactor)}`)
  explain.push(`labour = ${lpParts} × ${f2(distinctFactor)} × ${f2(heightFactor)} × ${f2(classFactor)} = ${labour} LP (${workHours(labour)} wh)`)
  let crowd: number | undefined, labourAtSite: number | undefined
  if (ctx.clusterCount !== undefined) {
    crowd = crowdFactor(ctx.clusterCount)
    labourAtSite = Math.round(labour * crowd)
    explain.push(`crowdFactor(${ctx.clusterCount} buildings in the ${CROWD_RADIUS} m cluster) = ${f2(crowd)} → labour at site ${labourAtSite} LP`)
  }

  // --- Hülle -------------------------------------------------------------------------
  const hpParts = props.hp
  const hp = cls === 'wall' ? Math.max(BASE_HP + hpParts, wallHp) : BASE_HP + hpParts
  const size = Math.ceil(1 + 1.5 * Math.sqrt(area + storeys))
  const space = 2 * size
  explain.push(`hp = ${BASE_HP} + ${hpParts}${cls === 'wall' ? ` (wall ${wallHp})` : ''} = ${hp}; armor ${material} (dominant structure material)`)
  explain.push(`size = ⌈1 + 1.5 × √(area ${area} + storeys ${storeys})⌉ = ${size} m; space ${space}`)

  // --- Voraussetzungen ---------------------------------------------------------------------
  const tags = [...new Set(resolved.flatMap(r => r.part.knowledge))].sort()
  const requires: Requires = {}
  if (tags.length) requires.knowledge = tags
  if (props.powerUse > 0 && cls !== 'power') requires.power = props.powerUse
  if (cls === 'farm') requires.terrain = 'arable'
  if (cls === 'mill') requires.terrain = 'open'
  if (cls === 'highrise' || cls === 'silo') requires.crane = 1
  if (storeys > 1) requires.storeys = storeys
  explain.push(`requires: knowledge ${tags.join(', ') || '–'}${requires.power ? `, power ${requires.power}` : ''}${requires.terrain ? `, terrain ${requires.terrain}` : ''}${requires.crane ? ', crane' : ''}`)

  // --- Bodenregel ------------------------------------------------------------------------
  const catalog = catalogList(ctx.catalog)
  for (const base of catalog) {
    if (base.kind !== 'building' || base.class !== cls || base.hash || base.owner !== undefined) continue
    const gap = dominanceGap(effects, base.effects)
    if (gap) { explain.push(`floor: not ≥ ${base.id} (${gap.axis} ${gap.value} < ${gap.limit}) – no floor`); continue }
    const labourLimit = Math.round(FLOOR_FRACTION * base.labour)
    explain.push(`floor: ≥ ${base.id} on every axis → labour ≥ ${labourLimit} ${ok(labour >= labourLimit)}, inputs ≥ ${Math.round(FLOOR_FRACTION * 100)} % of ${list(base.inputs)}`)
    if (labour < labourLimit) errors.push({ code: 'below_floor', rule: 'labour', base: base.id, value: labour, limit: labourLimit, hint: `at least as good as ${base.id}, so labour must be ≥ ${labourLimit} LP (is ${labour})` })
    for (const [res, n] of Object.entries(base.inputs)) {
      const limit = Math.ceil(FLOOR_FRACTION * n), value = inputs[res] ?? 0
      if (value < limit) errors.push({ code: 'below_floor', rule: `input:${res}`, base: base.id, value, limit, hint: `at least as good as ${base.id}, so ${res} must be ≥ ${limit} (is ${value})` })
    }
  }

  // --- Id, Limit -----------------------------------------------------------------------
  const id = designId(cls, kind, merged)
  const exists = catalog.some(b => b.id === id)
  if (!exists && ctx.ownCount !== undefined && ctx.ownCount >= MAX_BLUEPRINTS_PER_PLAYER) {
    errors.push({ code: 'blueprint_limit', used: ctx.ownCount, cap: MAX_BLUEPRINTS_PER_PLAYER, hint: `at most ${MAX_BLUEPRINTS_PER_PLAYER} designed blueprints per player; delete one first` })
  }
  explain.push(`id = d_ + sha256(${canonicalJson(cls, kind, merged)})[0..16] = ${id}${exists ? ' (already registered)' : ''}`)

  let missingMaterials: Record<string, number> | undefined
  if (ctx.pool) {
    missingMaterials = {}
    for (const [res, n] of Object.entries(inputs)) { const short = n - (ctx.pool[res] ?? 0); if (short > 0) missingMaterials[res] = short }
    if (Object.keys(missingMaterials).length) warnings.push(`missing materials: ${list(missingMaterials)}`)
  }
  if (errors.length) {
    const f = fail()
    if (missingMaterials) f.missing.materials = missingMaterials
    return f
  }

  // --- Bauplan --------------------------------------------------------------------------
  const summary: string[] = []
  if (beds) summary.push(`${beds} ${beds === 1 ? 'Bett' : 'Betten'}`)
  if (store) summary.push(`${store} Lager`)
  if (effects.fire) summary.push('Feuer')
  if (effects.cook) summary.push('Kochstelle')
  if (effects.craft) summary.push('Fertigung')
  if (effects.slots) summary.push(`${effects.slots} Arbeitsplätze`)
  if (wallHp) summary.push(`Mauer ${wallHp} TP`)
  if (effects.tower) summary.push(`Sicht ${effects.tower.sight} m, ${garrison} Wachen`)
  if (effects.farm) summary.push(`Feld ${area} Fläche`)
  if (effects.mech) summary.push(`Mechanik ${mech}`)
  if (effects.power) summary.push(`Strom +${effects.power}`)
  if (effects.firmSlots) summary.push(`${effects.firmSlots} Firmenplätze`)
  const blueprint: Blueprint = {
    id, name, name_de: name,
    description_de: `Entworfen aus ${total} Teilen (${distinctParts} Arten): ${summary.join(', ') || 'keine Wirkung'}; ${hp} TP.`,
    kind, class: cls, tier: tierOfKnowledge(tags),
    inputs, requires, labour, effects, hp, armor: material, size, space,
    ...(storeys > 1 ? { storeys } : {}),
    shape: shape ?? DEFAULT_SHAPE[cls],
    parts: merged,
    ...(ctx.owner !== undefined ? { owner: ctx.owner } : {}),
    version: 1, hash: id, public: false,
  }
  const derived: DesignDerived = {
    props, distinctParts, totalParts: total, lpParts, distinctFactor, storeys, heightFactor, classFactor, labour, workHours: workHours(labour),
    ...(crowd !== undefined ? { crowdFactor: crowd, labourAtSite } : {}),
    capped, material, hp, size, space,
    ...(missingMaterials ? { missingMaterials } : {}),
    ...(exists ? { exists: true } : {}),
  }
  return { ok: true, blueprint, explain, derived, warnings, suggestions }
}

/** Zusammenfassung eines Teils für `GET /parts` (mit `known`/`missingKnowledge`, wenn Wissen übergeben wird). */
export function describePart(p: Part, known?: ReadonlySet<string> | Iterable<string>) {
  const set = toSet(known)
  const missing = set ? p.knowledge.filter(t => !set.has(t)).map(t => knowledgeInfo(t, set)) : []
  return { ...p, workHours: workHours(p.lp), ...(set ? { known: missing.length === 0, missingKnowledge: missing } : {}) }
}

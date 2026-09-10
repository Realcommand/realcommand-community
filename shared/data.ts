import { CIVIC_BUILDINGS } from './civic.ts'
/**
 * Spieldaten: Fraktionen, Waffen, Einheiten, Gebäude. Alle Werte sind eigene Entwürfe.
 * Geschwindigkeiten in km/h, Reichweiten/Größen in Metern, Bauzeiten in Sekunden (Echtzeit).
 */

export type FactionId = 'aurora' | 'meridian' | 'kestrel'
export type Domain = 'land' | 'air' | 'sea'
/** Panzerungen; `wood` (v2) tragen Holzbauten wie Unterschlupf, Hütte und Palisade. */
export type Armor = 'infantry' | 'light' | 'heavy' | 'air' | 'naval' | 'structure' | 'wood'
/** Gefechtsköpfe; `melee`, `arrow` und `nuke` sind v2 (Nahkampf, Bogen, Nuklearsprengkopf). */
export type Warhead = 'bullet' | 'cannon' | 'shell' | 'rocket' | 'missile' | 'flak' | 'bomb' | 'torpedo' | 'melee' | 'arrow' | 'nuke'
export type Category = 'structure' | 'defense' | 'infantry' | 'vehicle' | 'aircraft' | 'ship'
export type UnitRole = 'extractor' | 'crawler' | 'engineer' | 'medic' | 'transport' | 'maintenance'
export type BuildingRole = 'command' | 'power' | 'refinery' | 'barracks' | 'factory' | 'airfield' | 'shipyard' | 'radar' | 'tech' | 'defense' | 'repair' | 'civilian'

export interface Weapon {
  range: number
  damage: number
  reload: number
  warhead: Warhead
  targets: Domain[]
  /** Projektilgeschwindigkeit m/s (0 = sofortiger Treffer). */
  speed: number
  splash?: number
  minRange?: number
}

export interface UnitDef {
  kind: 'unit'
  id: string
  name: string
  category: 'infantry' | 'vehicle' | 'aircraft' | 'ship'
  domain: Domain
  cost: number
  buildTime: number
  hp: number
  armor: Armor
  speed: number
  turnRate: number
  sight: number
  /** Radar-Erfassungsreichweite in Metern gegen ein Ziel mit Signatur 1. 0 = kein Radar. */
  radar?: number
  /** Radarsignatur: wie leicht dieses Objekt selbst erfasst wird (1 = Panzergröße). */
  sig?: number
  size: number
  weapons: Weapon[]
  prereq: string[]
  factions?: FactionId[]
  role?: UnitRole
  cargo?: number
  ammo?: number
  /** Battery flight time and dock charging time, in game seconds. */
  endurance?: number
  recharge?: number
  description: string
}

export interface BuildingDef {
  kind: 'building'
  id: string
  name: string
  category: 'structure' | 'defense'
  cost: number
  buildTime: number
  hp: number
  armor: 'structure'
  size: number
  power: number
  sight: number
  /** Radar-Erfassungsreichweite in Metern gegen ein Ziel mit Signatur 1. 0 = kein Radar. */
  radar?: number
  /** Radarsignatur: Gebäude stehen fest und sind gut zu erfassen. */
  sig?: number
  weapons: Weapon[]
  prereq: string[]
  factions?: FactionId[]
  role: BuildingRole
  produces?: Category[]
  placement: 'land' | 'coast'
  description: string
}

export type Def = UnitDef | BuildingDef

export const FACTIONS: Record<FactionId, { name: string, motto: string, description: string }> = {
  aurora: {
    name: 'Aurora-Bündnis',
    motto: 'Schnell, präzise, überall.',
    description: 'Luftüberlegenheit und Raketenartillerie. Exklusiv: Abfangjäger, Raketenwerfer.',
  },
  meridian: {
    name: 'Meridian-Pakt',
    motto: 'Stahl bricht nicht.',
    description: 'Schwere Panzerverbände und U-Boote. Exklusiv: Schwerer Panzer, U-Boot.',
  },
  kestrel: {
    name: 'Kestrel-Syndikat',
    motto: 'Weit sehen, weit treffen.',
    description: 'Fernkampf und Marine. Exklusiv: Scharfschütze, Raketenflak, Kreuzer, Küstenbatterie.',
  },
}

/**
 * Schadensmultiplikator Gefechtskopf x Panzerung.
 * v2 (SPEC §11): Spalte `wood` (Holzbauten; Nahkampf 0.25, Granate 1.2, Kugel 0.1) und Zeilen `melee`, `arrow`, `nuke`
 * (Nuklear: alle Panzerungen 1.0, Bauwerke 1.5).
 */
export const DAMAGE_TABLE: Record<Warhead, Record<Armor, number>> = {
  bullet: { infantry: 1.0, light: 0.45, heavy: 0.2, air: 0.35, naval: 0.15, structure: 0.2, wood: 0.1 },
  cannon: { infantry: 0.6, light: 0.9, heavy: 0.5, air: 0.5, naval: 0.4, structure: 0.45, wood: 0.6 },
  shell: { infantry: 0.35, light: 0.9, heavy: 1.0, air: 0, naval: 0.7, structure: 0.8, wood: 1.2 },
  rocket: { infantry: 0.5, light: 0.8, heavy: 0.7, air: 0, naval: 0.6, structure: 1.0, wood: 1.2 },
  missile: { infantry: 0.3, light: 0.7, heavy: 0.6, air: 1.0, naval: 0.7, structure: 0.6, wood: 0.8 },
  flak: { infantry: 0.4, light: 0.3, heavy: 0.1, air: 1.0, naval: 0.1, structure: 0.1, wood: 0.15 },
  bomb: { infantry: 0.8, light: 0.9, heavy: 0.9, air: 0, naval: 0.8, structure: 1.2, wood: 1.5 },
  torpedo: { infantry: 0, light: 0, heavy: 0, air: 0, naval: 1.5, structure: 0.6, wood: 0.6 },
  melee: { infantry: 1.0, light: 0.1, heavy: 0.05, air: 0, naval: 0, structure: 0.1, wood: 0.25 },
  arrow: { infantry: 1.0, light: 0.15, heavy: 0.05, air: 0.1, naval: 0.05, structure: 0.05, wood: 0.15 },
  nuke: { infantry: 1.0, light: 1.0, heavy: 1.0, air: 1.0, naval: 1.0, structure: 1.5, wood: 1.5 },
}

const LAND_SEA: Domain[] = ['land', 'sea']
const LAND_ONLY: Domain[] = ['land']
const AIR_ONLY: Domain[] = ['air']
const LAND_AIR: Domain[] = ['land', 'air']
const SEA_ONLY: Domain[] = ['sea']

export const UNITS: UnitDef[] = [
  // ---- Robotik 2026: zivile Wartung und optische Aufklärung ----
  {
    kind: 'unit', id: 'service_robot', name: 'Serviceroboter', category: 'vehicle', domain: 'land',
    cost: 900, buildTime: 240, hp: 90, armor: 'light', speed: 6, turnRate: 360, sight: 450, size: 1.25,
    weapons: [], prereq: ['factory', 'civic_workshop', 'training_center'], role: 'maintenance', radar: 0, sig: .25,
    description: 'Humanoider Wartungsroboter. Sucht im Stand eigene beschädigte Gebäude und Bodenfahrzeuge im Umkreis von 120 m, läuft heran und repariert gegen Guthaben. Unbewaffnet; ersetzt keine Bewohner oder Fachkräfte.',
  },
  {
    kind: 'unit', id: 'robot_dog', name: 'Roboterhund', category: 'vehicle', domain: 'land',
    cost: 550, buildTime: 150, hp: 65, armor: 'light', speed: 8, turnRate: 360, sight: 900, size: .95,
    weapons: [], prereq: ['factory', 'school'], radar: 0, sig: .15,
    description: 'Vierbeiniger Inspektionsroboter mit Kameramast. Erkundet am Boden und deckt ausschließlich seine optische Umgebung auf. Klein, unbewaffnet und verwundbar.',
  },
  {
    kind: 'unit', id: 'recon_drone', name: 'Aufklärungsdrohne', category: 'aircraft', domain: 'air',
    cost: 700, buildTime: 180, hp: 55, armor: 'air', speed: 54, turnRate: 240, sight: 1600, size: 1.8,
    weapons: [], prereq: ['airfield', 'school'], radar: 0, sig: .18, endurance: 1800, recharge: 120,
    description: 'Elektrischer Quadrokopter mit Kamera. 30 Spielminuten Flugzeit; kehrt mit Rückflugreserve zum eigenen Flugfeld zurück und lädt dort bei Stromversorgung. Ohne erreichbares Flugfeld geht sie bei leerem Akku verloren. Keine Bewaffnung und kein Suchradar.',
  },
  // ---- Infanterie ----
  {
    kind: 'unit', id: 'rifleman', name: 'Schütze', category: 'infantry', domain: 'land',
    cost: 100, buildTime: 40, hp: 60, armor: 'infantry', speed: 6, turnRate: 360, sight: 900, size: 2,
    weapons: [{ range: 350, damage: 8, reload: 0.8, warhead: 'bullet', targets: LAND_ONLY, speed: 0 }],
    prereq: ['barracks'], description: 'Günstige Basisinfanterie mit Sturmgewehr.',
  },
  {
    kind: 'unit', id: 'rocketeer', name: 'Raketenschütze', category: 'infantry', domain: 'land',
    cost: 300, buildTime: 60, hp: 55, armor: 'infantry', speed: 5, turnRate: 360, sight: 1000, size: 2,
    weapons: [{ range: 600, damage: 45, reload: 3, warhead: 'missile', targets: LAND_AIR, speed: 250 }],
    prereq: ['barracks'], description: 'Panzerabwehr und Flugabwehr in einem, langsam nachladend.',
  },
  {
    kind: 'unit', id: 'engineer', name: 'Pionier', category: 'infantry', domain: 'land',
    cost: 400, buildTime: 60, hp: 40, armor: 'infantry', speed: 5, turnRate: 360, sight: 800, size: 2,
    weapons: [], prereq: ['barracks'], role: 'engineer',
    description: 'Übernimmt feindliche Gebäude beim Betreten. Wird dabei verbraucht.',
  },
  {
    kind: 'unit', id: 'medic', name: 'Sanitäter', category: 'infantry', domain: 'land',
    cost: 300, buildTime: 60, hp: 50, armor: 'infantry', speed: 5.5, turnRate: 360, sight: 800, size: 2,
    weapons: [], prereq: ['barracks'], role: 'medic',
    description: 'Heilt Infanterie in der Nähe.',
  },
  {
    kind: 'unit', id: 'sniper', name: 'Scharfschütze', category: 'infantry', domain: 'land',
    cost: 500, buildTime: 75, hp: 50, armor: 'infantry', speed: 5, turnRate: 360, sight: 1400, size: 2,
    weapons: [{ range: 1000, damage: 60, reload: 4, warhead: 'bullet', targets: LAND_ONLY, speed: 0 }],
    prereq: ['barracks', 'radar'], factions: ['kestrel'], description: 'Tödlich gegen Infanterie auf große Distanz.',
  },
  // ---- Fahrzeuge ----
  {
    kind: 'unit', id: 'scout', name: 'Späher', category: 'vehicle', domain: 'land',
    cost: 500, buildTime: 180, hp: 120, armor: 'light', speed: 95, turnRate: 180, sight: 1600, size: 4,
    weapons: [{ range: 450, damage: 10, reload: 0.5, warhead: 'cannon', targets: LAND_ONLY, speed: 0 }],
    prereq: ['factory'], description: 'Schnelles Aufklärungsfahrzeug mit Maschinenkanone.',
  },
  {
    kind: 'unit', id: 'extractor', name: 'Förderfahrzeug', category: 'vehicle', domain: 'land',
    cost: 1400, buildTime: 480, hp: 400, armor: 'heavy', speed: 45, turnRate: 90, sight: 700, size: 6,
    weapons: [], prereq: ['refinery', 'factory'], role: 'extractor',
    description: 'Baut Rohstoffe an Lagerstätten ab und liefert sie zur Aufbereitungsanlage.',
  },
  {
    kind: 'unit', id: 'crawler', name: 'Bauraupe', category: 'vehicle', domain: 'land',
    cost: 5000, buildTime: 1800, hp: 800, armor: 'heavy', speed: 30, turnRate: 60, sight: 900, size: 8,
    weapons: [], prereq: ['factory'], role: 'crawler',
    description: 'Entfaltet sich zu einer neuen Kommandozentrale. Braucht nur eine Fabrik – wer seine Zentrale verliert, aber noch eine Fabrik hat, kann zurückkommen.',
  },
  {
    kind: 'unit', id: 'lighttank', name: 'Leichter Panzer', category: 'vehicle', domain: 'land',
    cost: 900, buildTime: 360, hp: 300, armor: 'light', speed: 75, turnRate: 150, sight: 1100, size: 5,
    weapons: [{ range: 700, damage: 45, reload: 2.5, warhead: 'shell', targets: LAND_SEA, speed: 600 }],
    prereq: ['factory'], description: 'Wendiger Panzer für schnelle Vorstöße.',
  },
  {
    kind: 'unit', id: 'mbt', name: 'Kampfpanzer', category: 'vehicle', domain: 'land',
    cost: 1500, buildTime: 600, hp: 520, armor: 'heavy', speed: 60, turnRate: 120, sight: 1100, size: 6,
    weapons: [{ range: 800, damage: 70, reload: 3, warhead: 'shell', targets: LAND_SEA, speed: 700 }],
    prereq: ['factory'], description: 'Rückgrat jeder Panzerarmee.',
  },
  {
    kind: 'unit', id: 'heavytank', name: 'Schwerer Panzer', category: 'vehicle', domain: 'land',
    cost: 2300, buildTime: 900, hp: 850, armor: 'heavy', speed: 45, turnRate: 90, sight: 1100, size: 7,
    weapons: [{ range: 850, damage: 115, reload: 3.5, warhead: 'shell', targets: LAND_SEA, speed: 700 }],
    prereq: ['factory', 'tech'], factions: ['meridian'], description: 'Doppelrohr-Koloss mit dicker Panzerung.',
  },
  {
    kind: 'unit', id: 'artillery', name: 'Artillerie', category: 'vehicle', domain: 'land',
    cost: 1400, buildTime: 600, hp: 200, armor: 'light', speed: 50, turnRate: 90, sight: 1000, size: 6,
    weapons: [{ range: 2600, minRange: 300, damage: 130, reload: 6, warhead: 'shell', targets: LAND_SEA, speed: 300, splash: 40 }],
    prereq: ['factory', 'radar'], description: 'Weitreichende Haubitze, verwundbar im Nahkampf.',
  },
  {
    kind: 'unit', id: 'mlrs', name: 'Raketenwerfer', category: 'vehicle', domain: 'land',
    cost: 1600, buildTime: 660, hp: 220, armor: 'light', speed: 55, turnRate: 90, sight: 1000, size: 6,
    weapons: [{ range: 2300, minRange: 250, damage: 150, reload: 8, warhead: 'rocket', targets: LAND_SEA, speed: 250, splash: 70 }],
    prereq: ['factory', 'radar'], factions: ['aurora'], description: 'Salvenwerfer mit großem Wirkungsradius.',
  },
  {
    kind: 'unit', id: 'aa', name: 'Flakpanzer', category: 'vehicle', domain: 'land',
    cost: 1000, buildTime: 420, hp: 250, armor: 'light', speed: 65, turnRate: 150, sight: 1600, size: 5,
    weapons: [{ range: 1300, damage: 30, reload: 0.9, warhead: 'flak', targets: AIR_ONLY, speed: 0 }],
    prereq: ['factory'], description: 'Mobile Flugabwehr mit Zwillingskanone.',
  },
  {
    kind: 'unit', id: 'samtruck', name: 'Raketenflak', category: 'vehicle', domain: 'land',
    cost: 1300, buildTime: 480, hp: 250, armor: 'light', speed: 60, turnRate: 120, sight: 2200, size: 6,
    weapons: [{ range: 2600, damage: 85, reload: 4, warhead: 'missile', targets: AIR_ONLY, speed: 400 }],
    prereq: ['factory', 'radar'], factions: ['kestrel'], description: 'Weitreichende Flugabwehrraketen.',
  },
  {
    kind: 'unit', id: 'apc', name: 'Transportpanzer', category: 'vehicle', domain: 'land',
    cost: 900, buildTime: 300, hp: 350, armor: 'heavy', speed: 70, turnRate: 150, sight: 1000, size: 5,
    weapons: [{ range: 400, damage: 8, reload: 0.5, warhead: 'bullet', targets: LAND_ONLY, speed: 0 }],
    prereq: ['factory'], role: 'transport', cargo: 5, description: 'Befördert bis zu 5 Infanteristen.',
  },
  // ---- Luftfahrzeuge ----
  {
    kind: 'unit', id: 'gunship', name: 'Kampfhubschrauber', category: 'aircraft', domain: 'air',
    cost: 1500, buildTime: 600, hp: 250, armor: 'air', speed: 250, turnRate: 120, sight: 1800, size: 6,
    weapons: [{ range: 900, damage: 30, reload: 1.2, warhead: 'rocket', targets: LAND_SEA, speed: 300 }],
    prereq: ['airfield'], ammo: 16, description: 'Raketenhubschrauber; muss am Flugfeld nachladen.',
  },
  {
    kind: 'unit', id: 'jet', name: 'Jagdbomber', category: 'aircraft', domain: 'air',
    cost: 2200, buildTime: 900, hp: 200, armor: 'air', speed: 900, turnRate: 90, sight: 2500, size: 7,
    weapons: [{ range: 400, damage: 260, reload: 1, warhead: 'bomb', targets: LAND_SEA, speed: 150, splash: 60 }],
    prereq: ['airfield', 'radar'], ammo: 2, description: 'Schneller Bomber mit zwei Bomben pro Einsatz.',
  },
  {
    kind: 'unit', id: 'interceptor', name: 'Abfangjäger', category: 'aircraft', domain: 'air',
    cost: 2000, buildTime: 840, hp: 180, armor: 'air', speed: 1100, turnRate: 100, sight: 3000, size: 7,
    weapons: [{ range: 1600, damage: 120, reload: 1.5, warhead: 'missile', targets: AIR_ONLY, speed: 700 }],
    prereq: ['airfield', 'radar'], factions: ['aurora'], ammo: 4, description: 'Jagt feindliche Luftfahrzeuge.',
  },
  {
    kind: 'unit', id: 'cargoheli', name: 'Transporthubschrauber', category: 'aircraft', domain: 'air',
    cost: 1600, buildTime: 600, hp: 300, armor: 'air', speed: 220, turnRate: 120, sight: 1500, size: 7,
    weapons: [], prereq: ['airfield'], role: 'transport', cargo: 6,
    description: 'Befördert 6 Bodeneinheiten (keine Panzer) über jedes Gelände.',
  },
  // ---- Schiffe ----
  {
    kind: 'unit', id: 'patrol', name: 'Patrouillenboot', category: 'ship', domain: 'sea',
    cost: 1000, buildTime: 480, hp: 300, armor: 'naval', speed: 75, turnRate: 90, sight: 1800, size: 8,
    weapons: [
      { range: 800, damage: 15, reload: 0.7, warhead: 'cannon', targets: LAND_SEA, speed: 0 },
      { range: 1000, damage: 20, reload: 1, warhead: 'flak', targets: AIR_ONLY, speed: 0 },
    ],
    prereq: ['shipyard'], description: 'Schnelles Küstenboot mit Bordkanone und Flak.',
  },
  {
    kind: 'unit', id: 'destroyer', name: 'Zerstörer', category: 'ship', domain: 'sea',
    cost: 2500, buildTime: 1200, hp: 900, armor: 'naval', speed: 60, turnRate: 45, sight: 2500, size: 14,
    weapons: [
      { range: 1600, damage: 85, reload: 3, warhead: 'shell', targets: LAND_SEA, speed: 700 },
      { range: 2200, damage: 75, reload: 3, warhead: 'missile', targets: AIR_ONLY, speed: 500 },
    ],
    prereq: ['shipyard', 'radar'], description: 'Vielseitiges Kriegsschiff mit Geschütz und Flugabwehrraketen.',
  },
  {
    kind: 'unit', id: 'submarine', name: 'U-Boot', category: 'ship', domain: 'sea',
    cost: 2000, buildTime: 1080, hp: 500, armor: 'naval', speed: 40, turnRate: 45, sight: 1500, size: 12,
    weapons: [{ range: 1500, damage: 260, reload: 8, warhead: 'torpedo', targets: SEA_ONLY, speed: 40 }],
    prereq: ['shipyard', 'tech'], factions: ['meridian'], description: 'Torpedos gegen Schiffe; kaum sichtbar.',
  },
  {
    kind: 'unit', id: 'cruiser', name: 'Kreuzer', category: 'ship', domain: 'sea',
    cost: 4000, buildTime: 1800, hp: 1500, armor: 'naval', speed: 55, turnRate: 30, sight: 3000, size: 20,
    weapons: [{ range: 6000, minRange: 500, damage: 320, reload: 10, warhead: 'shell', targets: LAND_SEA, speed: 400, splash: 90 }],
    prereq: ['shipyard', 'tech'], factions: ['kestrel'], description: 'Schwere Schiffsartillerie für Küstenbeschuss.',
  },
  {
    kind: 'unit', id: 'landingship', name: 'Landungsschiff', category: 'ship', domain: 'sea',
    cost: 1500, buildTime: 720, hp: 700, armor: 'naval', speed: 45, turnRate: 45, sight: 1500, size: 14,
    weapons: [], prereq: ['shipyard'], role: 'transport', cargo: 8,
    description: 'Befördert 8 Bodeneinheiten über See; entlädt an Küsten.',
  },
]

export const BUILDINGS: BuildingDef[] = [
  ...CIVIC_BUILDINGS,
  {
    kind: 'building', id: 'command', name: 'Kommandozentrale', category: 'structure', role: 'command',
    cost: 5000, buildTime: 0, hp: 2200, armor: 'structure', size: 60, power: 0, sight: 2500, weapons: [],
    prereq: [], produces: ['structure', 'defense'], placement: 'land',
    description: 'Herz der Basis; errichtet Gebäude und Verteidigungsanlagen. Entsteht aus einer Bauraupe.',
  },
  {
    kind: 'building', id: 'power', name: 'Kraftwerk', category: 'structure', role: 'power',
    cost: 1200, buildTime: 420, hp: 700, armor: 'structure', size: 40, power: 100, sight: 700, weapons: [],
    prereq: ['command'], placement: 'land', description: 'Liefert 100 Einheiten Energie.',
  },
  {
    kind: 'building', id: 'refinery', name: 'Aufbereitungsanlage', category: 'structure', role: 'refinery',
    cost: 2500, buildTime: 720, hp: 1000, armor: 'structure', size: 60, power: -30, sight: 800, weapons: [],
    prereq: ['power'], placement: 'land', description: 'Nimmt Rohstoffe an; wird mit einem Förderfahrzeug geliefert.',
  },
  {
    kind: 'building', id: 'barracks', name: 'Kaserne', category: 'structure', role: 'barracks',
    cost: 900, buildTime: 360, hp: 800, armor: 'structure', size: 35, power: -10, sight: 800, weapons: [],
    prereq: ['power'], produces: ['infantry'], placement: 'land', description: 'Bildet Infanterie aus.',
  },
  {
    kind: 'building', id: 'factory', name: 'Fahrzeugwerk', category: 'structure', role: 'factory',
    cost: 3000, buildTime: 900, hp: 1200, armor: 'structure', size: 70, power: -40, sight: 800, weapons: [],
    prereq: ['refinery'], produces: ['vehicle'], placement: 'land', description: 'Fertigt Fahrzeuge und Panzer.',
  },
  {
    kind: 'building', id: 'workshop', name: 'Werkstatt', category: 'structure', role: 'repair',
    cost: 1200, buildTime: 300, hp: 800, armor: 'structure', size: 22, power: -20, sight: 900, weapons: [],
    prereq: ['factory'], placement: 'land',
    description: 'Setzt beschädigte Fahrzeuge wieder instand. Ein Fahrzeug mit dem Befehl „zurück" fährt von selbst hierher; alles Beschädigte im Umkreis von 300 m wird repariert, solange Geld da ist.',
  },

  {
    kind: 'building', id: 'radar', name: 'Funkturm', category: 'structure', role: 'radar',
    cost: 1500, buildTime: 600, hp: 700, armor: 'structure', size: 30, power: -40, sight: 2_000, weapons: [],
    prereq: ['refinery'], placement: 'land',
    description: 'Radar mit 25 km Grundreichweite: erfasst Flugzeuge auf 45 km, Fahrzeuge auf 25 km, Infanterie auf 7,5 km. Radar meldet Ort und Klasse, nicht die Kennung – wer wissen will, was dort steht, muss hinsehen. Schaltet Fortgeschrittenes frei.',
  },
  {
    kind: 'building', id: 'airfield', name: 'Flugfeld', category: 'structure', role: 'airfield',
    cost: 2500, buildTime: 900, hp: 900, armor: 'structure', size: 90, power: -40, sight: 1000, weapons: [],
    prereq: ['radar'], produces: ['aircraft'], placement: 'land', description: 'Baut, bewaffnet und wartet Luftfahrzeuge.',
  },
  {
    kind: 'building', id: 'shipyard', name: 'Werft', category: 'structure', role: 'shipyard',
    cost: 3000, buildTime: 900, hp: 1200, armor: 'structure', size: 80, power: -40, sight: 1200, weapons: [],
    prereq: ['refinery'], produces: ['ship'], placement: 'coast', description: 'Baut Schiffe; muss an der Küste stehen.',
  },
  {
    kind: 'building', id: 'tech', name: 'Forschungszentrum', category: 'structure', role: 'tech',
    cost: 4000, buildTime: 1200, hp: 900, armor: 'structure', size: 50, power: -60, sight: 800, weapons: [],
    prereq: ['radar', 'factory'], placement: 'land', description: 'Schaltet schwere Einheiten frei.',
  },
  // ---- Verteidigung ----
  {
    kind: 'building', id: 'bunker', name: 'Bunker', category: 'defense', role: 'defense',
    cost: 600, buildTime: 240, hp: 900, armor: 'structure', size: 15, power: 0, sight: 900,
    weapons: [{ range: 500, damage: 10, reload: 0.4, warhead: 'bullet', targets: LAND_ONLY, speed: 0 }],
    prereq: ['barracks'], placement: 'land', description: 'MG-Stellung gegen Infanterie.',
  },
  {
    kind: 'building', id: 'turret', name: 'Geschützturm', category: 'defense', role: 'defense',
    cost: 800, buildTime: 300, hp: 600, armor: 'structure', size: 15, power: -10, sight: 1100,
    weapons: [{ range: 950, damage: 65, reload: 2.5, warhead: 'shell', targets: LAND_SEA, speed: 700 }],
    prereq: ['barracks'], placement: 'land', description: 'Panzerabwehrgeschütz.',
  },
  {
    kind: 'building', id: 'aagun', name: 'Flakstellung', category: 'defense', role: 'defense',
    cost: 1000, buildTime: 300, hp: 500, armor: 'structure', size: 15, power: -15, sight: 1800,
    weapons: [{ range: 1600, damage: 35, reload: 0.8, warhead: 'flak', targets: AIR_ONLY, speed: 0 }],
    prereq: ['barracks'], placement: 'land', description: 'Flugabwehrkanone.',
  },
  {
    kind: 'building', id: 'sam', name: 'Raketenstellung', category: 'defense', role: 'defense',
    cost: 1500, buildTime: 480, hp: 600, armor: 'structure', size: 20, power: -25, sight: 3500,
    weapons: [{ range: 3200, damage: 95, reload: 3, warhead: 'missile', targets: AIR_ONLY, speed: 500 }],
    prereq: ['radar'], placement: 'land', description: 'Weitreichende Flugabwehrraketen.',
  },
  {
    kind: 'building', id: 'coastal', name: 'Küstenbatterie', category: 'defense', role: 'defense',
    cost: 2000, buildTime: 600, hp: 800, armor: 'structure', size: 25, power: -20, sight: 4500,
    weapons: [{ range: 4200, minRange: 300, damage: 210, reload: 6, warhead: 'shell', targets: LAND_SEA, speed: 500, splash: 50 }],
    prereq: ['tech'], factions: ['kestrel'], placement: 'coast', description: 'Schwere Küstengeschütze gegen Schiffe.',
  },
]

// ---- v2: Avatar und Person (SPEC §6, §10) als UnitDef-förmige Konstanten ----

/**
 * Der Avatar des Spielers: hp 100, Infanteriepanzerung, 6 km/h, Sicht 400 m, Größe 1.5, Nahkampf 4 dmg / 1 s / 2 m.
 * Inventar (30 Plätze), Arbeitsrate (2.5 LP/s) und Regeneration stehen in shared/pacing.ts.
 */
export const AVATAR_DEF: UnitDef = {
  kind: 'unit', id: 'avatar', name: 'Avatar', category: 'infantry', domain: 'land',
  cost: 0, buildTime: 0, hp: 100, armor: 'infantry', speed: 6, turnRate: 360, sight: 400, size: 1.5,
  weapons: [{ range: 2, damage: 4, reload: 1, warhead: 'melee', targets: LAND_ONLY, speed: 0 }],
  prereq: [], description: 'Dein Mensch auf der Weltkarte. Sammelt, baut, entwirft; kehrt nach dem Tod mit Wissen und Bauplänen zurück.',
}

/**
 * Eine Person (Bewohner, Bauplan `worker`): hp 40, Infanteriepanzerung, 5 km/h, Sicht 300 m, Größe 1.2, unbewaffnet;
 * trägt 10 Einheiten und arbeitet mit 1 LP/s (shared/pacing.ts).
 */
export const PERSON_DEF: UnitDef = {
  kind: 'unit', id: 'worker', name: 'Bewohner', category: 'infantry', domain: 'land',
  cost: 0, buildTime: 0, hp: 40, armor: 'infantry', speed: 5, turnRate: 360, sight: 300, size: 1.2,
  weapons: [], prereq: [], description: 'Bewohner einer Siedlung; wird für Außenarbeit (Sammeln, Bauen, Jagen) materialisiert.',
}


/**
 * Landungsflugzeug. Bringt einen neuen Kommandanten samt Starttruppe an seinen
 * Startpunkt, wirft sie ab und fliegt weiter. Nicht baubar, nicht steuerbar;
 * die Simulation führt es selbst (server/sim/units.ts, Zustände inbound/outbound).
 * Wegen der großen Signatur ist es weithin auf dem Radar zu sehen – eine Landung
 * bleibt nicht unbemerkt, und genau das ist beabsichtigt.
 */
export const DROPSHIP_DEF: UnitDef = {
  kind: 'unit', id: 'dropship', name: 'Landungsflugzeug', category: 'aircraft', domain: 'air',
  cost: 0, buildTime: 0, hp: 400, armor: 'air', speed: 520, turnRate: 60, sight: 3000, size: 9,
  radar: 2000, sig: 2.2,
  weapons: [], prereq: [], cargo: 12, role: 'transport',
  description: 'Setzt einen neuen Kommandanten mit seiner Starttruppe ab und verlässt das Gebiet.',
}

/** Systemeinheiten ohne Produktionsweg (nie über availableFor baubar). */
export const SYSTEM_UNITS: readonly UnitDef[] = [AVATAR_DEF, PERSON_DEF, DROPSHIP_DEF]

export const DEFS: Record<string, Def> = Object.fromEntries([...UNITS, ...BUILDINGS, ...SYSTEM_UNITS].map(d => [d.id, d]))

export function getDef(id: string): Def {
  const def = DEFS[id]
  if (!def) throw new Error(`unbekannter Typ: ${id}`)
  return def
}

export function isUnitDef(def: Def): def is UnitDef { return def.kind === 'unit' }
export function isBuildingDef(def: Def): def is BuildingDef { return def.kind === 'building' }

export const CATEGORIES: { id: Category, name: string }[] = [
  { id: 'structure', name: 'Gebäude' },
  { id: 'defense', name: 'Verteidigung' },
  { id: 'infantry', name: 'Infanterie' },
  { id: 'vehicle', name: 'Fahrzeuge' },
  { id: 'aircraft', name: 'Luft' },
  { id: 'ship', name: 'Marine' },
]

/** Welche Gebäuderolle eine Kategorie produziert. */
export const PRODUCER_ROLE: Record<Category, BuildingRole> = {
  structure: 'command',
  defense: 'command',
  infantry: 'barracks',
  vehicle: 'factory',
  aircraft: 'airfield',
  ship: 'shipyard',
}

export function availableFor(faction: FactionId, ownedBuildings: Set<string>): Def[] {
  return [...BUILDINGS, ...UNITS].filter(def => {
    if (def.kind === 'building' && def.role === 'command') return false
    if (def.factions && !def.factions.includes(faction)) return false
    return def.prereq.every(p => ownedBuildings.has(p))
  })
}

/** Einheiten, die ein Spieler bei Spielbeginn erhält (neben der Bauraupe). */
export const STARTING_UNITS: string[] = ['crawler', 'extractor', 'lighttank', 'lighttank', 'rifleman', 'rifleman', 'rifleman', 'engineer']

export const PLAYER_COLORS = [
  '#ff5a36', '#3b8bff', '#3ecf5a', '#f5c518', '#c94cff', '#ff7ad9', '#00c8d6', '#ff9e2c',
  '#8dd63c', '#ff4d7e', '#7a8cff', '#d6b46b', '#63e6be', '#e35a9a', '#b8c5d6', '#a3e635',
]

// ---------------------------------------------------------------------------
// Aufklärung: Sicht und Radar sind zwei getrennte Kanäle
// ---------------------------------------------------------------------------
//
// SICHT (`sight`) ist optisch: sie zeigt ein Objekt vollständig – Typ, Zustand,
// Besitzer. Sie reicht nicht weit und endet abrupt.
//
// RADAR ist eine eigene Reichweite. Es liefert nur einen Kontakt: Ort, grobe
// Klasse, Kennung wenn erkannt. Ob ein Objekt erfasst wird, hängt von ZWEI
// Werten ab – der Reichweite des Suchers und der Signatur des Ziels:
//
//     erfasst, wenn  Abstand ≤ radarRange(sucher) × radarSignature(ziel)
//
// Damit sieht dieselbe Radarstation ein Flugzeug viel weiter als einen Soldaten,
// ohne dass man für jede Paarung eine Zahl pflegen muss.

/** Ein Flugzeug am Himmel sieht man auch ohne Radar weiter als etwas am Boden. */
export const AIR_SIGHT_FACTOR = 2.6

/** Radarreichweiten in Metern gegen ein Ziel mit Signatur 1 (Panzergröße). */
const RADAR_RANGE: Record<string, number> = {
  // Gebäude
  radar: 25_000,        // die Radarstation ist der Grund, sie zu bauen
  command: 8_000,       // Kommandozentrale mit Rundsuchradar
  airfield: 6_000,      // Flugleitung
  shipyard: 5_000,
  sam: 9_000,           // Flugabwehr braucht Vorwarnzeit
  aagun: 4_000,
  coastal: 9_000,       // Küstenbatterie sucht weit über See
  // Einheiten
  interceptor: 7_000,
  jet: 5_000,
  gunship: 4_000,
  cargoheli: 2_500,
  aa: 6_000,            // Flakpanzer
  samtruck: 9_000,      // mobile Flugabwehr, deshalb dieselbe Vorwarnzeit
  scout: 3_500,         // Späher mit leichtem Suchradar
  patrol: 6_000,
  destroyer: 10_000,
  cruiser: 14_000,
  landingship: 3_000,
  submarine: 4_000,
}

/**
 * Radarsignatur. 1 = Kampfpanzer. Alles darüber wird früher erfasst,
 * alles darunter später. Ein U-Boot ist praktisch unsichtbar, solange es taucht.
 */
const RADAR_SIGNATURE: Record<string, number> = {
  submarine: 0.08,
  rifleman: 0.3, rocketeer: 0.3, sniper: 0.28, engineer: 0.3, medic: 0.3,
  scout: 0.7,
  extractor: 0.9, crawler: 1.2,
}

/** Voreinstellungen nach Art des Objekts, wenn oben nichts eingetragen ist. */
export function radarRange(def: Def): number {
  const explicit = def.radar
  if (explicit !== undefined) return explicit
  const listed = RADAR_RANGE[def.id]
  if (listed !== undefined) return listed
  if (def.kind === 'building') return def.role === 'defense' ? 2_000 : 0
  return 0
}

export function radarSignature(def: Def): number {
  const explicit = def.sig
  if (explicit !== undefined) return explicit
  const listed = RADAR_SIGNATURE[def.id]
  if (listed !== undefined) return listed
  if (def.kind === 'building') return 1.6            // steht fest, große Rückstrahlfläche
  switch (def.category) {
    case 'aircraft': return 1.8                       // hoch am Himmel, kein Bodenecho
    case 'ship': return 1.4
    case 'infantry': return 0.3
    default: return 1                                  // Fahrzeuge sind die Bezugsgröße
  }
}

/** Grobe Klasse eines Radarkontakts – mehr verrät ein Blip nicht. */
export function contactClass(def: Def): 'a' | 'g' | 'n' {
  if (def.kind === 'building') return 'g'
  return def.domain === 'air' ? 'a' : def.domain === 'sea' ? 'n' : 'g'
}

/**
 * Auf welche Entfernung erfasst `observer` das Ziel `target`?
 * Liefert 0, wenn der Beobachter kein Radar hat.
 */
export function detectionRange(observer: Def, target: Def): number {
  const r = radarRange(observer)
  return r === 0 ? 0 : r * radarSignature(target)
}

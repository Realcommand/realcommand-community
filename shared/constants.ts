/** Weltweite Konstanten (Server und Client). Alle Längen in Metern, Zeiten in Sekunden. */

/** Erdumfang am Äquator: Breite der flachen Weltkarte. */
export const WORLD_W = 40_075_016.686
/** Höhe der flachen Weltkarte (Plate Carrée: halbe Breite). */
export const WORLD_H = WORLD_W / 2

/** Feines Gitter: 0,05° pro Zelle. */
export const GRID_W = 7200
export const GRID_H = 3600
export const CELL = WORLD_W / GRID_W // ≈ 5566 m

/** Grobes Gitter für Fernrouten und räumliche Suche: 0,5° pro Zelle (10 x 10 feine Zellen). */
export const COARSE_FACTOR = 10
export const COARSE_W = GRID_W / COARSE_FACTOR // 720
export const COARSE_H = GRID_H / COARSE_FACTOR // 360
export const COARSE_CELL = CELL * COARSE_FACTOR // ≈ 55,7 km

/**
 * Feiner räumlicher Index (v2, SPEC §12): 500-m-Zellen, Schlüssel `fy × FINE_W + fx`;
 * `queryRadius` nutzt ihn für Radien ≤ FINE_QUERY_MAX_R.
 */
export const FINE_CELL = 500
export const FINE_W = Math.ceil(WORLD_W / FINE_CELL) // 80 151
export const FINE_H = Math.ceil(WORLD_H / FINE_CELL) // 40 076
export const FINE_QUERY_MAX_R = 5_000

/** Simulationstakt und Netzwerk-Takt. */
export const TICK_MS = 100
export const NET_MS = 200
export const SAVE_MS = 30_000

export const DEFAULT_PORT = 8080

/** Spielregeln (v1; die v2-Regeln stehen in shared/pacing.ts). */
export const BUILD_RADIUS = 2_500 // m um eigene Gebäude, in denen gebaut werden darf
export const SPAWN_MIN_DISTANCE = 60_000 // m Mindestabstand zwischen Kommandozentralen neuer Spieler (v1)
/**
 * Landeschutz: So lange (Spielsekunden) nach der Landung nimmt ein Spieler
 * keinen Schaden von anderen Spielern. Der Mindestabstand allein schützt
 * niemanden – bei hohem Zeitfaktor sind 60 km in Sekunden überwunden, und wer
 * gerade erst abgesetzt wurde, hat weder Kraftwerk noch Geschützturm. 900 s
 * reichen für Entfalten (45 s) und den ersten Turm (300 s).
 *
 * Der Schutz endet vorzeitig, sobald der Geschützte selbst auf einen fremden
 * Spieler feuert. Ein Schild ist keine Waffe.
 */
export const LANDING_PROTECTION = 900
/** v2: Startplätze liegen ≥ 20 km von fremden Siedlungen entfernt (SPEC §13 /spawn-spots). */
export const SPAWN_MIN_DISTANCE_V2 = 20_000
/** v2: Bauen und Abliefern aus dem Inventar nur ≤ 60 m um den Avatar (Wert aus shared/pacing.ts). */
export { AVATAR_BUILD_RADIUS } from './pacing.ts'
export const START_FUNDS = 12_000
export const MAX_UNITS_PER_PLAYER = 200
/** Wartende Aufträge je Produktionslinie neben dem laufenden. */
export const PRODUCTION_QUEUE_LIMIT = 6
export const MAX_BUILDINGS_PER_PLAYER = 80
export const BASE_INCOME_PER_CC = 1.5 // Grundeinkommen pro Kommandozentrale und Sekunde
export const SELL_REFUND = 0.5
export const REPAIR_COST_FACTOR = 0.3 // Anteil der Baukosten für volle Reparatur
export const REPAIR_RATE = 0.02 // Anteil max. Trefferpunkte pro Sekunde
/** Fahrzeugreparatur in der Werkstatt: schneller als am Gebäude, es steht ja dafür da. */
export const VEHICLE_REPAIR_RATE = 0.06
/** Umkreis, in dem eine Werkstatt arbeitet. */
export const WORKSHOP_RADIUS = 300
export const LOW_POWER_FACTOR = 0.5 // Produktionsgeschwindigkeit bei Strommangel
export const DEPOSIT_COUNT = 24_000
export const DEPOSIT_REGEN_PER_S = 0.4
export const EXTRACTOR_CAPACITY = 1_000 // Kreditwert einer vollen Ladung
export const EXTRACTOR_RATE = 25 // Kreditwert pro Sekunde beim Abbau
export const HARVEST_SEARCH_RADIUS = 60_000
export const DEPLOY_TIME = 45 // s: Bauraupe -> Kommandozentrale

/** Version 3 separates finished buildings from active production. */
export const PROTOCOL_VERSION = 3
/** Speicherstand-Version von serialize()/restore() (SPEC §3). */
export const SAVE_VERSION = 2

/**
 * Die öffentliche Ablage mit Oberfläche, API-Beschreibung und Agenten. Die
 * Tafel „API & KI“ nennt sie, weil `agents/mcp-server.mjs` sonst ein Pfad
 * wäre, den niemand hat.
 */
export const COMMUNITY_REPO_URL = 'https://github.com/Realcommand/realcommand-community'

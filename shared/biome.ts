/**
 * Biome und Wald: deterministische Funktionen über Weltkoordinaten, identisch auf Server und Client.
 * Der Client rendert damit das Gelände, der Server erzeugt daraus Ressourcen (Wald, Ackerland).
 */
import { WORLD_H } from './constants.ts'
import { clamp, makeRng, valueNoise } from './math.ts'

const NOISE = 256

/** Periodische, weiche Rauschtabelle (Summe bilinear interpolierter Zufallsgitter). */
export function makeNoiseTable(seed: number, octaves: number[]): Float32Array {
  const table = new Float32Array(NOISE * NOISE)
  const rng = makeRng(seed)
  let total = 0
  octaves.forEach((freq, o) => {
    const amp = 1 / (o + 1)
    total += amp
    const lattice = new Float32Array(freq * freq)
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng()
    for (let y = 0; y < NOISE; y++) {
      const fy = y / NOISE * freq, y0 = Math.floor(fy), ty = fy - y0
      const sy = ty * ty * (3 - 2 * ty)
      const y1 = (y0 + 1) % freq
      for (let x = 0; x < NOISE; x++) {
        const fx = x / NOISE * freq, x0 = Math.floor(fx), tx = fx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const x1 = (x0 + 1) % freq
        const a = lattice[y0 * freq + x0], b = lattice[y0 * freq + x1], c = lattice[y1 * freq + x0], d = lattice[y1 * freq + x1]
        table[y * NOISE + x] += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * amp
      }
    }
  })
  for (let i = 0; i < table.length; i++) table[i] /= total
  return table
}

/** Bilinear interpolierter Tabellenwert an (u, v) in Tabelleneinheiten, periodisch. */
export function tableNoise(table: Float32Array, u: number, v: number): number {
  const x = u - Math.floor(u / NOISE) * NOISE, y = v - Math.floor(v / NOISE) * NOISE
  const x0 = x | 0, y0 = y | 0
  const tx = x - x0, ty = y - y0
  const x1 = (x0 + 1) & (NOISE - 1), y1 = (y0 + 1) & (NOISE - 1)
  const a = table[y0 * NOISE + x0], b = table[y0 * NOISE + x1], c = table[y1 * NOISE + x0], d = table[y1 * NOISE + x1]
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
}

let noiseLarge: Float32Array | undefined
let noiseMid: Float32Array | undefined
function tables() {
  if (!noiseLarge) { noiseLarge = makeNoiseTable(7, [4, 8, 16]); noiseMid = makeNoiseTable(11, [4, 8, 16, 32]) }
  return { noiseLarge: noiseLarge!, noiseMid: noiseMid! }
}

export interface Biome {
  /** Breitengrad-basierte Anteile 0..1 */
  polar: number
  desert: number
  tropic: number
  /** Großräumiges (900 km) und mittleres (40 km) Rauschen 0..1 */
  n1: number
  n2: number
  /** Waldfeld 0..1 und Schwelle; Wald, wenn forest > forestThreshold */
  forest: number
  forestThreshold: number
  /** Walddichte 0..1 (0 = kein Wald) */
  forestDensity: number
  /** Eignung für Ackerbau 0..1 (gemäßigt, feucht, kein Wald) */
  arable: number
  /** Feuchte 0..1 (Ton, Beeren, Ackerland) */
  moisture: number
  /** Felsfeld 0..1 (Steinaufschlüsse, Erztaschen) */
  rockField: number
}

/** Biom an einer Weltkoordinate (nur für Landpunkte sinnvoll). */
export function biomeAt(wx: number, wy: number): Biome {
  const { noiseLarge, noiseMid } = tables()
  const lat = 90 - wy / WORLD_H * 180
  const absLat = Math.abs(lat)
  const polar = clamp((absLat - 58) / 14, 0, 1)
  const desertLat = clamp(1 - Math.abs(absLat - 24) / 10, 0, 1)
  const tropicLat = clamp(1 - absLat / 22, 0, 1)
  const n1 = tableNoise(noiseLarge, wx / 900_000 * 32, wy / 900_000 * 32)
  const n2 = tableNoise(noiseMid, wx / 40_000 * 32, wy / 40_000 * 32)
  const desert = desertLat * clamp((n1 - 0.35) * 2.5, 0, 1)
  const tropic = tropicLat * (1 - desert)
  const forest = valueNoise(wx / 160, wy / 160, 121) * 0.55 + valueNoise(wx / 45, wy / 45, 123) * 0.45
  const forestThreshold = 0.56 + desert * 0.3 + polar * 0.4
  const forestDensity = forest > forestThreshold ? clamp((forest - forestThreshold) * 4, 0.15, 0.95) : 0
  const moisture = valueNoise(wx / 300, wy / 300, 101) * 0.6 + valueNoise(wx / 110, wy / 110, 103) * 0.4
  const arable = clamp((1 - polar) * (1 - desert) * (0.5 + moisture * 0.7) * (forestDensity > 0 ? 0.3 : 1), 0, 1)
  const rockField = valueNoise(wx / 70, wy / 70, 131)
  return { polar, desert, tropic, n1, n2, forest, forestThreshold, forestDensity, arable, moisture, rockField }
}

/**
 * Baumkrone an einer Position (Zellrauschen), 0 = kein Baum, sonst Beleuchtungsfaktor 0..1. Identisch mit der Darstellung.
 * `cut` 0..1 ist der Abholzungsgrad des Patches (Server: 1 − remaining/cap): eine 9-m-Zelle trägt einen Baum,
 * wenn hash2(ix, iy, 41) ≤ density × (1 − cut). So dünnen Server und Client den Wald deterministisch gleich aus.
 */
export const TREE_CELL = 9
export function treeCanopy(wx: number, wy: number, density: number, hash2: (x: number, y: number, seed: number) => number, cut = 0): number {
  const cx = Math.floor(wx / TREE_CELL), cy = Math.floor(wy / TREE_CELL)
  const keep = density * (1 - cut)
  if (keep <= 0) return 0
  let best = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy
      const h = hash2(ix, iy, 41)
      if (h > keep) continue
      const ox = hash2(ix, iy, 43), oy = hash2(ix, iy, 47)
      const tx = (ix + ox) * TREE_CELL, ty = (iy + oy) * TREE_CELL
      const radius = 2.6 + hash2(ix, iy, 53) * 2.4
      const d = Math.hypot(wx - tx, wy - ty)
      if (d < radius) {
        const nx = (wx - tx) / radius, ny = (wy - ty) / radius
        const f = clamp(0.62 - nx * 0.28 - ny * 0.34 - (d / radius) * 0.35 + 0.3, 0.05, 1)
        if (f > best) best = f
      }
    }
  }
  return best
}

/** Bäume je Hektar bei gegebener Dichte (eine 9-m-Zelle je Baum), für Serverbestände (Holzvorrat je Waldfläche). */
export function treesPerHectare(density: number) {
  return density > 0 ? Math.round(density * 10_000 / (TREE_CELL * TREE_CELL)) : 0
}

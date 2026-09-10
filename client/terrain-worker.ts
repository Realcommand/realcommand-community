/**
 * Web Worker: rendert Geländekacheln und die Miniaturkarte aus der Weltmaske.
 * Läuft abseits des Hauptthreads, damit Zoomen und Scrollen nicht ruckeln.
 *
 * Ressourcenknoten (§5): Wald wird über die Schnittkarte (`cut` je Patch, vom Server) ausgedünnt, Aufschlüsse,
 * Büsche, Tonbänke, Schilf, Sand, Ripples und (nur entdeckte) Erztaschen werden aus `patchResources` gezeichnet,
 * damit die Darstellung mit dem Server übereinstimmt. Die reinen Geometrie-Funktionen (`patchNodeSpots`,
 * `nearestSpot`) importiert auch der Hauptthread (terrain.ts) zum Anklicken; der Nachrichten-Handler
 * wird nur innerhalb eines Workers installiert.
 */
import { LandMask } from '../shared/landmask.ts'
import { CELL, GRID_W, GRID_H, WORLD_W, WORLD_H } from '../shared/constants.ts'
import { cellX, cellY } from '../shared/geo.ts'
import { clamp, hash2, valueNoise } from '../shared/math.ts'
import { makeNoiseTable, tableNoise, treeCanopy as sharedCanopy, TREE_CELL } from '../shared/biome.ts'
import {
  PATCH, PATCH_W, PATCH_RESOURCES, isPocket, patchCenter, patchKey, patchResources,
  type IsWater, type PatchInfo, type PatchResource,
} from '../shared/nodes.ts'

const TILE = 256

/** Unterhalb dieser Auflösung (m/px) werden Wald und Schnittkarte gezeichnet (Nahbereich). */
export const CANOPY_MPP = 12
/** Unterhalb dieser Auflösung (m/px) werden Ressourcenknoten (Aufschlüsse, Büsche, …) gezeichnet. */
export const NODE_MPP = 6

/** Ein gezeichneter Knoten einer Patch-Ressource: Mittelpunkt und Radius in Metern, liegt vollständig im Patch. */
export interface NodeSpot { resource: PatchResource, x: number, y: number, r: number }

/** Anzahl und Radius (m) der Knoten je Ressource und Patch; Holz wird über die Baumkronen dargestellt, nicht über Knoten. */
const SPOT_LAYOUT: Record<PatchResource, { n: number, rMin: number, rMax: number }> = {
  wood: { n: 0, rMin: 0, rMax: 0 },
  stone: { n: 4, rMin: 2.4, rMax: 4.4 },
  clay: { n: 2, rMin: 5.5, rMax: 8.5 },
  sand: { n: 2, rMin: 6, rMax: 9 },
  berry: { n: 7, rMin: 1.3, rMax: 2.2 },
  fiber: { n: 3, rMin: 4.5, rMax: 7 },
  fish: { n: 3, rMin: 3.5, rMax: 6 },
  iron_ore: { n: 3, rMin: 2, rMax: 3.4 },
  copper_ore: { n: 3, rMin: 2, rMax: 3.4 },
}

/** Zeichen- und Trefferreihenfolge bei überlappenden Knoten (kleiner = oben). */
const NODE_PRIORITY: Record<PatchResource, number> = {
  iron_ore: 0, copper_ore: 1, stone: 2, clay: 3, berry: 4, fiber: 5, sand: 6, fish: 7, wood: 8,
}

/** Knoten einer Ressource eines Patches, deterministisch aus dem Patch-Index (identisch auf Hauptthread und Worker). */
export function nodeSpots(p: PatchInfo): NodeSpot[] {
  const layout = SPOT_LAYOUT[p.resource]
  const out: NodeSpot[] = []
  if (!layout.n) return out
  const iy = Math.floor(p.key / PATCH_W), ix = p.key - iy * PATCH_W
  const x0 = ix * PATCH, y0 = iy * PATCH
  const base = 200 + PATCH_RESOURCES.indexOf(p.resource) * 100
  for (let i = 0; i < layout.n; i++) {
    const seed = base + i * 3
    const r = layout.rMin + hash2(ix, iy, seed + 2) * (layout.rMax - layout.rMin)
    const margin = r + 0.5
    out.push({
      resource: p.resource,
      x: x0 + margin + hash2(ix, iy, seed) * (PATCH - 2 * margin),
      y: y0 + margin + hash2(ix, iy, seed + 1) * (PATCH - 2 * margin),
      r,
    })
  }
  return out
}

/**
 * Alle gezeichneten Knoten eines Patches (ohne Holz), nach Priorität sortiert.
 * Erztaschen erscheinen nur, wenn der Patch im `discovered`-Set liegt (vom Server gemeldet, §5 Sichtbarkeitsregel).
 */
export function patchNodeSpots(key: number, isWater?: IsWater, discovered?: ReadonlySet<number>): NodeSpot[] {
  const c = patchCenter(key)
  const spots: NodeSpot[] = []
  for (const p of patchResources(c.x, c.y, isWater)) {
    if (p.resource === 'wood') continue
    if (isPocket(p.resource) && !discovered?.has(key)) continue
    for (const s of nodeSpots(p)) spots.push(s)
  }
  return spots.length > 1 ? sortSpots(spots) : spots
}

/** Sortiert Knoten nach Zeichenpriorität (in place, liefert das Array zurück). */
export function sortSpots(spots: NodeSpot[]): NodeSpot[] {
  return spots.sort((a, b) => NODE_PRIORITY[a.resource] - NODE_PRIORITY[b.resource])
}

/**
 * Knoten unter (wx, wy) bzw. innerhalb `tolerance` (m) um den Punkt. Erwartet nach Priorität sortierte Knoten:
 * bei überlappenden Knoten gewinnt der zuerst gezeichnete (oberste), sonst der nächstgelegene Rand.
 */
export function nearestSpot(spots: readonly NodeSpot[], wx: number, wy: number, tolerance: number): NodeSpot | undefined {
  let best: NodeSpot | undefined
  let bestGap = tolerance
  for (const s of spots) {
    const gap = Math.hypot(wx - s.x, wy - s.y) - s.r
    if (gap <= 0) return s
    if (gap < bestGap) { best = s; bestGap = gap }
  }
  return best
}

/**
 * Baumstumpf auf einer gerodeten Baumzelle: Zellen, deren Baum bei `density` stünde, aber durch `cut` entfällt.
 * Liefert den relativen Abstand 0..1 zum Stumpfmittelpunkt oder -1, wenn (wx, wy) auf keinem Stumpf liegt.
 */
export function stumpAt(wx: number, wy: number, density: number, cut: number): number {
  const keep = density * (1 - cut)
  const cx = Math.floor(wx / TREE_CELL), cy = Math.floor(wy / TREE_CELL)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy
      const h = hash2(ix, iy, 41)
      if (h > density || h <= keep) continue
      const tx = (ix + hash2(ix, iy, 43)) * TREE_CELL, ty = (iy + hash2(ix, iy, 47)) * TREE_CELL
      const radius = (2.6 + hash2(ix, iy, 53) * 2.4) * 0.24
      const d = Math.hypot(wx - tx, wy - ty)
      if (d < radius) return d / radius
    }
  }
  return -1
}

// ---------------------------------------------------------------------------------------------------------------------
// Worker-Zustand

let mask: LandMask | undefined
/** Geglättetes Landfeld 0..255 (Mittelwert 3x3, eigene Zelle stärker gewichtet). */
let field: Uint8Array | undefined

/** Schnittkarte: Abholzungsgrad 0..1 je Patch-Schlüssel (Nachricht {t:'cut', key, cut} vom Hauptthread). */
const cuts = new Map<number, number>()
/** Entdeckte Erztaschen (Patch-Schlüssel), Nachricht {t:'discover', keys}. */
const discovered = new Set<number>()

let noise: { large: Float32Array, mid: Float32Array, fine: Float32Array } | undefined
/** Rauschtabellen erst bei Bedarf anlegen (die Datei wird auch vom Hauptthread importiert). */
function noiseTables() {
  if (!noise) noise = { large: makeNoiseTable(7, [4, 8, 16]), mid: makeNoiseTable(11, [4, 8, 16, 32]), fine: makeNoiseTable(13, [8, 16, 32]) }
  return noise
}

/** Schnittkarte pflegen: cut 0 löscht den Eintrag (Nachricht {t:'cut', key, cut}). */
export function applyCut(key: number, cut: number) {
  if (cut > 0) cuts.set(key, Math.min(1, cut)); else cuts.delete(key)
}

/** Erztaschen als entdeckt markieren (Nachricht {t:'discover', keys}). */
export function discoverKeys(keys: readonly number[]) {
  for (const key of keys) discovered.add(key)
}

/** Abholzungsgrad des Patches an einer Weltkoordinate (0 = unberührt). */
function cutAt(wx: number, wy: number): number {
  return cuts.size ? cuts.get(patchKey(wx, wy)) ?? 0 : 0
}

const treeCanopy = (wx: number, wy: number, density: number) => sharedCanopy(wx, wy, density, hash2, cutAt(wx, wy))

/** Wasserabfrage in Landmaskenzellen, identisch mit world.isWater auf dem Server. */
const isWater: IsWater = (x, y) => !mask!.isLandCell(cellX(x), cellY(y))

function buildField() {
  const m = mask!
  const f = new Uint8Array(GRID_W * GRID_H)
  const rows: Uint8Array[] = [new Uint8Array(GRID_W), new Uint8Array(GRID_W), new Uint8Array(GRID_W)]
  const fill = (y: number, out: Uint8Array) => { for (let x = 0; x < GRID_W; x++) out[x] = m.isLandCell(x, y) ? 1 : 0 }
  fill(0, rows[1]); rows[0].set(rows[1])
  for (let y = 0; y < GRID_H; y++) {
    if (y + 1 < GRID_H) fill(y + 1, rows[2]); else rows[2].set(rows[1])
    const r0 = rows[0], r1 = rows[1], r2 = rows[2]
    const row = y * GRID_W
    for (let x = 0; x < GRID_W; x++) {
      const xl = x > 0 ? x - 1 : x, xr = x < GRID_W - 1 ? x + 1 : x
      const sum = r0[xl] + r0[x] + r0[xr] + r1[xl] + r1[x] + r1[xr] + r2[xl] + r2[x] + r2[xr] + r1[x] * 3
      f[row + x] = Math.round(sum / 12 * 255)
    }
    const t = rows[0]; rows[0] = rows[1]; rows[1] = rows[2]; rows[2] = t
  }
  field = f
}

/** Bilinear interpolierter Landwert 0..1 an Weltkoordinaten. */
function landValue(wx: number, wy: number): number {
  const f = field!
  const gx = wx / CELL - 0.5, gy = wy / CELL - 0.5
  const x0 = clamp(Math.floor(gx), 0, GRID_W - 1), y0 = clamp(Math.floor(gy), 0, GRID_H - 1)
  const x1 = x0 < GRID_W - 1 ? x0 + 1 : x0, y1 = y0 < GRID_H - 1 ? y0 + 1 : y0
  const tx = clamp(gx - x0, 0, 1), ty = clamp(gy - y0, 0, 1)
  const a = f[y0 * GRID_W + x0], b = f[y0 * GRID_W + x1], c = f[y1 * GRID_W + x0], d = f[y1 * GRID_W + x1]
  return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 255
}

/** Knoten aller Patches, die eine Kachel berührt (Schlüssel → Knoten), einmal je Kachel berechnet. */
function collectSpots(originX: number, originY: number, size: number): Map<number, NodeSpot[]> {
  const out = new Map<number, NodeSpot[]>()
  const maxRow = Math.ceil(WORLD_H / PATCH) - 1
  const ix0 = Math.max(0, Math.floor(originX / PATCH)), ix1 = Math.min(PATCH_W - 1, Math.floor((originX + size) / PATCH))
  const iy0 = Math.max(0, Math.floor(originY / PATCH)), iy1 = Math.min(maxRow, Math.floor((originY + size) / PATCH))
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const key = iy * PATCH_W + ix
      const spots = patchNodeSpots(key, isWater, discovered)
      if (spots.length) out.set(key, spots)
    }
  }
  return out
}

// Ergebnisfarbe von shadeNode (vermeidet Allokationen in der Pixelschleife).
let nr = 0, ng = 0, nb = 0

/**
 * Farbe eines Knotenpixels: `lr/lg/lb` ist die Bodenfarbe darunter, `grain` die Körnung (0..1).
 * Liefert false, wenn (wx, wy) außerhalb der unregelmäßigen Kontur liegt; sonst steht die Farbe in nr/ng/nb.
 */
function shadeNode(s: NodeSpot, wx: number, wy: number, lr: number, lg: number, lb: number, grain: number, microOn: boolean): boolean {
  const dx = wx - s.x, dy = wy - s.y
  const nd = Math.sqrt(dx * dx + dy * dy) / s.r
  if (nd >= 1) return false
  const u = dx / s.r, v = dy / s.r
  switch (s.resource) {
    case 'stone': case 'iron_ore': case 'copper_ore': {
      // Aufschluss: kantiger Felsblock, links oben beleuchtet, dunkler Rand.
      const edge = 0.72 + 0.28 * valueNoise(wx / 1.6, wy / 1.6, 163)
      if (nd > edge) return false
      const light = clamp(0.78 - u * 0.22 - v * 0.3 - nd * 0.25 + (grain - 0.5) * 0.3, 0.35, 1.1) * (nd > edge - 0.18 ? 0.7 : 1)
      let br = 134, bg = 130, bb = 120
      if (s.resource === 'iron_ore') {
        br = 84; bg = 70; bb = 62
        if (microOn && valueNoise(wx / 0.6, wy / 0.6, 177) > 0.78) { br = 160; bg = 84; bb = 40 } // Rostflecken
      } else if (s.resource === 'copper_ore') {
        br = 86; bg = 118; bb = 96
        if (microOn && valueNoise(wx / 0.6, wy / 0.6, 179) > 0.78) { br = 70; bg = 178; bb = 130 } // Grünspan
      }
      nr = br * light; ng = bg * light; nb = bb * light
      return true
    }
    case 'clay': {
      // Tonbank: glatte rotbraune Fläche mit weichem Rand und Trockenrissen.
      const edge = 0.7 + 0.3 * valueNoise(wx / 3, wy / 3, 165)
      if (nd > edge) return false
      const a = clamp((edge - nd) * 5, 0, 1)
      let cr = 158, cg = 106, cb = 74
      if (microOn && valueNoise(wx / 1.1, wy / 1.1, 167) > 0.8) { cr -= 30; cg -= 22; cb -= 16 }
      const g = (grain - 0.5) * 18
      nr = lr + (cr + g - lr) * a; ng = lg + (cg + g - lg) * a; nb = lb + (cb + g - lb) * a
      return true
    }
    case 'sand': {
      // Sandfleck: helle Fläche mit weichem Rand.
      const edge = 0.7 + 0.3 * valueNoise(wx / 3, wy / 3, 181)
      if (nd > edge) return false
      const a = clamp((edge - nd) * 4, 0, 1) * 0.85
      const g = (grain - 0.5) * 22
      nr = lr + (198 + g - lr) * a; ng = lg + (182 + g - lg) * a; nb = lb + (134 + g - lb) * a
      return true
    }
    case 'berry': {
      // Busch: dunkelgrüne Kugel, rote Beeren im Mikrobereich.
      const edge = 0.8 + 0.2 * valueNoise(wx / 0.8, wy / 0.8, 169)
      if (nd > edge) return false
      const light = clamp(1.05 - u * 0.2 - v * 0.3 - nd * 0.35 + (grain - 0.5) * 0.2, 0.35, 1.1)
      nr = 48 * light; ng = 98 * light; nb = 40 * light
      if (microOn && valueNoise(wx / 0.45, wy / 0.45, 171) > 0.84) { nr = 176; ng = 42; nb = 54 }
      return true
    }
    case 'fiber': {
      // Schilf: gestreckte helle und dunkle Halme, weicher Rand.
      const edge = 0.7 + 0.3 * valueNoise(wx / 2.5, wy / 2.5, 173)
      if (nd > edge) return false
      const a = clamp((edge - nd) * 4, 0, 1)
      const stroke = valueNoise(wx / 0.35, wy / 1.8, 175)
      let fr = 128, fg = 142, fb = 62
      if (stroke > 0.68) { fr = 176; fg = 178; fb = 92 } else if (stroke < 0.32) { fr = 96; fg = 118; fb = 48 }
      nr = lr + (fr - lr) * a; ng = lg + (fg - lg) * a; nb = lb + (fb - lb) * a
      return true
    }
    case 'fish': {
      // Ripples: drei helle Ringe, nach außen schwächer.
      const ring = Math.abs(((nd * 3) % 1) - 0.5)
      if (ring < 0.4) return false
      const a = (ring - 0.4) * 10 * (1 - nd * 0.5)
      nr = lr + 62 * a; ng = lg + 60 * a; nb = lb + 52 * a
      return true
    }
  }
  return false
}

/** Weltmaske übernehmen und das geglättete Landfeld aufbauen (init-Nachricht; auch für Tests). */
export function initMask(bytes: Uint8Array) {
  mask = LandMask.decode(bytes)
  buildField()
}

/** Kachel (tx, ty) der Auflösungsstufe `tileMpp` (m/px bei 256 px) als RGBA-Puffer mit `px` × `px` Pixeln rendern. */
export function renderTile(tx: number, ty: number, tileMpp: number, px: number): Uint8ClampedArray {
  const { large: noiseLarge, mid: noiseMid, fine: noiseFine } = noiseTables()
  const data = new Uint8ClampedArray(px * px * 4)
  const originX = tx * TILE * tileMpp, originY = ty * TILE * tileMpp
  const mpp = tileMpp * TILE / px
  const detail = clamp(1 - Math.log2(mpp + 1) / 12, 0.15, 1)
  const fineOn = mpp < 400
  const midOn = mpp < 60
  const closeOn = mpp < CANOPY_MPP
  const nodesOn = mpp < NODE_MPP
  const microOn = mpp < 2.5
  const tuftOn = mpp < 1.2
  const perturbMid = 0.35 * detail, perturbFine = 0.12 * detail
  const spots = nodesOn ? collectSpots(originX, originY, TILE * tileMpp) : undefined
  let i = 0
  for (let py = 0; py < px; py++) {
    const wy = originY + (py + 0.5) * mpp
    const lat = 90 - wy / WORLD_H * 180
    const absLat = Math.abs(lat)
    const polar = clamp((absLat - 58) / 14, 0, 1)
    const desertLat = clamp(1 - Math.abs(absLat - 24) / 10, 0, 1)
    const tropicLat = clamp(1 - absLat / 22, 0, 1)
    const ice = clamp((absLat - 66) / 10, 0, 1)
    const vLarge = wy / 900_000 * 32, vMid = wy / 40_000 * 32, vFine = wy / 1500 * 32
    const outside = wy > WORLD_H
    const rowKey = Math.floor(wy / PATCH) * PATCH_W
    for (let pxi = 0; pxi < px; pxi++) {
      const wx = originX + (pxi + 0.5) * mpp
      let r: number, g: number, b: number
      if (outside || wx > WORLD_W) {
        r = 5; g = 8; b = 12
      } else {
        const n1 = tableNoise(noiseLarge, wx / 900_000 * 32, vLarge)
        const n2 = tableNoise(noiseMid, wx / 40_000 * 32, vMid)
        const n3 = fineOn ? tableNoise(noiseFine, wx / 1500 * 32, vFine) : 0.5
        const v = landValue(wx + (n2 - 0.5) * CELL * 0.8, wy + (n3 - 0.5) * CELL * 0.8) + (n2 - 0.5) * perturbMid + (n3 - 0.5) * perturbFine
        const patchSpots = spots ? spots.get(rowKey + Math.floor(wx / PATCH)) : undefined
        if (v > 0.5) {
          const t = clamp((v - 0.5) * 4, 0, 1)
          const desert = desertLat * clamp((n1 - 0.35) * 2.5, 0, 1)
          const tropic = tropicLat * (1 - desert)
          // Grundfarbe nach Klimazone.
          let lr = 92 + n2 * 34, lg = 118 + n2 * 30, lb = 58 + n2 * 16
          lr = lr * (1 - tropic * 0.35) + 58 * tropic * 0.35
          lg = lg * (1 - tropic * 0.25) + 128 * tropic * 0.25
          lr = lr * (1 - desert) + (198 + n2 * 20) * desert
          lg = lg * (1 - desert) + (174 + n2 * 16) * desert
          lb = lb * (1 - desert) + (114 + n2 * 10) * desert
          lr = lr * (1 - polar) + 214 * polar
          lg = lg * (1 - polar) + 220 * polar
          lb = lb * (1 - polar) + 224 * polar
          // Mittlere Strukturen (300 m): Flecken aus trockenem Gras und feuchtem Boden.
          if (midOn) {
            const m = valueNoise(wx / 300, wy / 300, 101) * 0.6 + valueNoise(wx / 110, wy / 110, 103) * 0.4
            const dry = clamp((m - 0.56) * 4, 0, 1) * (1 - polar) * 0.45
            const wet = clamp((0.42 - m) * 4, 0, 1) * (1 - desert) * (1 - polar) * 0.35
            lr = lr * (1 - dry) + 150 * dry; lg = lg * (1 - dry) + 138 * dry; lb = lb * (1 - dry) + 76 * dry
            lr = lr * (1 - wet) + 62 * wet; lg = lg * (1 - wet) + 96 * wet; lb = lb * (1 - wet) + 44 * wet
          }
          // Nahbereich (< 12 m/px): Erdflecken, Körnung, Wald, Steine, Ressourcenknoten.
          if (closeOn) {
            const pth = valueNoise(wx / 24, wy / 24, 107)
            const grain = valueNoise(wx / 3, wy / 3, 109)
            const dirt = clamp((0.42 - pth) * 5, 0, 1) * (1 - polar) * 0.6
            const dryp = clamp((pth - 0.62) * 5, 0, 1) * (1 - polar) * (1 - desert) * 0.4
            lr = lr * (1 - dirt) + 112 * dirt; lg = lg * (1 - dirt) + 92 * dirt; lb = lb * (1 - dirt) + 58 * dirt
            lr = lr * (1 - dryp) + 160 * dryp; lg = lg * (1 - dryp) + 146 * dryp; lb = lb * (1 - dryp) + 84 * dryp
            const gr = (grain - 0.5) * 26
            lr += gr; lg += gr * 1.1; lb += gr * 0.7
            if (microOn) {
              const micro = valueNoise(wx / 0.7, wy / 0.7, 113)
              const mg = (micro - 0.5) * 14
              lr += mg; lg += mg; lb += mg * 0.6
              if (micro > 0.88 && grain > 0.55 && desert < 0.5 && polar < 0.5) { lr = 122 + mg; lg = 120 + mg; lb = 112 + mg }
              if (tuftOn && desert < 0.5 && polar < 0.5) {
                // Grasbüschel: gestreckte dunkle Striche
                const tuft = valueNoise(wx / 0.45, wy / 1.4, 139)
                if (tuft > 0.8) { const tt = (tuft - 0.8) * 5; lr -= 18 * tt; lg -= 10 * tt; lb -= 14 * tt }
                else if (tuft < 0.17) { const tt = (0.17 - tuft) * 6; lr += 10 * tt; lg += 12 * tt; lb += 4 * tt }
              }
            }
            // Wald: Verteilung über zwei Rauschoktaven, Bäume als Zellrauschen, ausgedünnt über die Schnittkarte.
            let canopy = 0
            const forest = valueNoise(wx / 160, wy / 160, 121) * 0.55 + valueNoise(wx / 45, wy / 45, 123) * 0.45
            const forestThreshold = 0.56 + desert * 0.3 + polar * 0.4
            if (forest > forestThreshold) {
              const density = clamp((forest - forestThreshold) * 4, 0.15, 0.95)
              canopy = treeCanopy(wx, wy, density)
              if (canopy > 0) {
                const cr = 30 + canopy * 62, cg = 62 + canopy * 78, cb = 26 + canopy * 30
                lr = cr; lg = cg; lb = cb
              } else {
                // Waldboden etwas dunkler, in gerodeten Flächen weniger.
                const cut = cuts.size ? cutAt(wx, wy) : 0
                const shade = 0.25 * density * (1 - cut)
                lr *= 1 - shade; lg *= 1 - shade * 0.8; lb *= 1 - shade
                if (cut > 0 && microOn) {
                  // Baumstümpfe: helle Schnittfläche mit dunklem Rindenrand.
                  const st = stumpAt(wx, wy, density, cut)
                  if (st >= 0) {
                    const rim = st > 0.7 ? 0.55 : 1 - st * 0.2
                    const sg = (grain - 0.5) * 20
                    lr = (172 + sg) * rim; lg = (136 + sg) * rim; lb = (90 + sg) * rim
                  }
                }
              }
            }
            // Ressourcenknoten an Land (unter dem Kronendach verdeckt).
            if (patchSpots && canopy === 0) {
              for (const s of patchSpots) {
                if (s.resource === 'fish') continue
                if (shadeNode(s, wx, wy, lr, lg, lb, grain, microOn)) { lr = nr; lg = ng; lb = nb; break }
              }
            }
          }
          const beach = 1 - t
          const grain2 = (n3 - 0.5) * 12 * detail
          r = lr * (1 - beach * 0.35) + 188 * beach * 0.35 + grain2
          g = lg * (1 - beach * 0.3) + 176 * beach * 0.3 + grain2
          b = lb * (1 - beach * 0.3) + 128 * beach * 0.3 + grain2
        } else {
          const shallow = clamp(v * 2, 0, 1)
          const deep = clamp(1 - v * 2.2, 0, 1)
          r = 22 + shallow * 40 + n2 * 8 - deep * 6
          g = 62 + shallow * 70 + n2 * 10 - deep * 10
          b = 112 + shallow * 60 + n2 * 12 - deep * 14
          if (midOn) {
            // Dünung (300 m) und Wellen (< 12 m/px), Schaum an der Küste.
            const swell = valueNoise(wx / 260, wy / 90, 127)
            const sw = (swell - 0.5) * 14
            r += sw * 0.5; g += sw * 0.8; b += sw
            if (closeOn) {
              const rip = valueNoise(wx / 9, wy / 2.5, 131)
              const rip2 = valueNoise(wx / 3.5 + 50, wy / 1.2, 137)
              const w = (rip - 0.5) * 26 + (rip2 - 0.5) * 12
              r += w * 0.6; g += w * 0.85; b += w
              const crest = clamp((rip - 0.72) * 6, 0, 1) * 0.5
              r += crest * 90; g += crest * 95; b += crest * 90
              const foam = clamp(1 - Math.abs(v - 0.47) / 0.04, 0, 1) * clamp((rip - 0.3) * 1.8, 0, 1)
              r += foam * 130; g += foam * 125; b += foam * 105
              // Fischgründe: Ripples im Uferwasser.
              if (patchSpots) {
                for (const s of patchSpots) {
                  if (s.resource !== 'fish') continue
                  if (shadeNode(s, wx, wy, r, g, b, 0.5, microOn)) { r = nr; g = ng; b = nb; break }
                }
              }
            }
          }
          r = r * (1 - ice) + 200 * ice; g = g * (1 - ice) + 214 * ice; b = b * (1 - ice) + 226 * ice
        }
      }
      data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = 255
    }
  }
  return data
}

function renderMinimap(w: number, h: number): Uint8ClampedArray {
  const m = mask!
  const data = new Uint8ClampedArray(w * h * 4)
  const step = GRID_W / w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let land = 0, n = 0
      for (let dy = 0; dy < step; dy += 2) for (let dx = 0; dx < step; dx += 2) {
        n++
        if (m.isLandCell(Math.floor(x * step + dx), Math.floor(y * step + dy))) land++
      }
      const f = land / n
      const i = (y * w + x) * 4
      const g = hash2(x, y, 3) * 10
      if (f > 0.4) { data[i] = 84 + g; data[i + 1] = 110 + g; data[i + 2] = 60 }
      else { data[i] = 14; data[i + 1] = 34; data[i + 2] = 66 }
      data[i + 3] = 255
    }
  }
  return data
}

/**
 * Nachrichten vom Hauptthread (terrain.ts). Kachel-/Minimap-Nachrichten verwenden `type`, die Patch-Nachrichten
 * aus §5 das Feld `t`: {t:'cut', key, cut} setzt den Abholzungsgrad eines Patches (0 löscht den Eintrag),
 * {t:'discover', keys} markiert Erztaschen als entdeckt. Beide wirken auf alle danach gerenderten Kacheln.
 */
export function renderRadar(x0:number,y0:number,width:number,height:number,w:number,h:number) {
  const data=new Uint8ClampedArray(w*h*4)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const wx=x0+(x+.5)/w*width,wy=y0+(y+.5)/h*height,ix=cellX(wx),iy=cellY(wy),i=(y*w+x)*4,n=((x*7+y*13)%11)-5
    if(mask?.isLandCell(ix,iy)) {
      const coast=mask.isCoastCell(ix,iy)
      data[i]=(coast?96:58)+n;data[i+1]=(coast?108:82)+n;data[i+2]=(coast?76:54)+n
    }else{data[i]=12;data[i+1]=28+n;data[i+2]=52+n}
    data[i+3]=255
  }
  return data
}
async function onMessage(ev: MessageEvent) {
  const msg = ev.data
  const post = (self as unknown as Worker).postMessage.bind(self)
  try {
    const t = msg.t ?? msg.type
    if (t === 'cut') {
      applyCut(msg.key, msg.cut)
    } else if (t === 'discover') {
      discoverKeys(msg.keys)
    } else if (t === 'init') {
      const res = await fetch(msg.url)
      if (!res.ok) throw new Error(`landmask ${res.status}`)
      initMask(new Uint8Array(await res.arrayBuffer()))
      post({ type: 'ready' })
    } else if (t === 'tile') {
      const data = renderTile(msg.tx, msg.ty, msg.mpp, msg.px ?? TILE)
      post({ type: 'tile', key: msg.key, px: msg.px ?? TILE, buffer: data.buffer }, [data.buffer])
    } else if (t === 'minimap') {
      const data = renderMinimap(msg.w, msg.h)
      post({ type: 'minimap', w: msg.w, h: msg.h, buffer: data.buffer }, [data.buffer])
    } else if(t==='radar') {
      const data=renderRadar(msg.x0,msg.y0,msg.width,msg.height,msg.w,msg.h)
      post({type:'radar',id:msg.id,w:msg.w,h:msg.h,buffer:data.buffer},[data.buffer])
    }
  } catch (error: any) {
    post({ type: 'error', message: error?.message ?? String(error), key: msg.key, id:msg.id })
  }
}

// Nur im Worker installieren; der Hauptthread importiert diese Datei lediglich wegen der Geometrie-Funktionen.
if (typeof document === 'undefined' && typeof self !== 'undefined') {
  self.onmessage = onMessage
}

/**
 * Patches: deterministische Ressourcenflecken (90 m) aus dem Biom, identisch auf Server und Client.
 * Kein Baum, Busch oder Fels wird je eine Entität; der Server speichert nur berührte Patches (remaining/cut),
 * alles andere wird hier bei Bedarf berechnet. Reine Funktionen ohne Server-/Client-Abhängigkeiten.
 */
import { CELL, WORLD_H, WORLD_W } from './constants.ts'
import { biomeAt, treesPerHectare, type Biome } from './biome.ts'
import { valueNoise } from './math.ts'

/** Kantenlänge eines Patches in Metern. */
export const PATCH = 90
/** Patches je Weltzeile; Schlüssel = ⌊y/90⌋ × PATCH_W + ⌊x/90⌋ (< 10¹¹, exakt in Doubles). */
export const PATCH_W = Math.ceil(WORLD_W / PATCH)
/** Fläche eines Patches in Hektar. */
export const PATCH_HA = (PATCH * PATCH) / 10_000
/** Holz je gefälltem Baum. */
export const WOOD_PER_TREE = 4
/** Erztaschen sind nur innerhalb dieser Distanz (m) von einem eigenen Avatar/Bewohner sichtbar. */
export const POCKET_VISIBLE_M = 60

/** Alle Patch-Ressourcen (§5). `arable` ist ein Wert, kein Vorrat, und daher hier nicht enthalten. */
export type PatchResource = 'wood' | 'stone' | 'clay' | 'sand' | 'berry' | 'fiber' | 'fish' | 'iron_ore' | 'copper_ore'
export const PATCH_RESOURCES: readonly PatchResource[] = ['wood', 'stone', 'clay', 'sand', 'berry', 'fiber', 'fish', 'iron_ore', 'copper_ore']

/** Feste Kapazität je Patch (Holz hängt von der Walddichte ab, siehe patchCapacity). */
export const PATCH_CAP: Record<Exclude<PatchResource, 'wood'>, number> = {
  stone: 120, clay: 80, sand: 200, berry: 30, fiber: 60, fish: 100, iron_ore: 60, copper_ore: 40,
}

/** Nachwachsen in Einheiten je Stunde; Holz wächst anteilig nach (WOOD_REGEN_FRACTION_PER_H der Kapazität). */
export const REGEN_PER_H: Record<PatchResource, number> = {
  wood: 0, stone: 0, clay: 0, sand: 0, berry: 10, fiber: 6, fish: 20, iron_ore: 0, copper_ore: 0,
}
/** Holz: 1 % der Kapazität je Stunde (voller Nachwuchs ≈ 4 Tage). */
export const WOOD_REGEN_FRACTION_PER_H = 0.01

/** Nachwachsen einer Ressource in Einheiten je Stunde bei gegebener Kapazität. */
export function regenPerHour(resource: string, cap: number): number {
  if (resource === 'wood') return cap * WOOD_REGEN_FRACTION_PER_H
  return REGEN_PER_H[resource as PatchResource] ?? 0
}

/** Erztaschen: nur nach Sichtung (≤ POCKET_VISIBLE_M) gemeldet. */
export function isPocket(resource: string): boolean {
  return resource === 'iron_ore' || resource === 'copper_ore'
}

/** Land/Wasser-Abfrage an Weltkoordinaten (Server: world.isWater, Client: terrain). */
export type IsWater = (x: number, y: number) => boolean

/** Ein Patch-Vorkommen einer Ressource (statische Gelände-Daten). */
export interface PatchInfo {
  key: number
  resource: PatchResource
  /** Patch-Mitte */
  x: number
  y: number
  cap: number
}

/** Ergebniszeile von scanPatches. */
export interface ScannedPatch extends PatchInfo {
  /** Verbleibender Vorrat (Kapazität, solange der Patch unberührt ist). */
  remaining: number
  /** Abstand von der Suchposition zur Patch-Mitte in Metern. */
  distance: number
}

/** Berührter Patch, wie ihn der Server hält (game.patches); weitere Felder werden ignoriert. */
export interface TouchedPatch { resource: string; remaining: number }
/** Nachschlagen berührter Patches: Map nach Schlüssel (eine Ressource je Eintrag) oder Callback nach Schlüssel + Ressource. */
export type TouchedLookup = ReadonlyMap<number, TouchedPatch> | ((key: number, resource: PatchResource) => TouchedPatch | undefined)

export function patchKey(x: number, y: number): number {
  return Math.floor(y / PATCH) * PATCH_W + Math.floor(x / PATCH)
}

/** Weltkoordinate der Patch-Mitte zu einem Schlüssel. */
export function patchCenter(key: number): { x: number, y: number } {
  const iy = Math.floor(key / PATCH_W), ix = key - iy * PATCH_W
  return { x: (ix + 0.5) * PATCH, y: (iy + 0.5) * PATCH }
}

/** Holzvorrat eines Waldpatches: Bäume je Hektar × 0,81 ha × WOOD_PER_TREE (Dichte 0,5 → 62 → 50 Bäume → 200 Holz). */
export function patchCapacity(density: number): number {
  if (density <= 0) return 0
  return Math.round(treesPerHectare(density) * PATCH_HA) * WOOD_PER_TREE
}

/** Kapazität einer Ressource an einem Patch (Holz aus dem Biom, sonst PATCH_CAP). */
export function patchCap(resource: PatchResource, biome: Biome): number {
  return resource === 'wood' ? patchCapacity(biome.forestDensity) : PATCH_CAP[resource]
}

/** Küstenzelle: Land mit Wasser in der 8er-Nachbarschaft der Landmaskenzellen (Auflösung CELL). */
export function isCoastAt(x: number, y: number, isWater: IsWater): boolean {
  if (isWater(x, y)) return false
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && isWater(x + dx * CELL, y + dy * CELL)) return true
  }
  return false
}

/** Uferwasser: Wasserzelle mit Land in der 8er-Nachbarschaft (Fischgründe). */
export function isShoreWaterAt(x: number, y: number, isWater: IsWater): boolean {
  if (!isWater(x, y)) return false
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && !isWater(x + dx * CELL, y + dy * CELL)) return true
  }
  return false
}

/**
 * Alle Ressourcen eines Patches (§5-Tabelle), ausgewertet an der Patch-Mitte.
 * Ohne `isWater` gilt der Patch als Land (keine Fische, kein Küstensand); ein Patch kann mehrere Ressourcen tragen (z. B. Holz + Beeren).
 */
export function patchResources(x: number, y: number, isWater?: IsWater): PatchInfo[] {
  const key = patchKey(x, y)
  const c = patchCenter(key)
  const out: PatchInfo[] = []
  const add = (resource: PatchResource, cap: number) => { if (cap > 0) out.push({ key, resource, x: c.x, y: c.y, cap }) }

  if (isWater && isWater(c.x, c.y)) {
    if (isShoreWaterAt(c.x, c.y, isWater)) add('fish', PATCH_CAP.fish)
    return out
  }
  const b = biomeAt(c.x, c.y)
  const { forestDensity, rockField, moisture, arable } = b
  if (forestDensity > 0) add('wood', patchCapacity(forestDensity))
  if (rockField > 0.72 && forestDensity < 0.3) add('stone', PATCH_CAP.stone)
  if (moisture > 0.7 && rockField < 0.3 && !b.polar) add('clay', PATCH_CAP.clay)
  if (b.desert > 0.5 || (isWater !== undefined && isCoastAt(c.x, c.y, isWater))) add('sand', PATCH_CAP.sand)
  if ((forestDensity > 0 && forestDensity < 0.5) || (moisture > 0.5 && valueNoise(c.x / 60, c.y / 60, 137) > 0.6)) add('berry', PATCH_CAP.berry)
  if (forestDensity === 0 && arable > 0.3) add('fiber', PATCH_CAP.fiber)
  if (rockField > 0.5) {
    if (valueNoise(c.x / 500, c.y / 500, 149) > 0.80) add('iron_ore', PATCH_CAP.iron_ore)
    if (valueNoise(c.x / 500, c.y / 500, 151) > 0.86) add('copper_ore', PATCH_CAP.copper_ore)
  }
  return out
}

/** Vorkommen einer bestimmten Ressource an einem Patch oder undefined. */
export function patchResourceAt(x: number, y: number, resource: PatchResource, isWater?: IsWater): PatchInfo | undefined {
  return patchResources(x, y, isWater).find((p) => p.resource === resource)
}

function touchedRemaining(touched: TouchedLookup | undefined, key: number, resource: PatchResource): number | undefined {
  if (!touched) return undefined
  const t = typeof touched === 'function' ? touched(key, resource) : touched.get(key)
  return t && t.resource === resource ? t.remaining : undefined
}

/**
 * Kandidaten-Patches im Umkreis `radius` (m) um (x, y), ringweise aufgezählt und nach Abstand sortiert.
 * `resource` filtert auf eine Ressource; `touched` liefert den Vorrat berührter Patches, sonst gilt remaining = cap.
 * Leere Patches (remaining 0) werden mitgeliefert; Aufrufer filtern nach Bedarf.
 */
export function scanPatches(x: number, y: number, radius: number, resource?: PatchResource, isWater?: IsWater, touched?: TouchedLookup): ScannedPatch[] {
  const out: ScannedPatch[] = []
  if (!(radius >= 0)) return out
  const cx = Math.floor(x / PATCH), cy = Math.floor(y / PATCH)
  const rings = Math.ceil(radius / PATCH) + 1
  const maxRow = Math.ceil(WORLD_H / PATCH) - 1
  const visit = (ix: number, iy: number) => {
    if (iy < 0 || iy > maxRow || ix < 0 || ix >= PATCH_W) return
    const px = (ix + 0.5) * PATCH, py = (iy + 0.5) * PATCH
    const distance = Math.hypot(px - x, py - y)
    if (distance > radius) return
    for (const p of patchResources(px, py, isWater)) {
      if (resource && p.resource !== resource) continue
      const remaining = touchedRemaining(touched, p.key, p.resource) ?? p.cap
      out.push({ ...p, remaining, distance })
    }
  }
  visit(cx, cy)
  for (let r = 1; r <= rings; r++) {
    // Ring r: obere und untere Kante vollständig, linke und rechte Kante ohne die Ecken
    for (let ix = cx - r; ix <= cx + r; ix++) { visit(ix, cy - r); visit(ix, cy + r) }
    for (let iy = cy - r + 1; iy <= cy + r - 1; iy++) { visit(cx - r, iy); visit(cx + r, iy) }
  }
  out.sort((a, b) => a.distance - b.distance || a.key - b.key)
  return out
}

/** Windfaktor für Mühlen: 0,6 + 0,4 × Rauschen (2 km), +0,2 an der Küste, −0,3 × Walddichte. */
export function windFactor(x: number, y: number, isWater?: IsWater): number {
  let f = 0.6 + 0.4 * valueNoise(x / 2000, y / 2000, 157)
  if (isWater && isCoastAt(x, y, isWater)) f += 0.2
  f -= 0.3 * biomeAt(x, y).forestDensity
  return Math.max(0.1, f)
}

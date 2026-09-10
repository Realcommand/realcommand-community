import { WORLD_W, WORLD_H, CELL, GRID_W, GRID_H, COARSE_CELL, COARSE_W, COARSE_H } from './constants.ts'

/** Geographische Koordinaten -> Weltkoordinaten (Meter, y wächst nach Süden). */
export function lonLatToWorld(lon: number, lat: number): { x: number, y: number } {
  return { x: (lon + 180) / 360 * WORLD_W, y: (90 - lat) / 180 * WORLD_H }
}

export function worldToLonLat(x: number, y: number): { lon: number, lat: number } {
  return { lon: x / WORLD_W * 360 - 180, lat: 90 - y / WORLD_H * 180 }
}

export function clampWorld(x: number, y: number): [number, number] {
  return [Math.min(WORLD_W - 1, Math.max(0, x)), Math.min(WORLD_H - 1, Math.max(0, y))]
}

export function cellX(x: number) { return Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL))) }
export function cellY(y: number) { return Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL))) }
export function cellCenter(ix: number, iy: number): [number, number] { return [(ix + 0.5) * CELL, (iy + 0.5) * CELL] }

export function coarseX(x: number) { return Math.min(COARSE_W - 1, Math.max(0, Math.floor(x / COARSE_CELL))) }
export function coarseY(y: number) { return Math.min(COARSE_H - 1, Math.max(0, Math.floor(y / COARSE_CELL))) }
export function coarseCenter(cx: number, cy: number): [number, number] { return [(cx + 0.5) * COARSE_CELL, (cy + 0.5) * COARSE_CELL] }

export function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx, dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

export function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx, dy = ay - by
  return dx * dx + dy * dy
}

/** Formatiert eine Distanz in Metern lesbar (m / km). */
export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}

export function formatLonLat(x: number, y: number) {
  const { lon, lat } = worldToLonLat(x, y)
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'O' : 'W'
  return `${Math.abs(lat).toFixed(2)}° ${ns}  ${Math.abs(lon).toFixed(2)}° ${ew}`
}

/**
 * Land/Wasser-Maske: bitgepackt, RLE-kodiert für den Transport.
 * Format: "RCLM" | u8 version | u32 width | u32 height | LEB128-Laufläng en (beginnend mit Wasser).
 */
import { GRID_W, GRID_H, COARSE_FACTOR, COARSE_W, COARSE_H } from './constants.ts'

const MAGIC = [0x52, 0x43, 0x4c, 0x4d] // "RCLM"

export function encodeLandmask(cells: Uint8Array, width: number, height: number): Uint8Array {
  const out: number[] = [...MAGIC, 1]
  const pushU32 = (v: number) => { out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255) }
  pushU32(width); pushU32(height)
  const pushVar = (v: number) => {
    while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128) }
    out.push(v)
  }
  let current = 0, run = 0
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i] ? 1 : 0
    if (v === current) { run++ } else { pushVar(run); current = v; run = 1 }
  }
  pushVar(run)
  return Uint8Array.from(out)
}

export class LandMask {
  readonly width: number
  readonly height: number
  readonly bits: Uint8Array
  /** Landanteil (0..COARSE_FACTOR²) je grober Zelle. */
  readonly coarseLand: Uint8Array
  /** Wasseranteil je grober Zelle. */
  readonly coarseWater: Uint8Array

  constructor(width: number, height: number, bits: Uint8Array) {
    this.width = width
    this.height = height
    this.bits = bits
    this.coarseLand = new Uint8Array(COARSE_W * COARSE_H)
    this.coarseWater = new Uint8Array(COARSE_W * COARSE_H)
    for (let cy = 0; cy < COARSE_H; cy++) {
      for (let cx = 0; cx < COARSE_W; cx++) {
        let land = 0
        for (let j = 0; j < COARSE_FACTOR; j++) {
          const row = (cy * COARSE_FACTOR + j) * width
          for (let i = 0; i < COARSE_FACTOR; i++) {
            const idx = row + cx * COARSE_FACTOR + i
            if (bits[idx >> 3] & (1 << (idx & 7))) land++
          }
        }
        this.coarseLand[cy * COARSE_W + cx] = land
        this.coarseWater[cy * COARSE_W + cx] = COARSE_FACTOR * COARSE_FACTOR - land
      }
    }
  }

  static decode(buf: Uint8Array): LandMask {
    for (let i = 0; i < 4; i++) if (buf[i] !== MAGIC[i]) throw new Error('landmask: ungültiges Format')
    const u32 = (o: number) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)) + buf[o + 3] * 16777216
    const width = u32(5), height = u32(9)
    if (width !== GRID_W || height !== GRID_H) throw new Error(`landmask: unerwartete Größe ${width}x${height}`)
    const total = width * height
    const bits = new Uint8Array(Math.ceil(total / 8))
    let pos = 13, idx = 0, current = 0
    while (pos < buf.length && idx < total) {
      let run = 0, shift = 1, b: number
      do { b = buf[pos++]; run += (b & 0x7f) * shift; shift *= 128 } while (b & 0x80)
      if (current) {
        for (let k = 0; k < run; k++, idx++) bits[idx >> 3] |= 1 << (idx & 7)
      } else {
        idx += run
      }
      current ^= 1
    }
    return new LandMask(width, height, bits)
  }

  isLandCell(ix: number, iy: number): boolean {
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false
    const idx = iy * this.width + ix
    return (this.bits[idx >> 3] & (1 << (idx & 7))) !== 0
  }

  /** Landzelle mit mindestens einer Wasserzelle in der 8er-Nachbarschaft. */
  isCoastCell(ix: number, iy: number): boolean {
    if (!this.isLandCell(ix, iy)) return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && this.inBounds(ix + dx, iy + dy) && !this.isLandCell(ix + dx, iy + dy)) return true
    }
    return false
  }

  /** Wasserzelle, die an Land grenzt. */
  isShoreWaterCell(ix: number, iy: number): boolean {
    if (!this.inBounds(ix, iy) || this.isLandCell(ix, iy)) return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && this.isLandCell(ix + dx, iy + dy)) return true
    }
    return false
  }

  inBounds(ix: number, iy: number) {
    return ix >= 0 && iy >= 0 && ix < this.width && iy < this.height
  }

  /** Landanteil 0..1 einer groben Zelle. */
  coarseLandFraction(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= COARSE_W || cy >= COARSE_H) return 0
    return this.coarseLand[cy * COARSE_W + cx] / (COARSE_FACTOR * COARSE_FACTOR)
  }
}

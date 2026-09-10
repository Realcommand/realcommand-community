export const TAU = Math.PI * 2

export function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

/** Kürzester Winkelabstand von a nach b in (-π, π]. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + angleDelta(a, b) * t
}

/** Dreht heading in Richtung target mit maximaler Winkelgeschwindigkeit. */
export function turnTowards(heading: number, target: number, maxDelta: number) {
  const d = angleDelta(heading, target)
  if (Math.abs(d) <= maxDelta) return target
  return heading + Math.sign(d) * maxDelta
}

/** Deterministischer Zufallsgenerator (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x: number, y: number, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Einfaches Value-Noise in [0,1]. */
export function valueNoise(x: number, y: number, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed)
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy)
}

export function fbm(x: number, y: number, octaves = 4, seed = 0) {
  let v = 0, amp = 0.5, f = 1, sum = 0
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * f, y * f, seed + i * 101) * amp
    sum += amp
    amp *= 0.5
    f *= 2
  }
  return v / sum
}

export function kmhToMs(kmh: number) { return kmh / 3.6 }
export function formatTime(seconds: number) {
  seconds = Math.max(0, Math.round(seconds))
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

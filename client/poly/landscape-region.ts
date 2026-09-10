export interface LandscapeRegion { x: number, y: number, size: number }

/** Keep a padded, world-aligned patch through small pans and zoom reversals. */
export function landscapeRegion(x: number, y: number, span: number, previous?: LandscapeRegion): LandscapeRegion {
  const visible = Math.max(128, span)
  if (previous && visible >= previous.size / 4
    && Math.max(Math.abs(x - previous.x), Math.abs(y - previous.y)) + visible / 2 <= previous.size * .4) return previous

  const size = 2 ** Math.ceil(Math.log2(visible * 2))
  const snap = size / 8
  return { x: Math.round(x / snap) * snap, y: Math.round(y / snap) * snap, size }
}

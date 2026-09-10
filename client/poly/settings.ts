export type Quality = 'low' | 'balanced' | 'high'
export interface GraphicsSettings { quality: Quality, motion: boolean, light: 'day' | 'dusk', view: 'perspective' | 'tactical' }
export const BUDGETS = {
  low: { dpr: 1, detailed: 120, trees: 1200, terrain: 64 },
  balanced: { dpr: 1.5, detailed: 320, trees: 5200, terrain: 160 },
  high: { dpr: 2, detailed: 600, trees: 10000, terrain: 256 },
} as const

/** Shareable graphics choices; never sent to the simulation server. */
export function graphicsSettings(search: string, reducedMotion = false): GraphicsSettings {
  const q = new URLSearchParams(search)
  const quality = q.get('quality')
  return {
    quality: quality === 'low' || quality === 'balanced' ? quality : 'high',
    motion: q.has('motion') ? q.get('motion') !== 'off' : !reducedMotion,
    light: q.get('light') === 'day' ? 'day' : 'dusk',
    view: q.get('view') === 'tactical' ? 'tactical' : 'perspective',
  }
}

export const GROUND_SCALE = 0.40
export const WORLD_FOV = 50
export function groundScale(mpp: number) {
  return GROUND_SCALE + (1 - GROUND_SCALE) * Math.min(1, Math.max(0, (mpp - 60) / 100))
}

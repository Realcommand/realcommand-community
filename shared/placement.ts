import { BUILD_RADIUS, WORLD_W, WORLD_H } from './constants.ts'
import { DEFS, type BuildingDef } from './data.ts'

/** Physical footprints use definition.size as a world-metre radius. */
export const DEPOSIT_RADIUS = 60
export const BUILD_GAP = 10
export const TERRITORY_RADIUS = BUILD_RADIUS
export interface Occupant {
  id: number, kind: 'unit' | 'building' | 'deposit', type: string, owner: number
  x: number, y: number, state?: string, inside?: number, dead?: boolean
}
export function occupantRadius(e: Occupant): number {
  if (e.dead || e.inside !== undefined) return 0
  if (e.kind === 'deposit') return DEPOSIT_RADIUS
  const def = DEFS[e.type]
  if (!def) return 0
  if (def.kind === 'unit' && def.domain === 'air' && e.state !== 'parked' && e.state !== 'rearm') return 0
  return def.size
}
export interface PlacementOptions {
  def: BuildingDef, x: number, y: number, owner: number, builderId?: number
  allied?(a:number,b:number):boolean
  terrain: { isLand(x: number, y: number): boolean, isCoast(x: number, y: number): boolean }
  query(x: number, y: number, radius: number, visit: (e: Occupant, d2: number) => void): void
}
export function checkPlacement({ def, x, y, owner, builderId, terrain, query, allied=()=>false }: PlacementOptions): { code: string, message: string } | null {
  const s = def.size
  if (![x,y].every(Number.isFinite) || x-s<0 || y-s<0 || x+s>WORLD_W || y+s>WORLD_H) return { code:'outside_world',message:'outside the world' }
  const corners = [[x,y],[x-s,y-s],[x+s,y-s],[x-s,y+s],[x+s,y+s]]
  if (!corners.every(([cx,cy])=>terrain.isLand(cx,cy))) return { code:'land_only',message:'must be on land' }
  if (def.placement==='coast' && !corners.some(([cx,cy])=>terrain.isCoast(cx,cy))) return { code:'coast_required',message:'must be on the coast' }
  let nearOwn = false, blocked: { code: string, message: string } | null = null
  query(x,y,BUILD_RADIUS+200,(e,d2)=>{
    if (e.dead || e.inside!==undefined) return
    // Only the actual deploying crawler is consumed; nearby units still block.
    if (e.id===builderId && e.owner===owner && e.type==='crawler' && d2<1) { nearOwn=true; return }
    if (e.kind==='building') {
      const allowed=e.owner===owner||allied(owner,e.owner)
      if (allowed && d2<=BUILD_RADIUS*BUILD_RADIUS) nearOwn=true
      if (!allowed && d2<(TERRITORY_RADIUS+s)**2) blocked={code:'foreign_territory',message:'foreign territory: join an alliance for building rights or conquer the territory first; declaring war alone grants no building rights'}
    }
    const r=occupantRadius(e)
    if (!r || d2>=(s+r+BUILD_GAP)**2) return
    blocked = e.kind==='unit' ? {code:'occupied_unit',message:'overlaps a unit; move it clear of the construction area'}
      : e.kind==='deposit' ? {code:'occupied_deposit',message:'overlaps a resource deposit'}
      : {code:'overlap',message:'overlaps another building or is too close to a foreign one'}
  })
  if (blocked) return blocked
  return nearOwn ? null : {code:'too_far_from_base',message:`too far from own buildings (max. ${BUILD_RADIUS/1000} km)`}
}

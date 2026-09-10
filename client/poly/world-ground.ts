import type {LandMask} from '../../shared/landmask.ts'
import {CELL,GRID_W,GRID_H} from '../../shared/constants.ts'
import {patchKey} from '../../shared/nodes.ts'
import type {GroundSource} from './surface.ts'

/** Plain data access shared by the live scene and its geometry worker. */
export function worldLandAt(mask:Pick<LandMask,'isLandCell'>|undefined,x:number,y:number) {
  return !!mask&&mask.isLandCell(Math.max(0,Math.min(GRID_W-1,Math.floor(x/CELL))),Math.max(0,Math.min(GRID_H-1,Math.floor(y/CELL))))
}
export function worldGroundSource(mask:LandMask|undefined,cuts:ReadonlyMap<number,number>,revision:number):GroundSource {
  return {ready:!!mask,revision,isLand:(x,y)=>worldLandAt(mask,x,y),
    cutAt:(x,y)=>cuts.get(patchKey(x,y))??0,
    graphicsSnapshot:()=>({kind:'world',cuts:[...cuts.entries()]})}
}

import type {GroundSource,Footprint} from './surface.ts'
import type {PrimitiveBatch} from './batch.ts'
import type {LandscapeRegion} from './landscape-region.ts'
export interface LandscapeJob {
  id:number,region:LandscapeRegion,resolution:number,trees:number
  source:ReturnType<NonNullable<GroundSource['graphicsSnapshot']>>
  roads:GroundSource['roads'],footprints:Footprint[],revision:number
}
export interface LandscapeReply { id: number, data?: LandscapeData, error?: string }
export type GeometryData=Record<string,{array:Float32Array,itemSize:number}>
export interface LandscapeData {
  anchorX:number,anchorY:number,geometry:GeometryData[],props:ReturnType<PrimitiveBatch['snapshot']>
  trees:Float32Array,nearTrees:number,coast:Uint8Array,resolution:number,waterSize:number,coastScale:number
}
export function landscapeTransfers(data:LandscapeData):ArrayBuffer[] {
  return [...data.geometry.flatMap(g=>Object.values(g).map(a=>a.array.buffer as ArrayBuffer)),
    ...data.props.flatMap(p=>[p.matrix.buffer as ArrayBuffer,p.color.buffer as ArrayBuffer]),
    data.trees.buffer as ArrayBuffer,data.coast.buffer as ArrayBuffer]
}

import {Landscape} from './landscape.ts'
import {LandMask} from '../../shared/landmask.ts'
import {worldGroundSource} from './world-ground.ts'
import type {GroundSource} from './surface.ts'
import {demoLand,type DemoScene} from './demo.ts'
import {landscapeTransfers,type LandscapeJob} from './landscape-data.ts'
let landscape:Landscape|undefined,maskPromise:Promise<LandMask>|undefined
self.onmessage=async(event:MessageEvent<LandscapeJob>)=>{
  const job=event.data
  try {
    let source:GroundSource
    if(job.source.kind==='world') {
      maskPromise??=fetch('/data/landmask.rle').then(async r=>{if(!r.ok)throw new Error('Land mask unavailable');return LandMask.decode(new Uint8Array(await r.arrayBuffer()))})
      source=worldGroundSource(await maskPromise,new Map(job.source.cuts),job.revision)
    } else {const scene=job.source.scene as DemoScene;source={ready:true,isLand:(x,y)=>demoLand(scene,x,y),revision:job.revision}}
    landscape??=new Landscape(job.resolution,job.trees)
    landscape.bakedTrees=true
    landscape.prepare(job.region,{...source,roads:job.roads},job.footprints)
    const data=landscape.snapshot()
    self.postMessage({id:job.id,data}, {transfer:landscapeTransfers(data)})
  } catch(error) {self.postMessage({id:job.id,error:error instanceof Error?error.message:String(error)})}
}

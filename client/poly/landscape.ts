import * as THREE from 'three'
import { biomeAt, TREE_CELL } from '../../shared/biome.ts'
import { hash2, valueNoise } from '../../shared/math.ts'
import { WORLD_W, WORLD_H } from '../../shared/constants.ts'
import { PrimitiveBatch } from './batch.ts'
import { terrainMaterial, waterMaterial, TERRAIN_TEXTURE_PERIOD } from './materials.ts'
import { GroundSurface, groundHeight, type GroundSource, type Footprint } from './surface.ts'
import { loadWorldAssets } from './world-assets.ts'
import { terrainGeometry } from './terrain-mesh.ts'
import type {LandscapeJob,LandscapeData,GeometryData,LandscapeReply} from './landscape-data.ts'
import {landscapeRegion,type LandscapeRegion} from './landscape-region.ts'
export { GroundSurface, groundHeight, type GroundSource, type Footprint } from './surface.ts'

/** Terrain services keep methods on their prototype; object spread loses them. */
export function withRoads(source: GroundSource, roads: GroundSource['roads'], revision: number): GroundSource {
  return { ready: source.ready, revision: (source.revision ?? 0) + revision, roads,
    isLand: (x,y) => source.isLand(x,y), cutAt: source.cutAt ? (x,y) => source.cutAt!(x,y) : undefined,
    graphicsSnapshot:source.graphicsSnapshot?()=>source.graphicsSnapshot!():undefined }
}
export function landColor(x: number, y: number, land: boolean): THREE.Color {
  if (!land) return new THREE.Color('#253e3e')
  const b = biomeAt(x,y)
  return new THREE.Color('#525a37').lerp(new THREE.Color('#9b8962'),b.desert).lerp(new THREE.Color('#b5c1be'),b.polar)
    .lerp(new THREE.Color('#273e2c'),b.forestDensity*.5)
    .multiplyScalar(.78+valueNoise(x/53,y/53,303)*.34)
}
export class Landscape {
  readonly group = new THREE.Group()
  private textureAnchor = new THREE.Vector2()
  private mesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMaterial(this.textureAnchor))
  private sea = waterMaterial()
  private water = new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),this.sea.material)
  private props: PrimitiveBatch
  private cliffs=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:'#777b70',roughness:1,side:THREE.DoubleSide}))
  private distant=new THREE.Mesh(new THREE.BufferGeometry(),terrainMaterial(this.textureAnchor))
  private distantCliffs=new THREE.Mesh(new THREE.BufferGeometry(),this.cliffs.material)
  private forest=new THREE.Group()
  private treeMeshes:THREE.InstancedMesh[]=[]
  bakedTrees=false
  private treeTransforms:Float32Array
  private treeCount=0
  private nearTreeCount=0
  private worker?:Worker
  private workerBusy=false
  private nextJob?:LandscapeJob
  private completed?:LandscapeReply
  private jobId=0
  private key = ''
  private surfaceKey = ''
  private region?: LandscapeRegion
  private anchorX = 0
  private anchorY = 0
  private temp = new THREE.Object3D()
  private color = new THREE.Color()
  private assets?: Awaited<ReturnType<typeof loadWorldAssets>>
  private disposed = false
  assetState: 'loading'|'ready'|'error' = 'loading'
  surface = new GroundSurface({ready:false,isLand:()=>false},[])
  private resolution: number
  private treeBudget: number
  constructor(resolution: number, treeBudget: number) {
    this.resolution = resolution; this.treeBudget = treeBudget
    this.treeTransforms=new Float32Array(treeBudget*16)
    this.props = new PrimitiveBatch(treeBudget * 3 + 12000)
    this.mesh.receiveShadow = true
    this.water.receiveShadow = true
    this.water.position.y = -.25
    this.cliffs.castShadow=true;this.cliffs.receiveShadow=true
    this.distant.receiveShadow=true
    this.group.add(this.mesh,this.props.group,this.water,this.cliffs,this.distant,this.distantCliffs,this.forest)
    if(typeof document!=='undefined'&&typeof Worker!=='undefined') {
      this.worker=new Worker('/landscape-worker.js')
      this.worker.onmessage=(event:MessageEvent<LandscapeReply>)=>this.receive(event.data)
      this.worker.onerror=event=>{this.workerBusy=false;console.error('Landscape worker:',event.message)}
    }
    if(typeof document !== 'undefined')loadWorldAssets().then(assets=>{
      if(this.disposed){assets.dispose();assets.foliageGeometry.dispose();assets.rockGeometry.dispose();assets.foliage.dispose();assets.trunk.dispose();assets.rockMaterial.dispose();return}
      this.assets=assets
      this.bakedTrees=true
      for(const tree of assets.trees) {
        const mesh=new THREE.InstancedMesh(tree.geometry,tree.material,treeBudget)
        mesh.name=tree.material.name==='fir-canopy'?'fir-canopy':'fir-tree';mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false
        this.treeMeshes.push(mesh);this.forest.add(mesh)
      }
      this.props.replace('needles',assets.foliageGeometry,assets.foliage)
      this.props.replace('cylinder',new THREE.CylinderGeometry(.3,.5,1,9),assets.trunk)
      this.props.replace('cliff',assets.rockGeometry,assets.rockMaterial)
      this.mesh.material.map=assets.ground
      this.mesh.material.normalMap=assets.groundNormals
      this.mesh.material.normalScale.set(.3,.3)
      this.mesh.material.needsUpdate=true
      this.distant.material.map=assets.ground
      this.distant.material.normalMap=assets.groundNormals
      this.distant.material.normalScale.set(.3,.3)
      this.distant.material.needsUpdate=true
      this.cliffs.material.map=assets.rockMaterial.map
      this.cliffs.material.normalMap=assets.rockMaterial.normalMap
      this.cliffs.material.normalScale.set(.35,.35)
      for(const t of [this.cliffs.material.map,this.cliffs.material.normalMap])if(t){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true}
      this.cliffs.material.needsUpdate=true
      this.assetState='ready';this.key=''
    }).catch(error=>{this.assetState='error';console.error('World assets failed to load',error)})
  }
  update(x: number, y: number, span: number, source: GroundSource, footprints: Footprint[], time = 0) {
    const region = this.region = landscapeRegion(x,y,span,this.region)
    const surfaceKey = [source.ready,source.revision??0,footprints.map(f=>[f.x,f.y,f.radius,f.waterfront].join(',')).sort().join(';')].join(':')
    if(surfaceKey!==this.surfaceKey){this.surfaceKey=surfaceKey;this.surface=new GroundSurface(source,footprints)}
    const key = [region.x,region.y,region.size,surfaceKey].join(':')
    if (key !== this.key) {
      this.key=key
      this.completed=undefined
      if(this.worker&&source.graphicsSnapshot&&source.ready) {
        this.nextJob={id:++this.jobId,region,resolution:this.resolution,trees:this.treeBudget,source:source.graphicsSnapshot(),roads:source.roads,footprints,revision:source.revision??0}
        this.dispatch()
      } else if(!this.worker) {
        this.prepare(region,source,footprints)
      }
    }
    if(this.completed?.id===this.jobId&&this.completed.data&&this.assetState==='ready'){
      this.restore(this.completed.data);this.completed=undefined
    }
    this.group.position.set(this.anchorX-x,0,this.anchorY-y)
    this.textureAnchor.set(this.anchorX%TERRAIN_TEXTURE_PERIOD,this.anchorY%TERRAIN_TEXTURE_PERIOD)
    this.sea.uniforms.clock.value=time
    this.sea.uniforms.anchor.value.set(x%4096,y%4096)
  }
  /** Workers prepare exactly the region requested by the visible client. */
  prepare(region:LandscapeRegion,source:GroundSource,footprints:Footprint[]) {
    this.anchorX=region.x;this.anchorY=region.y
    this.surface=new GroundSurface(source,footprints)
    this.build(region.x,region.y,region.size,source,footprints)
  }
  private receive(reply:LandscapeReply) {
    this.workerBusy=false
    if(reply.error){console.error('Landscape preparation:',reply.error);if(reply.id===this.jobId)this.key=''}
    if(reply.id===this.jobId&&reply.data)this.completed=reply
    this.dispatch()
  }
  private dispatch() {
    if(!this.worker||this.workerBusy||!this.nextJob)return
    this.workerBusy=true;this.worker.postMessage(this.nextJob);this.nextJob=undefined
  }
  snapshot():LandscapeData {
    const pack=(geometry:THREE.BufferGeometry):GeometryData=>Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,{array:Float32Array.from(a.array),itemSize:a.itemSize}]))
    return {anchorX:this.anchorX,anchorY:this.anchorY,geometry:[this.mesh,this.cliffs,this.distant,this.distantCliffs].map(m=>pack(m.geometry)),props:this.props.snapshot(),trees:this.treeTransforms.slice(0,this.treeCount*16),nearTrees:this.nearTreeCount,coast:Uint8Array.from((this.sea.uniforms.coastMask.value as THREE.DataTexture).image.data as Uint8Array),resolution:this.resolution,waterSize:this.water.scale.x,coastScale:this.sea.uniforms.coastScale.value}
  }
  private restore(data:LandscapeData) {
    for(const [i,mesh] of [this.mesh,this.cliffs,this.distant,this.distantCliffs].entries()) {
      const geometry=new THREE.BufferGeometry()
      for(const [name,a] of Object.entries(data.geometry[i]))geometry.setAttribute(name,new THREE.BufferAttribute(a.array,a.itemSize))
      mesh.geometry.dispose();mesh.geometry=geometry
    }
    this.anchorX=data.anchorX;this.anchorY=data.anchorY
    this.distant.position.y=-1.5;this.distantCliffs.position.y=-1.5
    this.props.restore(data.props)
    this.treeCount=data.trees.length/16;this.treeTransforms.set(data.trees)
    for(const mesh of this.treeMeshes){mesh.instanceMatrix.array.set(data.trees);mesh.count=mesh.name==='fir-canopy'?this.treeCount:data.nearTrees;mesh.instanceMatrix.clearUpdateRanges();if(mesh.count)mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true}
    this.sea.uniforms.coastMask.value.dispose()
    const mask=new THREE.DataTexture(data.coast,data.resolution+1,data.resolution+1)
    mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true
    this.sea.uniforms.coastMask.value=mask;this.sea.uniforms.coastScale.value=data.coastScale
    this.water.scale.setScalar(data.waterSize)
  }
  private build(ax: number, ay: number, size: number, source: GroundSource, footprints: Footprint[]) {
    const n=this.resolution,step=size/n
    const coast=new Uint8Array((n+1)*(n+1)*4)
    const sample=(x:number,y:number)=>source.ready&&x>=0&&y>=0&&x<=WORLD_W&&y<=WORLD_H&&source.isLand(x,y)
    for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++) {
      const x=ax-size/2+ix*step,y=ay-size/2+iz*step,land=sample(x,y)
      const offset=(iz*(n+1)+ix)*4
      coast[offset]=coast[offset+1]=coast[offset+2]=land?255:0;coast[offset+3]=255
    }
    const farSize=Math.max(16384,size*4)
    const built=terrainGeometry(ax,ay,size,n,this.surface,landColor,0,{step:farSize/128,offset:-1.5})
    this.mesh.geometry.dispose();this.mesh.geometry=built.geometry
    this.cliffs.geometry.dispose();this.cliffs.geometry=built.cliffGeometry
    const far=terrainGeometry(ax,ay,farSize,128,this.surface,landColor,size)
    this.distant.geometry.dispose();this.distant.geometry=far.geometry
    this.distantCliffs.geometry.dispose();this.distantCliffs.geometry=far.cliffGeometry
    this.distant.position.y=-1.5;this.distantCliffs.position.y=-1.5
    this.sea.uniforms.coastMask.value.dispose()
    const mask=new THREE.DataTexture(coast,n+1,n+1)
    mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true
    this.sea.uniforms.coastMask.value=mask
    this.water.scale.set(farSize,farSize,farSize)
    this.sea.uniforms.coastScale.value=farSize/size
    this.props.clear()
    let scannedTrees=0
    this.nearTreeCount=0
    this.treeMeshes.forEach(mesh=>{mesh.count=0})
    // Continuous cliff faces carry the coastline; scanned buttresses and sea
    // stacks break its silhouette at several physical scales.
    let shoreTravel=0
    for(const edge of built.shore) {
      const length=Math.hypot(edge.bx-edge.ax,edge.by-edge.ay)
      shoreTravel+=length
      if(shoreTravel<18)continue
      shoreTravel=0
      const x=(edge.ax+edge.bx)/2,y=(edge.ay+edge.by)/2
      // Far coasts use the continuous cliff mesh; detailed rock assets stay
      // near the prepared centre instead of multiplying with the buffer size.
      if(Math.hypot(x-ax,y-ay)>1800)continue
      let nx=-(edge.by-edge.ay)/Math.max(.01,length),ny=(edge.bx-edge.ax)/Math.max(.01,length)
      if(sample(x+nx*4,y+ny*4)){nx=-nx;ny=-ny}
      const random=hash2(Math.floor(x/8),Math.floor(y/8),733)
      const h=edge.height,w=30+random*22
      for(let tier=0;tier<3;tier++)this.add('cliff',x-ax+nx*(9-tier*2),h*(.13+tier*.29),y-ay+ny*(9-tier*2),w,18+random*10,w*.75,'#adb6a6',random*6.28+tier*.7)
      this.add('cliff',x-ax+nx*(24+random*17),3+random*3,y-ay+ny*(24+random*17),17+random*18,8+random*6,12+random*18,'#899b96',random*3)
    }
    for(const road of source.roads??[])this.road(road,ax,ay)
    if(size<=32768) {
      // Keep the server's wood cells and felling state; only geometric LOD changes.
      const stride=Math.max(1,Math.ceil(size/(TREE_CELL*230))),cell=TREE_CELL*stride
      let trees=0
      const clear=(x:number,y:number)=> (source.roads??[]).some(r=>Math.abs(x-r.x)<r.width/2+3&&Math.abs(y-r.y)<r.depth/2+3)
        ||footprints.some(f=>Math.hypot(x-f.x,y-f.y)<f.radius+3)
      const candidates:{x:number,y:number,ix:number,iy:number,d:number}[]=[]
      for(let cy=Math.floor((ay-size/2)/cell);cy<=(ay+size/2)/cell;cy++)for(let cx=Math.floor((ax-size/2)/cell);cx<=(ax+size/2)/cell;cx++) {
        const ix=cx*stride,iy=cy*stride,x=(ix+hash2(ix,iy,43))*TREE_CELL,y=(iy+hash2(ix,iy,47))*TREE_CELL
        candidates.push({x,y,ix,iy,d:(x-ax)**2+(y-ay)**2})
      }
      candidates.sort((a,b)=>a.d-b.d)
      for(const c of candidates) {
        if(trees>=this.treeBudget)break
        if(!sample(c.x,c.y)||clear(c.x,c.y))continue
        const b=biomeAt(c.x,c.y),h=this.surface.height(c.x,c.y),cut=source.cutAt?.(c.x,c.y)??0
        const r=2.6+hash2(c.ix,c.iy,53)*2.4
        if(hash2(c.ix,c.iy,41)<=b.forestDensity*(1-cut)) {
          // A tree is drawn at the canopy radius the wood model already uses
          // instead of twice it: scatter reads as ground cover next to the
          // units fighting in it, not as the tallest thing on the field.
          const height=9+hash2(c.ix,c.iy,59)*7
          const shade=this.color.set('#23392c').lerp(new THREE.Color('#697548'),hash2(c.ix,c.iy,61)*.8)
          if(b.polar>.5)shade.lerp(new THREE.Color('#a9b6a9'),.45)
          const turn=hash2(c.ix,c.iy,67)*6.28
          if(this.bakedTrees) {
            this.temp.position.set(c.x-ax,h,c.y-ay);this.temp.rotation.set(0,turn,0);this.temp.scale.set(r*2.1,height,r*2.1);this.temp.updateMatrix()
            for(const mesh of this.treeMeshes)mesh.setMatrixAt(scannedTrees,this.temp.matrix)
            this.treeTransforms.set(this.temp.matrix.elements,scannedTrees*16)
            if(c.d<700*700)this.nearTreeCount++
            scannedTrees++
          } else {
            this.add('cylinder',c.x-ax,h+height*.35,c.y-ay,.4,height*.7,.4,'#554632')
            this.add('pine',c.x-ax,h,c.y-ay,r*1.9,height,r*1.9,shade,turn)
          }
          trees++
        } else if(b.rockField>.66&&hash2(c.ix,c.iy,707)>.945) {
          // Outcrops mark rocky ground; they are knee-high stones, not cover.
          this.add('rock',c.x-ax,h+r*.05,c.y-ay,r*.8,r*.5,r*.65,'#7b7d73',hash2(c.ix,c.iy,719)*6.28)
          trees++
        }
        // Brush is texture on the ground, not an object on it: a single low
        // tuft, rare enough to leave open ground, in the ground's own colour.
        if(c.d<520*520&&b.desert<.3&&b.polar<.5&&hash2(c.ix,c.iy,743)>.94) {
          const shrub=hash2(c.ix,c.iy,751),tint=this.color.set('#4f5a3d').lerp(new THREE.Color('#6f7554'),shrub)
          this.add('rock',c.x-ax,h+.4,c.y-ay,1.3+shrub*1.3,.8+shrub*.7,1.3+shrub*1.2,tint,shrub*6.28)
        }
      }
    }
    this.treeCount=scannedTrees
    this.treeMeshes.forEach(mesh=>{mesh.count=mesh.name==='fir-canopy'?scannedTrees:this.nearTreeCount;mesh.instanceMatrix.needsUpdate=true})
    this.props.flush()
  }
  private road(road: NonNullable<GroundSource['roads']>[number],ax:number,ay:number) {
    const alongX=road.width>road.depth,length=alongX?road.width:road.depth,width=alongX?road.depth:road.width
    const count=Math.max(1,Math.ceil(length/10)),segment=length/count
    for(let i=0;i<count;i++) {
      const t=(i+.5)*segment-length/2,x=road.x+(alongX?t:0),y=road.y+(alongX?0:t)
      const h0=this.surface.height(x-(alongX?segment/2:0),y-(alongX?0:segment/2))
      const h1=this.surface.height(x+(alongX?segment/2:0),y+(alongX?0:segment/2))
      const h=(h0+h1)/2+.22,tilt=Math.atan2(h1-h0,segment),length3d=Math.hypot(segment,h1-h0)
      const add=(dx:number,dz:number,w:number,d:number,lift:number,color:string)=>{
        this.temp.position.set(x-ax+dx,h+lift,y-ay+dz)
        this.temp.rotation.set(alongX?0:-tilt,0,alongX?tilt:0)
        this.temp.scale.set(w,.16,d);this.temp.updateMatrix();this.props.add('box',this.temp.matrix,color)
      }
      add(0,0,alongX?length3d+.1:width,alongX?width:length3d+.1,0,'#444a46')
      if(i%2===0&&width>=5)add(0,0,alongX?length3d*.45:.14,alongX?.14:length3d*.45,.09,'#b7ac7e')
      for(const side of [-1,1])add(alongX?0:side*(width/2+.25),alongX?side*(width/2+.25):0,alongX?length3d:.45,alongX?.45:length3d,.08,'#7a7d70')
    }
  }
  private add(shape:'box'|'cylinder'|'pine'|'rock'|'cliff'|'needles',x:number,y:number,z:number,w:number,h:number,d:number,color:string|THREE.Color,rotation=0) {
    this.temp.position.set(x,y,z);this.temp.rotation.set(0,rotation,0);this.temp.scale.set(w,h,d);this.temp.updateMatrix()
    this.props.add(shape,this.temp.matrix,color)
  }
  dispose() {this.disposed=true;this.worker?.terminate();this.mesh.geometry.dispose();this.mesh.material.dispose();this.cliffs.geometry.dispose();this.cliffs.material.dispose();this.distant.geometry.dispose();this.distant.material.dispose();this.distantCliffs.geometry.dispose();this.water.geometry.dispose();this.water.material.dispose();this.sea.uniforms.coastMask.value.dispose();this.props.dispose();this.treeMeshes.forEach(m=>m.dispose());this.assets?.dispose();this.group.clear()}
}

import assert from 'node:assert/strict'
import { Context } from 'cordis'
import {Worker} from 'node:worker_threads'
import {once} from 'node:events'
import * as THREE from 'three'
import { Camera } from '../client/camera.ts'
import { BUILDINGS, DEFS } from '../shared/data.ts'
import { makeModel } from '../client/poly/models.ts'
import { drawModelIcon } from '../client/poly/model-icon.ts'
import { drawIcon } from '../client/sprites.ts'
import { PrimitiveBatch } from '../client/poly/batch.ts'
import { graphicsSettings, BUDGETS } from '../client/poly/settings.ts'
import { groundHeight, GroundSurface, Landscape, withRoads } from '../client/poly/landscape.ts'
import { foliageGeometry,treeCrownGeometry } from '../client/poly/nature.ts'
import {visibleSightDiscs,sightClearsViewport} from '../client/visibility-mask.ts'
import {worldGroundSource,worldLandAt} from '../client/poly/world-ground.ts'
import {CELL,GRID_W,GRID_H} from '../shared/constants.ts'
import {patchKey} from '../shared/nodes.ts'
import { terrainGeometry } from '../client/poly/terrain-mesh.ts'
import { SCENES, demoEntities } from '../client/poly/demo.ts'
import { landscapeRegion } from '../client/poly/landscape-region.ts'

let passed = 0
const check = (name, fn) => { fn(); passed++; console.log('  OK    ' + name) }
const ctx = new Context(), cam = new Camera(ctx)
cam.resize(1280, 720)
check('Ground projection round trips at every detail transition', () => {
  for (const mpp of [.01, .02, .25, 60, 100, 159, 160, 20000]) {
    cam.moveTo(20e6, 10e6, mpp)
    for (const [sx, sy] of [[0, 0], [640, 360], [1110, 660]]) {
      const p = cam.worldToScreen(...cam.screenToWorld(sx, sy))
      assert.ok(Math.hypot(p[0] - sx, p[1] - sy) < 1e-6)
    }
  }
})
check('The live camera can resolve small robots without enlarging their footprint', () => {
  cam.moveTo(20e6,10e6,cam.minMpp)
  assert.ok(DEFS.robot_dog.size/cam.mpp>50)
  assert.equal(cam.mpp,.01)
})
check('Tactical view is vertical at every zoom, with equal scale on both ground axes', () => {
  cam.perspective=false
  cam.heightAt=(x,y)=>300+180*Math.sin(x/240)*Math.cos(y/190)
  for(const mpp of [.01,.05,.5,8,60,90,159,160,20000]) {
    cam.moveTo(22e6,5e6,mpp)
    assert.equal(cam.groundScale,1)
    assert.equal(cam.viewDistance,Infinity,'tactical view has no perspective distortion')
    const rect=cam.viewRect()
    assert.ok(Math.abs(rect.x1-rect.x0-cam.width*mpp)<1e-6)
    assert.ok(Math.abs(rect.y1-rect.y0-cam.height*mpp)<1e-6)
    for(const [sx,sy] of [[0,0],[640,360],[1110,660]]) {
      const [x,y]=cam.screenToWorld(sx,sy)
      assert.ok(Math.abs(x-(cam.x+(sx-cam.width/2)*mpp))<1e-7)
      assert.ok(Math.abs(y-(cam.y+(sy-cam.height/2)*mpp))<1e-7,'terrain height must not move a top-down pick')
      const projected=cam.worldToScreen(x,y)
      assert.ok(Math.hypot(projected[0]-sx,projected[1]-sy)<1e-6)
    }
  }
  cam.moveTo(22e6,5e6,2)
  const anchor=cam.screenToWorld(880,420)
  cam.zoomBy(.25,880,420)
  for(let i=0;i<120;i++)cam.update(.05)
  assert.ok(Math.hypot(...cam.screenToWorld(880,420).map((v,i)=>v-anchor[i]))<1e-6)
  const x=cam.x,y=cam.y,mpp=cam.mpp
  cam.panPixels(30,30)
  assert.ok(Math.abs(cam.x-x-30*mpp)<1e-7&&Math.abs(cam.y-y-30*mpp)<1e-7)
  cam.perspective=true
  assert.ok(cam.groundScale<1&&Number.isFinite(cam.viewDistance),'world view keeps its inclined perspective')
  cam.perspective=false;cam.heightAt=()=>0
})
check('Zoom retains the ground point while camera tilt changes', () => {
  cam.moveTo(20e6, 10e6, 100)
  const before = cam.screenToWorld(830, 530)
  cam.zoomBy(.5, 830, 530)
  for (let i = 0; i < 100; i++) cam.update(.05)
  const after = cam.screenToWorld(830, 530)
  assert.ok(Math.hypot(before[0] - after[0], before[1] - after[1]) < 1e-6)
})
check('Every game definition has finite, bounded, non-degenerate geometry', () => {
  for (const def of Object.values(DEFS)) {
    const model = makeModel(def)
    assert.ok(model.length >= 5 && model.length < 220, def.id)
    for (const p of model) {
      assert.ok([...p.p, ...p.s, ...p.r].every(Number.isFinite), def.id)
      assert.ok(p.s.every(n => n > 0 && n < 5), def.id)
    }
  }
})
check('Character roles and transports have distinct models', () => {
  const ids = ['service_robot', 'robot_dog', 'recon_drone', 'rifleman', 'medic', 'engineer', 'sniper', 'rocketeer', 'mbt', 'apc', 'gunship', 'submarine', 'worker', 'housing', 'farm', 'civic_workshop', 'school', 'training_center', 'office', 'skyscraper', 'market_hall']
  assert.equal(new Set(ids.map(id => JSON.stringify(makeModel(DEFS[id])))).size, ids.length)
})
check('Every building has distinct architecture even without colour or small decorations', () => {
  const seen = new Map()
  for (const def of BUILDINGS) {
    // Ignore plaques, antennae and surface trim: the main volumes must differ.
    const volumes = makeModel(def).filter(p => p.s[0]*p.s[1]*p.s[2] > .012)
      .map(({shape,p,s,r}) => JSON.stringify([shape,...p,...s,...r].map(v => typeof v==='number' ? Math.round(v*100)/100 : v))).sort()
    assert.ok(volumes.length > 0, def.id + ' needs recognizable architecture')
    const signature = volumes.join(';')
    assert.ok(!seen.has(signature), def.id + ' shares its main volumes with ' + seen.get(signature))
    seen.set(signature, def.id)
  }
})
check('Every building menu icon projects its actual world model and fits the thumbnail', () => {
  const documentBefore = globalThis.document, signatures = new Set()
  const recording = () => {
    const faces = []; let path = []
    const context = {
      createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
      beginPath() { path = [] }, moveTo(x,y) { path.push([x,y]) }, lineTo(x,y) { path.push([x,y]) }, closePath() {},
      fill() { faces.push(path) },
    }
    return {faces,context}
  }
  try {
    for(const def of BUILDINGS) {
      const actual = recording(), expected = recording()
      globalThis.document = {createElement: () => ({getContext: () => actual.context})}
      const canvas = drawIcon(def,'#be9f45',68,42)
      drawModelIcon(expected.context,def,'#be9f45',68,42)
      assert.equal(canvas.width,68); assert.equal(canvas.height,42)
      assert.deepEqual(actual.faces,expected.faces,def.id+' must use the shared 3D model')
      assert.ok(actual.faces.length>10,def.id)
      for(const path of actual.faces)for(const [x,y] of path)assert.ok(x>=0&&x<=68&&y>=0&&y<=42,def.id+' icon is clipped')
      signatures.add(JSON.stringify(actual.faces))
    }
    assert.equal(signatures.size,BUILDINGS.length,'building icons must not repeat')
  } finally {
    if(documentBefore===undefined)delete globalThis.document
    else globalThis.document=documentBefore
  }
})
check('Every 3D model including rotating parts fits its physical collision footprint', () => {
  const part=new THREE.Object3D(),v=new THREE.Vector3()
  for(const def of Object.values(DEFS))for(const p of makeModel(def))for(const angle of [-.28,0,.28,Math.PI/2]) {
    part.position.fromArray(p.p);part.rotation.set(...p.r);part.scale.fromArray(p.s)
    if(p.motion==='strideL'||p.motion==='strideR') {part.rotation.z+=Math.max(-.28,Math.min(.28,angle));part.position.x+=Math.max(-.28,Math.min(.28,angle))*.4}
    if(p.motion==='rotor'||p.motion==='radar')part.rotation.y+=angle
    part.updateMatrix()
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]) {
      v.set(x,y,z).applyMatrix4(part.matrix)
      assert.ok(Math.hypot(v.x,v.z)<=1.00001,def.id+' exceeds its ground footprint')
    }
  }
})
check('The airfield charging pad has no roof over a parked drone',()=>{
  for(const part of makeModel(DEFS.airfield)) {
    const coversCentre=Math.abs(part.p[0])<part.s[0]/2&&Math.abs(part.p[2])<part.s[2]/2
    if(coversCentre)assert.ok((part.p[1]+part.s[1]/2)*DEFS.airfield.size<.2)
  }
})
check('Instances cannot overrun their buffer; clearing removes stale units', () => {
  const batch = new PrimitiveBatch(2), matrix = new THREE.Matrix4()
  assert.equal(batch.add('box', matrix, '#ffffff'), true)
  assert.equal(batch.add('box', matrix, '#ffffff'), true)
  assert.equal(batch.add('box', matrix, '#ffffff'), false)
  batch.flush(); assert.equal(batch.group.children.find(x => x.name === 'box').count, 2)
  batch.clear(); batch.flush(); assert.equal(batch.count, 0)
  assert.ok(batch.group.children.every(x => x.count === 0))
  batch.dispose()
})
check('Reduced motion honours OS preference and explicit URL choice', () => {
  assert.equal(graphicsSettings('', true).motion, false)
  assert.equal(graphicsSettings('?motion=on', true).motion, true)
  assert.equal(graphicsSettings('?motion=off', false).motion, false)
  assert.equal(graphicsSettings('').quality,'high')
  assert.equal(graphicsSettings('?quality=balanced').quality,'balanced')
  assert.equal(graphicsSettings('?quality=unknown').quality, 'high')
  assert.ok(BUDGETS.low.detailed < BUDGETS.high.detailed)
})
check('Terrain stays deterministic across cameras and geometry updates', () => {
  const expected = groundHeight(22e6, 5e6)
  assert.equal(expected, groundHeight(22e6, 5e6))
  const terrain = new Landscape(8, 20)
  const source = { ready: true, revision: 0, isLand: () => true }
  terrain.update(22e6, 5e6, 100, source, [])
  const geometry = terrain.group.children[0].geometry
  terrain.update(22e6, 5e6, 100, source, [])
  assert.equal(terrain.group.children[0].geometry, geometry, 'idle terrain reuses geometry')
  source.revision++
  terrain.update(22e6, 5e6, 100, source, [])
  assert.notEqual(terrain.group.children[0].geometry, geometry, 'changed terrain invalidates geometry')
  const positions = terrain.group.children[0].geometry.getAttribute('position')
  assert.equal(positions.count, 8 * 8 * 6)
  assert.ok([...positions.array].every(Number.isFinite))
  terrain.dispose()
})
check('Small pans and zoom reversals retain the prepared ground and vegetation', () => {
  const terrain = new Landscape(8, 100)
  const source = { ready: true, revision: 0, isLand: () => true }
  terrain.update(22e6, 5e6, 2400, source, [])
  const geometry = terrain.group.children[0].geometry
  const trees = terrain.snapshot().props
  const surface = terrain.surface
  for (const [x, y, span] of [[22e6 + 200, 5e6, 2500], [22e6 - 200, 5e6 + 200, 2300], [22e6, 5e6, 2400]]) {
    terrain.update(x, y, span, source, [])
    assert.ok(terrain.group.children[0].geometry === geometry, 'no replacement while the prepared patch covers the view')
    assert.equal(terrain.surface, surface, 'camera picking keeps the same physical surface')
    assert.deepEqual(terrain.snapshot().props, trees, 'nearby vegetation does not repopulate')
  }
  terrain.dispose()
})
check('Prepared regions cover the viewport and retain a margin before recentering', () => {
  let region
  for (const span of [128, 2400, 2600, 2400, 8000, 7900, 1200]) {
    for (const x of [22e6, 22e6 + 600, 22e6 + 2000]) {
      region = landscapeRegion(x, 5e6, span, region)
      assert.ok(Math.abs(x - region.x) + span / 2 <= region.size * .4)
      assert.ok(Math.abs(5e6 - region.y) + span / 2 <= region.size * .4)
    }
  }
  const initial = landscapeRegion(22e6, 5e6, 2400)
  const larger = landscapeRegion(22e6, 5e6, 8000, initial)
  assert.ok(larger.size > initial.size)
  assert.equal(landscapeRegion(22e6, 5e6, 5000, larger), larger, 'reversing zoom does not immediately switch back')
})
check('The distant terrain ring never draws over the near patch', () => {
  const terrain = new Landscape(8, 10)
  terrain.update(22e6, 5e6, 2400, { ready: true, isLand: () => true }, [])
  const data = terrain.snapshot()
  const half = data.waterSize / data.coastScale / 2
  const vertices = data.geometry[2].position.array
  for (let i = 0; i < vertices.length; i += 9) {
    const x = (vertices[i] + vertices[i + 3] + vertices[i + 6]) / 3
    const y = (vertices[i + 2] + vertices[i + 5] + vertices[i + 8]) / 3
    assert.ok(Math.abs(x) >= half || Math.abs(y) >= half, 'overlapping ground surfaces cause flicker at distant zoom')
  }
  terrain.dispose()
})
check('The near terrain rim joins the coarse ring without a height step', () => {
  const surface = new GroundSurface({ ready: true, isLand: () => true }, [])
  const size = 2048, step = 256, ax = 22e6, ay = 5e6
  const terrain = terrainGeometry(ax, ay, size, 32, surface, () => new THREE.Color('green'), 0, { step, offset: -1.5 })
  const far = terrainGeometry(ax, ay, size * 4, 32, surface, () => new THREE.Color('green'), size)
  const farPositions = far.geometry.getAttribute('position'), farIndices = new Map()
  for (let i = 0; i < farPositions.count; i++) farIndices.set(`${farPositions.getX(i)}:${farPositions.getZ(i)}`, i)
  const positions = terrain.geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getZ(i)
    if (Math.abs(x) !== size / 2 && Math.abs(y) !== size / 2) continue
    const along = Math.abs(x) === size / 2 ? y : x
    const a = Math.floor(along / step) * step, fraction = (along - a) / step
    const sample = d => Math.abs(x) === size / 2 ? surface.height(ax + x, ay + d) : surface.height(ax + d, ay + y)
    assert.ok(Math.abs(positions.getY(i) - (sample(a) * (1 - fraction) + sample(a + step) * fraction - 1.5)) < .0001)
    const index = d => farIndices.get(Math.abs(x) === size / 2 ? `${x}:${d}` : `${d}:${y}`)
    for (const name of ['normal', 'color']) for (const component of ['getX', 'getY', 'getZ']) {
      const attribute = far.geometry.getAttribute(name)
      const expected = attribute[component](index(a)) * (1 - fraction) + attribute[component](index(a + step)) * fraction
      assert.ok(Math.abs(terrain.geometry.getAttribute(name)[component](i) - expected) < .000001, `${name} matches across the rim`)
    }
  }
  terrain.geometry.dispose(); terrain.cliffGeometry.dispose()
  far.geometry.dispose(); far.cliffGeometry.dispose()
})
check('Ground texture coordinates remain continuous across world wrap boundaries', () => {
  const surface = new GroundSurface({ ready: true, isLand: () => true }, [])
  const terrain = terrainGeometry(7168, 7168, 128, 8, surface, () => new THREE.Color('green'))
  const p = terrain.geometry.getAttribute('position'), uv = terrain.geometry.getAttribute('uv')
  for (let i = 0; i < p.count; i += 3) for (let j = 1; j < 3; j++) {
    assert.ok(Math.abs((uv.getX(i + j) - uv.getX(i)) * 28 - (p.getX(i + j) - p.getX(i))) < .0001)
    assert.ok(Math.abs((uv.getY(i + j) - uv.getY(i)) * 28 - (p.getZ(i + j) - p.getZ(i))) < .0001)
  }
  terrain.geometry.dispose(); terrain.cliffGeometry.dispose()
})
check('Padded regions keep trees at normal zoom levels on large screens', () => {
  const terrain = new Landscape(8, 100)
  terrain.bakedTrees = true
  terrain.prepare({ x: 22_100_000, y: 5_200_000, size: 16384 }, { ready: true, isLand: () => true }, [])
  assert.ok(terrain.snapshot().trees.length > 0)
  terrain.dispose()
})
check('Late worker results cannot replace the current view and requests coalesce', () => {
  const terrain = new Landscape(8, 10), prepared = new Landscape(8, 10), jobs = []
  const source = { ready: true, isLand: () => true, graphicsSnapshot: () => ({ kind: 'demo', scene: 'concept' }) }
  prepared.prepare(landscapeRegion(22e6, 5e6, 2400), source, [])
  const data = prepared.snapshot()
  terrain.worker = { postMessage: job => jobs.push(job), terminate() {} }
  terrain.assetState = 'ready'
  const initial = terrain.group.children[0].geometry
  terrain.update(22e6, 5e6, 2400, source, [])
  terrain.update(22e6 + 10000, 5e6, 2400, source, [])
  terrain.update(22e6 + 20000, 5e6, 2400, source, [])
  assert.equal(jobs.length, 1, 'only one worker build runs at a time')
  terrain.receive({ id: jobs[0].id, data })
  assert.equal(jobs.length, 2, 'only the latest queued view is dispatched')
  assert.equal(jobs[1].id, 3)
  terrain.update(22e6 + 20000, 5e6, 2400, source, [])
  assert.ok(terrain.group.children[0].geometry === initial, 'superseded result was not uploaded')
  terrain.receive({ id: jobs[1].id, data: { ...data, anchorX: jobs[1].region.x, anchorY: jobs[1].region.y } })
  terrain.update(22e6 + 20000, 5e6, 2400, source, [])
  assert.equal(terrain.snapshot().anchorX, jobs[1].region.x)
  const displayed = terrain.group.children[0].geometry
  terrain.update(22e6 + 30000, 5e6, 2400, source, [])
  assert.ok(terrain.group.children[0].geometry === displayed, 'existing terrain stays visible while preparing the next view')
  terrain.dispose(); prepared.dispose()
})
check('Road rendering preserves prototype terrain methods and their receiver',()=>{
  class Terrain { ready=true;revision=3;edge=100;isLand(x,y){return x<this.edge&&y<this.edge}cutAt(x){return x/this.edge} }
  const source=new Terrain(),ground=withRoads(source,[],4)
  assert.equal(ground.isLand(20,30),true);assert.equal(ground.isLand(120,30),false)
  assert.equal(ground.cutAt(10,0),.1);assert.equal(ground.revision,7)
  const terrain=new Landscape(8,20);terrain.update(0,0,100,ground,[]);terrain.dispose()
})
check('All preview scenes use the actual game model definitions', () => {
  for (const s of SCENES) for (const e of demoEntities(s.id)) assert.equal(e.def, DEFS[e.type])
  const buildings = demoEntities('buildings')
  assert.deepEqual(buildings.map(e=>e.type).sort(), BUILDINGS.map(d=>d.id).sort())
  assert.equal(new Set(buildings.map(e=>e.owner+':'+e.heading)).size,1)
  for(const a of buildings)for(const b of buildings)if(a.id!==b.id) {
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.def.size+b.def.size,'comparison buildings must not overlap')
  }
  assert.equal(demoEntities('crowd').length, 2000)
  assert.deepEqual([...new Set(demoEntities('robotics').map(e=>e.type))],['service_robot','robot_dog','recon_drone'])
  assert.equal(makeModel(DEFS.recon_drone).filter(p=>p.motion==='rotor').length,4)
  assert.ok(makeModel(DEFS.robot_dog).filter(p=>p.motion==='strideL').length>=4)
})
check('Perspective overlay projection matches the actual Three.js camera',()=>{
  cam.perspective=true;cam.heightAt=(x,y)=>groundHeight(x,y)
  for(const mpp of [.05,.5,8,90,159]) {
    cam.moveTo(22e6,5e6,mpp)
    const camera=new THREE.PerspectiveCamera(2*Math.atan(cam.height*mpp/2/cam.viewDistance)*180/Math.PI,cam.width/cam.height,.01,cam.viewDistance*4)
    const scale=cam.groundScale,rise=Math.sqrt(1-scale*scale),distance=cam.viewDistance
    camera.position.set(0,cam.viewHeight+scale*distance,rise*distance)
    camera.up.set(0,0,-1);camera.lookAt(0,cam.viewHeight,0);camera.updateMatrixWorld()
    for(const [sx,sy] of [[100,100],[640,360],[1100,600]]) {
      const [x,y]=cam.screenToWorld(sx,sy)
      const screen=cam.worldToScreen(x,y)
      assert.ok(Math.hypot(screen[0]-sx,screen[1]-sy)<.001,'pointer/overlay round trip at '+mpp)
      const p=new THREE.Vector3(x-cam.x,cam.heightAt(x,y),y-cam.y).project(camera)
      assert.ok(Math.hypot((p.x+1)*cam.width/2-sx,(1-p.y)*cam.height/2-sy)<.001,'WebGL/overlay agreement at '+mpp)
    }
  }
  cam.perspective=false;cam.heightAt=()=>0
})
check('Zoom stays anchored to raised ground in perspective mode',()=>{
  cam.perspective=true;cam.heightAt=groundHeight;cam.moveTo(22e6,5e6,2)
  const before=cam.screenToWorld(880,420)
  cam.zoomBy(.25,880,420)
  for(let i=0;i<120;i++)cam.update(.05)
  const after=cam.screenToWorld(880,420)
  assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])<.001)
  cam.perspective=false;cam.heightAt=()=>0
})
check('Building pads are level and water remains at sea level',()=>{
  const x=22e6,y=5e6,source={ready:true,isLand:(wx)=>wx>x-100}
  const surface=new GroundSurface(source,[{x,y,radius:35}])
  assert.equal(surface.height(x-101,y),0)
  const height=surface.height(x,y)
  for(const dx of [-25,0,25])for(const dy of [-10,0,10])assert.equal(surface.height(x+dx,y+dy),height)
  assert.ok(height>2)
})
check('Felled forest cells remove both trunks and canopy geometry',()=>{
  const terrain=new Landscape(16,250)
  let cut=0
  const source={ready:true,revision:0,isLand:()=>true,cutAt:()=>cut}
  terrain.update(22_100_000,5_200_000,500,source,[])
  const props=terrain.group.children[1]
  const count=()=>props.children.filter(m=>m.name==='pine'||m.name==='cylinder').reduce((n,m)=>n+m.count,0)
  assert.ok(count()>0)
  cut=1;source.revision++
  terrain.update(22_100_000,5_200_000,500,source,[])
  assert.equal(count(),0)
  terrain.dispose()
})
check('Needle geometry has bounded vertices, valid UVs and surface normals',()=>{
  const geometry=foliageGeometry(),positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv')
  assert.ok(positions.count>200&&positions.count<3000)
  assert.ok([...positions.array].every(Number.isFinite))
  assert.ok([...uv.array].every(n=>n>=0&&n<=1))
  assert.equal(geometry.getAttribute('normal').count,positions.count)
  geometry.dispose()
})
check('Coastal triangles follow a diagonal shoreline without grid steps',()=>{
  const surface=new GroundSurface({ready:true,isLand:(x,y)=>x>y*.31+7},[])
  const built=terrainGeometry(0,0,100,10,surface,()=>new THREE.Color('#556644'))
  assert.ok(built.shore.length>10)
  for(const edge of built.shore)for(const [x,y] of [[edge.ax,edge.ay],[edge.bx,edge.by]])assert.ok(Math.abs(x-y*.31-7)<.02)
  assert.ok(built.cliffGeometry.getAttribute('position').count>0)
  for(const geo of [built.geometry,built.cliffGeometry]){
    assert.ok([...geo.getAttribute('position').array].every(Number.isFinite));assert.ok([...geo.getAttribute('normal').array].every(Number.isFinite));geo.dispose()
  }
})
check('Horizon picking is finite and returns the forward world, never behind the camera',()=>{
  cam.perspective=true;cam.heightAt=()=>0;cam.moveTo(22e6,5e6,.5)
  const p=cam.screenToWorld(640,0)
  assert.ok(p.every(Number.isFinite));assert.ok(p[1]<cam.y)
  assert.ok(Object.values(cam.viewRect()).every(Number.isFinite))
  cam.perspective=false
})
check('Military silhouettes carry facade, roof and logistics details within their budget',()=>{
  for(const id of ['command','factory','radar','power','barracks'])assert.ok(makeModel(DEFS[id]).length>120,id)
  const radar=makeModel(DEFS.radar),dome=radar.find(p=>p.shape==='dome')
  assert.ok(dome.p[1]>1)
  assert.notDeepEqual(makeModel(DEFS.shipyard),makeModel(DEFS.factory))
})
check('GPU uploads cover occupied instances and worker snapshots retain transforms and colors',()=>{
  const batch=new PrimitiveBatch(32),copy=new PrimitiveBatch(32),matrix=new THREE.Matrix4().makeTranslation(4,8,12)
  batch.add('box',matrix,'#446655');batch.flush()
  const mesh=batch.group.children.find(m=>m.name==='box')
  assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:0,count:16}])
  assert.deepEqual(mesh.instanceColor.updateRanges,[{start:0,count:3}])
  const data=batch.snapshot();copy.restore(data)
  assert.deepEqual(copy.snapshot(),data)
  batch.clear();batch.flush();copy.restore(batch.snapshot())
  assert.equal(copy.count,0);assert.ok(copy.group.children.every(m=>m.count===0))
  assert.throws(()=>copy.restore([{...data[0],count:33}]),/budget/)
  batch.dispose();copy.dispose()
})
check('Cached camera bounds invalidate on movement and changed ground, not on overlay margins',()=>{
  let samples=0
  cam.perspective=true;cam.heightAt=()=>{samples++;return 20};cam.moveTo(22e6,5e6,2)
  const rect=cam.viewRect(),count=samples,expanded=cam.viewRect(10)
  assert.equal(samples,count);assert.equal(expanded.x0,rect.x0-10)
  cam.panPixels(10,0);cam.viewRect();assert.ok(samples>count)
  const moved=samples;cam.heightAt=()=>{samples++;return 30};cam.viewRect();assert.ok(samples>moved)
  cam.perspective=false;cam.heightAt=()=>0
})
check('Visibility pruning preserves feathered edges and elliptical viewport coverage',()=>{
  const outer={x:100,y:100,r:100},inner={x:100,y:110,r:20},edge={x:160,y:100,r:30}
  assert.deepEqual(visibleSightDiscs([inner,outer,edge],.4),[outer,edge])
  assert.equal(sightClearsViewport({x:50,y:20,r:100},100,40,.4),true)
  assert.equal(sightClearsViewport({x:50,y:20,r:100},100,80,.4),false)
})
check('Baked canopy retains four complete texture views at bounded geometry cost',()=>{
  const g=treeCrownGeometry(),p=g.getAttribute('position'),uv=g.getAttribute('uv')
  assert.equal(p.count,24);assert.ok([...p.array].every(Number.isFinite))
  assert.ok([...uv.array].every(v=>v>=0&&v<=1))
  assert.equal(new Set(Array.from({length:4},(_,i)=>uv.getX(i*6)+':'+uv.getY(i*6))).size,4)
  g.dispose()
})
check('Plain terrain data retains map bounds and current felling state in worker snapshots',()=>{
  const mask={isLandCell:(x,y)=>x===GRID_W-1&&y===GRID_H-1},cuts=new Map(),source=worldGroundSource(mask,cuts,17)
  assert.equal(worldLandAt(undefined,0,0),false)
  assert.equal(source.isLand(-10,-10),false)
  assert.equal(source.isLand(CELL*GRID_W+100,CELL*GRID_H+100),true)
  cuts.set(patchKey(22e6,5e6),.75)
  assert.equal(source.cutAt(22e6,5e6),.75)
  assert.deepEqual(source.graphicsSnapshot(),{kind:'world',cuts:[...cuts]})
  assert.equal(source.revision,17)
})
check('Batched projection equals individual projection and samples camera focus once',()=>{
  let focusSamples=0
  cam.perspective=true;cam.moveTo(22e6,5e6,2)
  cam.heightAt=(x,y)=>{if(x===22e6&&y===5e6)focusSamples++;return groundHeight(x,y)}
  const project=cam.projector()
  for(let i=0;i<100;i++)assert.deepEqual(project(22e6+i+1,5e6+i*.7),cam.worldToScreen(22e6+i+1,5e6+i*.7))
  assert.equal(focusSamples,1)
  cam.perspective=false;cam.heightAt=()=>0
})
const worker=new Worker(new URL('./helpers/landscape-worker-fixture.mjs',import.meta.url))
try {
  for(const id of [1,2]) {
    const response=once(worker,'message',{signal:AbortSignal.timeout(15000)})
    worker.postMessage({id,region:landscapeRegion(22_100_000+id*100,5_200_000,2400),resolution:32,trees:3000,source:{kind:'demo',scene:'concept'},footprints:[],roads:[],revision:id})
    const [result]=await response
    assert.equal(result.id,id);assert.equal(result.error,undefined)
    const {data}=result
    assert.equal(data.geometry.length,4)
    for(const g of data.geometry)for(const a of Object.values(g))assert.ok(a.array instanceof Float32Array&&a.array.every(Number.isFinite))
    assert.equal(data.coast.length,33*33*4)
    assert.ok(data.trees.length>0&&data.trees.length<=3000*16)
    assert.ok(data.nearTrees>0&&data.nearTrees<data.trees.length/16,'distant crowns do not require full trunk geometry')
    assert.ok(data.props.every(p=>p.matrix.length===p.count*16&&p.color.length===p.count*3))
    assert.ok(!data.props.some(p=>p.shape==='pine'),'baked crowns replace distant solid cones')
  }
  passed++;console.log('  OK    Landscape worker transfers complete geometry and can prepare consecutive views')
} finally {await worker.terminate()}
await ctx.fiber.dispose()
console.log('\n' + passed + ' 3D-Prüfungen bestanden')

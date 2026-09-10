import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { ClientEntity } from '../state.ts'
import type { Camera } from '../camera.ts'
import { DEPOSIT_RADIUS } from '../../shared/placement.ts'
import {cityNetwork,roadSurfaces,type RoadSurface} from '../../shared/infrastructure.ts'
import { makeModel, type Part } from './models.ts'
import { PrimitiveBatch } from './batch.ts'
import { Landscape, withRoads, type GroundSource } from './landscape.ts'
import { BUDGETS, type GraphicsSettings } from './settings.ts'

export interface SceneStats { entities: number, detailed: number, instances: number, calls: number, triangles: number,landscapeMs?:number,modelsMs?:number,renderMs?:number }
export class PolyScene {
  readonly canvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  private orthographic = new THREE.OrthographicCamera()
  private perspective = new THREE.PerspectiveCamera()
  private camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = this.orthographic
  private batch: PrimitiveBatch
  private landscape: Landscape
  private cache = new Map<string, {part:Part,matrix:THREE.Matrix4,color:THREE.Color}[]>()
  private root = new THREE.Object3D()
  private part = new THREE.Object3D()
  private matrix = new THREE.Matrix4()
  private tint = new THREE.Color()
  private team = new THREE.Color()
  private travel = new Map<number, { x: number, y: number, phase: number }>()
  private sun = new THREE.DirectionalLight()
  private environment: THREE.WebGLRenderTarget
  private sky: Sky
  private roadKey=''
  private roads:RoadSurface[]=[]
  private roadRevision=0
  stats: SceneStats = { entities: 0, detailed: 0, instances: 0, calls: 0, triangles: 0 }
  readonly settings: GraphicsSettings
  constructor(settings: GraphicsSettings) {
    this.settings = settings
    // Metres to continental distances must retain enough depth precision to
    // keep the sea below the terrain instead of reflecting through it.
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: settings.quality !== 'low', logarithmicDepthBuffer: true, powerPreference: 'high-performance' })
    this.canvas = this.renderer.domElement
    this.canvas.setAttribute('aria-label', 'Real Command 3D-Spielwelt')
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none'
    this.renderer.setClearColor('#132b30', 0)
    this.renderer.shadowMap.enabled = settings.quality !== 'low'
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = settings.light === 'dusk' ? 1.06 : 1.14
    const sky = new Sky(), skyScene = new THREE.Scene()
    sky.scale.setScalar(10000)
    sky.material.uniforms.sunPosition.value.set(.65, settings.light === 'dusk' ? .12 : .75, -.8)
    sky.material.uniforms.turbidity.value = 6
    sky.material.uniforms.rayleigh.value = 1.8
    sky.material.uniforms.showSunDisc.value = true
    sky.material.uniforms.cloudCoverage.value = .48
    sky.material.uniforms.cloudDensity.value = .65
    skyScene.add(sky)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.environment = pmrem.fromScene(skyScene, .04)
    this.scene.environment = this.environment.texture
    this.scene.environmentIntensity = .65
    this.sky=sky;this.scene.add(sky);pmrem.dispose()
    const budget = BUDGETS[settings.quality]
    // Full detail is capped, tactical instances remain available for crowds.
    this.batch = new PrimitiveBatch(Math.max(24000, budget.detailed * 220))
    this.landscape = new Landscape(budget.terrain, budget.trees)
    this.scene.add(this.batch.group, this.landscape.group)
    this.scene.add(new THREE.HemisphereLight('#aec8d2', '#293126', settings.light === 'dusk' ? .85 : 1.5))
    this.sun.color.set(settings.light === 'dusk' ? '#ffcf8e' : '#fff0d4')
    this.sun.intensity = settings.light === 'dusk' ? 3.2 : 3.5
    this.sun.castShadow = true
    this.sun.shadow.mapSize.setScalar(settings.quality === 'high' ? 4096 : 2048)
    this.sun.shadow.normalBias = .35
    this.sun.shadow.bias = -.00012
    this.sun.shadow.radius = 2
    this.scene.add(this.sun, this.sun.target)
    this.scene.fog = new THREE.Fog(settings.light === 'dusk' ? '#a8ad9e' : '#a6b8ba', 1000, 4000)
  }
  resize(width: number, height: number) {
    const dpr = Math.min(devicePixelRatio, BUDGETS[this.settings.quality].dpr, Math.sqrt(4_000_000 / (width * height)))
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(width, height, false)
  }
  render(cam: Camera, entities: Iterable<ClientEntity>, source: GroundSource, colorOf: (id: number) => string, time: number, selected: Set<number> = new Set()) {
    const started=performance.now()
    cam.perspective=this.settings.view==='perspective'
    const halfW = cam.width * cam.mpp / 2, halfH = cam.height * cam.mpp / 2
    const tilt = Math.acos(cam.groundScale)
    const distance = Number.isFinite(cam.viewDistance)?cam.viewDistance:Math.max(1000, halfW * 4, halfH * 4)
    this.camera=Number.isFinite(cam.viewDistance)?this.perspective:this.orthographic
    this.orthographic.left = -halfW; this.orthographic.right = halfW
    this.orthographic.top = halfH; this.orthographic.bottom = -halfH
    this.perspective.fov=2*Math.atan(halfH/distance)*180/Math.PI
    this.perspective.aspect=cam.width/cam.height
    this.camera.near = .2; this.camera.far = Math.max(distance * 3,14000)
    this.sky.visible=cam.mpp<160
    this.sky.scale.setScalar(this.camera.far*.45)

    const view = cam.viewRect(cam.mpp * 100 + (cam.mpp < 160 ? 200 : 0))
    const visible: ClientEntity[] = []
    for (const e of entities) if ((e.visible || e.ghost) && e.x >= view.x0 && e.x <= view.x1 && e.y >= view.y0 && e.y <= view.y1) visible.push(e)
    visible.sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || (a.x - cam.x) ** 2 + (a.y - cam.y) ** 2 - (b.x - cam.x) ** 2 - (b.y - cam.y) ** 2)
    const near = cam.mpp < 160
    this.landscape.group.visible = near
    if(near&&source.ready&&cam.mpp<20){
      const buildings=visible.filter(e=>e.kind==='b'&&e.def).sort((a,b)=>a.id-b.id)
      const key=buildings.map(e=>`${e.id}:${e.owner}:${e.type}:${e.x}:${e.y}`).join('|')
      if(key!==this.roadKey){
        this.roadKey=key;this.roads=[];this.roadRevision++
        const owners=new Set(buildings.map(e=>e.owner))
        const obstacles=visible.filter(e=>e.kind!=='u').map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,size:e.def?.size??DEPOSIT_RADIUS}))
        for(const owner of owners){
          const city=buildings.filter(e=>e.owner===owner).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,size:e.def!.size}))
          this.roads.push(...roadSurfaces(cityNetwork(city,(x,y)=>source.isLand(x,y),obstacles).roads,city))
        }
      }
      source=withRoads(source,this.roads,this.roadRevision)
    }
    if (near) this.landscape.update(cam.x, cam.y, Math.min(Math.max(view.x1-view.x0,view.y1-view.y0),Math.max(1400,cam.width*cam.mpp*2.2)), source,
      visible.filter(e => e.kind === 'b').map(e => ({ x: e.x, y: e.y, radius: (e.def?.size ?? 10) + 5, waterfront:e.def?.kind==='building'&&e.def.role==='shipyard' })), this.settings.motion ? time : 0)
    cam.heightAt = near ? this.landscape.surface.height : () => 0
    const focusHeight = cam.viewHeight
    this.camera.position.set(0, focusHeight + Math.cos(tilt) * distance, Math.sin(tilt) * distance)
    this.sky.position.copy(this.camera.position)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(0, focusHeight, 0)
    this.camera.updateProjectionMatrix()
    const shadowSpan = Math.max(80, halfW * 1.25, halfH / cam.groundScale * 1.25)
    this.sun.position.set(shadowSpan * .8, focusHeight + shadowSpan * .65, -shadowSpan * .6)
    this.sun.target.position.set(0, focusHeight, 0)
    Object.assign(this.sun.shadow.camera, { left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan, near: .1, far: shadowSpan * 5 })
    this.sun.shadow.camera.updateProjectionMatrix()
    const fog = this.scene.fog as THREE.Fog
    fog.near = distance + Math.max(halfH * 1.6, 550)
    fog.far = distance + Math.max(halfH * 12, 7500)
    const landscapeDone=performance.now()
    this.batch.clear()
    let detailed = 0
    const alive = new Set<number>()
    for (const e of visible) {
      alive.add(e.id)
      const def = e.def
      const physicalSize = def?.size ?? DEPOSIT_RADIUS
      const full = def && near && detailed < BUDGETS[this.settings.quality].detailed && physicalSize / cam.mpp > 5
      // Full 3D models stay in physical metres at every zoom. Small objects use
      // tactical markers instead of enlarging geometry into their neighbours.
      const s = full ? physicalSize : Math.max(physicalSize, cam.mpp * 6)
      const land = source.ready && source.isLand(e.x, e.y)
      const height = near && land ? this.landscape.surface.height(e.x, e.y) : 0
      const air = def?.kind === 'unit' && def.domain === 'air' && e.state !== 'parked' && e.state !== 'rearm'
      this.team.set(e.ghost ? '#8b9894' : colorOf(e.owner))
      // Keep ownership on trim; the architecture uses concrete and olive steel.
      this.root.position.set(e.x - cam.x, height + (air ? s * 2.2 : 0), e.y - cam.y)
      this.root.rotation.set(0, -e.heading, 0); this.root.scale.setScalar(s); this.root.updateMatrix()
      if (!full) {
        this.part.position.set(0, .2, 0); this.part.rotation.set(0, 0, 0); this.part.scale.set(.75, .4, .75); this.part.updateMatrix()
        this.matrix.multiplyMatrices(this.root.matrix, this.part.matrix)
        this.batch.add(e.kind === 'd' ? 'rock' : e.kind === 'b' ? 'box' : 'cone', this.matrix, e.kind === 'd' ? '#caaa61' : this.team)
        continue
      }
      detailed++
      let model = this.cache.get(def.id)
      if (!model) {
        model=makeModel(def).map(part=>{
          const object=new THREE.Object3D();object.position.fromArray(part.p);object.rotation.set(...part.r);object.scale.fromArray(part.s);object.updateMatrix()
          return {part,matrix:object.matrix.clone(),color:new THREE.Color(part.color==='team'?'#ffffff':part.color)}
        })
        this.cache.set(def.id,model)
      }
      let pose = this.travel.get(e.id)
      if (!pose) { pose = { x: e.x, y: e.y, phase: e.id % 7 }; this.travel.set(e.id, pose) }
      const moved = Math.hypot(e.x - pose.x, e.y - pose.y)
      // Distance-driven gait; stationary troops don't march and teleports don't
      // produce a burst of animation. No poses or animation packets on the wire.
      if (moved < 100 && this.settings.motion) pose.phase += moved / Math.max(.5, def.size) * 2.4
      pose.x = e.x; pose.y = e.y
      const stride = this.settings.motion && e.speed > .3 ? Math.sin(pose.phase) * .28 : 0
      for (const prepared of model) {
        const p=prepared.part
        if(!p.motion)this.matrix.multiplyMatrices(this.root.matrix,prepared.matrix)
        else {
        this.part.position.fromArray(p.p); this.part.rotation.set(...p.r); this.part.scale.fromArray(p.s)
        if (p.motion === 'strideL' || p.motion === 'strideR') {
          this.part.rotation.z += p.motion === 'strideL' ? stride : -stride
          this.part.position.x += (p.motion === 'strideL' ? stride : -stride) * .4
        }
        if (this.settings.motion && !e.off && !e.ghost && (p.motion === 'radar' || p.motion === 'rotor' && air)) this.part.rotation.y += time * (p.motion === 'rotor' ? 28 : .7)
        if (p.motion === 'turret' || p.motion === 'barrel') {
          const angle = e.heading - e.turret
          const px = this.part.position.x, pz = this.part.position.z
          this.part.position.x = Math.cos(angle) * px + Math.sin(angle) * pz
          this.part.position.z = -Math.sin(angle) * px + Math.cos(angle) * pz
          this.part.rotation.y += angle
        }
        this.part.updateMatrix(); this.matrix.multiplyMatrices(this.root.matrix, this.part.matrix)
        }
        this.tint.copy(p.color === 'team' ? this.team : prepared.color)
        if (e.ghost) this.tint.lerp(new THREE.Color('#8b9894'), .65)
        if (e.off) this.tint.multiplyScalar(.55)
        this.batch.add(p.shape, this.matrix, this.tint)
      }
    }
    for (const id of this.travel.keys()) if (!alive.has(id)) this.travel.delete(id)
    this.batch.flush()
    const modelsDone=performance.now()
    this.renderer.render(this.scene, this.camera)
    this.stats = { entities: visible.length, detailed, instances: this.batch.count, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,landscapeMs:landscapeDone-started,modelsMs:modelsDone-landscapeDone,renderMs:performance.now()-modelsDone }
  }
  dispose() { this.batch.dispose(); this.landscape.dispose(); this.sky.geometry.dispose();this.sky.material.dispose();this.environment.dispose(); this.renderer.dispose(); this.canvas.remove() }
}

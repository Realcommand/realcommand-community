import { Context, Service } from 'cordis'
import { WORLD_W, WORLD_H } from '../shared/constants.ts'
import { clamp } from '../shared/math.ts'
import { groundScale, WORLD_FOV } from './poly/settings.ts'

declare module 'cordis' {
  interface Context {
    camera: Camera
  }
}

export interface ViewRect { x0: number, y0: number, x1: number, y1: number }

export class Camera extends Service {
  static inject = []
  /** Weltkoordinaten der Bildmitte. */
  x = WORLD_W / 2
  y = WORLD_H / 2
  /** Meter pro Pixel. */
  mpp = 20_000
  width = 1
  height = 1
  minMpp = 0.01
  /** Installed by the renderer; also used by picking and command overlays. */
  heightAt: (x: number, y: number) => number = () => 0
  perspective = false
  private focusCache?:{x:number,y:number,height:number,source:Camera['heightAt']}
  private rectCache?:{key:string,source:Camera['heightAt'],rect:ViewRect}
  get viewHeight() {
    if(this.mpp>=160)return 0
    const c=this.focusCache
    if(c&&c.x===this.x&&c.y===this.y&&c.source===this.heightAt)return c.height
    const height=this.heightAt(this.x,this.y)
    this.focusCache={x:this.x,y:this.y,height,source:this.heightAt};return height
  }
  get viewDistance() {
    if(this.perspective&&this.mpp<160) {
      const strength=Math.min(1,Math.max(.001,(160-this.mpp)/100))
      return this.height*this.mpp/(2*Math.tan(WORLD_FOV*Math.PI/360))/strength
    }
    return Infinity
  }
  private anim?: { x: number, y: number, mpp: number, t: number }

  constructor(ctx: Context) {
    super(ctx, 'camera')
  }

  get maxMpp() { return Math.max(1, WORLD_W / this.width) * 1.05 }
  get groundScale() { return this.perspective ? groundScale(this.mpp) : 1 }

  resize(width: number, height: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.clampAll()
  }

  worldToScreen(wx: number, wy: number, elevation?: number): [number, number] {
    return this.projector()(wx,wy,elevation)
  }

  /** Capture camera constants once for a batch of particles, markers or picks.
   * The projection and ground sampling are identical to worldToScreen. */
  projector(): (wx:number,wy:number,elevation?:number)=>[number,number] {
    const scale = this.groundScale, rise = Math.sqrt(1 - scale * scale)
    const heightAt=this.heightAt,focus=this.viewHeight,x=this.x,y=this.y,mpp=this.mpp,distance=this.viewDistance,halfW=this.width/2,halfH=this.height/2
    return (wx,wy,elevation)=>{
      const h=(elevation ?? heightAt(wx,wy))-focus,dz=wy-y,depth=Math.max(.02,1-(h*scale+dz*rise)/distance)
      return [(wx-x)/mpp/depth+halfW,(dz*scale-h*rise)/mpp/depth+halfH]
    }
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    const screenX=(sx-this.width/2)*this.mpp,screenY=(sy-this.height/2)*this.mpp
    const scale = this.groundScale, rise = Math.sqrt(1 - scale * scale)
    const distance=this.viewDistance
    const heightAt=this.heightAt
    if(Number.isFinite(distance)) {
      const ox=this.x,oy=this.viewHeight+scale*distance,oz=this.y+rise*distance
      const dx=screenX,dy=-distance*scale-screenY*rise,dz=-distance*rise+screenY*scale
      const limit=Math.max(2,(distance*rise+this.worldRadius)/Math.max(1,Math.hypot(dx,dz)))
      const above=(t:number)=>oy+dy*t-heightAt(ox+dx*t,oz+dz*t)
      let previous=0,step=1/64
      for(let t=step;t<=limit;t=Math.min(limit,t+step)) {
        if(above(t)<=0) {
          let lo=previous,hi=t
          for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(above(mid)>0)lo=mid;else hi=mid}
          const hit=(lo+hi)/2
          return [ox+dx*hit,oz+dz*hit]
        }
        if(t===limit)break
        previous=t;step*=1.12
      }
      return [ox+dx*limit,oz+dz*limit]
    }
    const denominator=scale+screenY*rise/distance
    let x=this.x+screenX,y=this.y+screenY/scale
    for (let i = 0; i < 64; i++) {
      const h=this.heightAt(x,y)-this.viewHeight
      const dz=(screenY+h*(rise-screenY*scale/distance))/denominator
      const nx=this.x+screenX*(1-(h*scale+dz*rise)/distance),ny=this.y+dz
      if(Math.hypot(nx-x,ny-y)<1e-8)return[nx,ny]
      x=nx;y=ny
    }
    return [x, y]
  }

  viewRect(margin = 0): ViewRect {
    if(Number.isFinite(this.viewDistance)) {
      const key=[this.x,this.y,this.mpp,this.width,this.height,this.perspective].join(':')
      if(this.rectCache?.key===key&&this.rectCache.source===this.heightAt) {
        const v=this.rectCache.rect;return{x0:v.x0-margin,y0:v.y0-margin,x1:v.x1+margin,y1:v.y1+margin}
      }
      const corners=[[0,0],[this.width,0],[0,this.height],[this.width,this.height]].map(([x,y])=>this.screenToWorld(x,y))
      const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1])
      const r=this.worldRadius
      const rect={x0:Math.max(this.x-r,Math.min(...xs)),y0:Math.max(this.y-r,Math.min(...ys)),x1:Math.min(this.x+r,Math.max(...xs)),y1:Math.min(this.y+r,Math.max(...ys))}
      this.rectCache={key,source:this.heightAt,rect}
      return{x0:rect.x0-margin,y0:rect.y0-margin,x1:rect.x1+margin,y1:rect.y1+margin}
    }
    const hw = this.width / 2 * this.mpp, hh = this.height / 2 * this.mpp / this.groundScale
    return { x0: this.x - hw - margin, y0: this.y - hh - margin, x1: this.x + hw + margin, y1: this.y + hh + margin }
  }

  get worldRadius() { return Math.min(2_000_000,Math.max(3200,this.width*this.mpp*4)) }

  private targetMpp?: number

  private movedAt = 0

  /**
   * Bewegt sich die Kamera gerade – gezoomt, gefahren oder geschoben?
   * Die Szenenvorschau speichert ihre URL nach Ende dieser Bewegung.
   * Die Radarkarte wird unabhängig davon im Worker vorbereitet.
   */
  get busy() {
    if (this.anim) return true
    if (performance.now() - this.movedAt < 34) return true
    const t = this.targetMpp
    return t !== undefined && Math.abs(t - this.mpp) > this.mpp * 0.01
  }

  /** Von jeder Bewegung aufgerufen. */
  private touch() { this.movedAt = performance.now() }
  private zoomAnchor?: [number, number]

  /** Zoom um einen Bildschirmpunkt, weich über mehrere Frames. */
  zoomBy(factor: number, sx?: number, sy?: number) {
    this.anim = undefined
    const base = this.targetMpp ?? this.mpp
    this.targetMpp = clamp(base * factor, this.minMpp, this.maxMpp)
    this.zoomAnchor = sx === undefined || sy === undefined ? [this.width / 2, this.height / 2] : [sx, sy]
  }

  private applyZoom(newMpp: number, sx: number, sy: number) {
    const [ax, ay] = this.screenToWorld(sx, sy)
    newMpp = clamp(newMpp, this.minMpp, this.maxMpp)
    this.mpp = newMpp
    if(Number.isFinite(this.viewDistance)) {
      const px=(sx-this.width/2)*newMpp,py=(sy-this.height/2)*newMpp
      const g=this.groundScale,r=Math.sqrt(1-g*g),d=this.viewDistance,h=this.heightAt(ax,ay)
      for(let i=0;i<128;i++) {
        const delta=h-this.viewHeight,z=(py+delta*(r-py*g/d))/(g+py*r/d)
        const depth=1-(delta*g+z*r)/d,cx=ax-px*depth,cy=ay-z
        if(Math.hypot(cx-this.x,cy-this.y)<1e-7){this.x=cx;this.y=cy;break}
        this.x+=(cx-this.x)*.6;this.y+=(cy-this.y)*.6
      }
      this.clampAll();this.touch();report(this);return
    }
    this.x = ax - (sx - this.width / 2) * newMpp
    this.y = ay - (sy - this.height / 2) * newMpp / this.groundScale
    for (let i = 0; i < 32; i++) {
      const [wx,wy]=this.screenToWorld(sx,sy)
      if(Math.hypot(ax-wx,ay-wy)<1e-8)break
      this.x+=ax-wx;this.y+=ay-wy
    }
    this.clampAll()
    this.touch()
    report(this)
  }

  panPixels(dx: number, dy: number) {
    if (!dx && !dy) return
    this.anim = undefined
    this.x += dx * this.mpp
    this.y += dy * this.mpp / this.groundScale
    this.clampAll()
    this.touch()
    report(this)
  }

  moveTo(x: number, y: number, mpp?: number) {
    this.anim = undefined
    this.targetMpp = undefined
    this.x = x; this.y = y
    if (mpp !== undefined) this.mpp = clamp(mpp, this.minMpp, this.maxMpp)
    this.clampAll()
  }

  animateTo(x: number, y: number, mpp?: number) {
    this.targetMpp = undefined
    this.anim = { x, y, mpp: mpp === undefined ? this.mpp : clamp(mpp, this.minMpp, this.maxMpp), t: 0 }
  }

  update(dt: number) {
    report(this)
    if (this.targetMpp !== undefined && this.zoomAnchor) {
      const ratio = this.targetMpp / this.mpp
      if (Math.abs(Math.log(ratio)) < 0.002) { this.applyZoom(this.targetMpp, this.zoomAnchor[0], this.zoomAnchor[1]); this.targetMpp = undefined }
      else this.applyZoom(this.mpp * Math.pow(ratio, 1 - Math.exp(-dt * 14)), this.zoomAnchor[0], this.zoomAnchor[1])
    }
    if (!this.anim) return
    const a = this.anim
    a.t += dt * 2.5
    const t = Math.min(1, a.t)
    const s = t * t * (3 - 2 * t)
    const startX = this.x, startY = this.y, startMpp = this.mpp
    // exponentielle Interpolation für den Zoom, linear für Position
    this.x = startX + (a.x - startX) * s
    this.y = startY + (a.y - startY) * s
    this.mpp = Math.exp(Math.log(startMpp) + (Math.log(a.mpp) - Math.log(startMpp)) * s)
    if (t >= 1) this.anim = undefined
    this.clampAll()
  }

  private clampAll() {
    this.mpp = clamp(this.mpp, this.minMpp, this.maxMpp)
    const hw = this.width / 2 * this.mpp, hh = this.height / 2 * this.mpp / this.groundScale
    if (hw * 2 >= WORLD_W) this.x = WORLD_W / 2
    else this.x = clamp(this.x, hw, WORLD_W - hw)
    if (hh * 2 >= WORLD_H) this.y = WORLD_H / 2
    else this.y = clamp(this.y, hh, WORLD_H - hh)
  }

  /** Lesbarer Maßstab (Breite des Bildes). */
  scaleLabel() {
    const w = this.width * this.mpp
    if (w >= 1_000_000) return `${Math.round(w / 1000)} km`
    if (w >= 1000) return `${(w / 1000).toFixed(1)} km`
    return `${Math.round(w)} m`
  }
}

/**
 * Meldet die Kameralage an die Messung (window.__rcPerf). Sie wird auch dann
 * aktuell gehalten, wenn keine Bilder gezeichnet werden – nur so lässt sich
 * prüfen, ob eine Eingabe überhaupt ankommt, während das Fenster im
 * Hintergrund liegt und der Browser die Bildschleife anhält.
 */
function report(cam: { x: number, y: number, mpp: number }) {
  const perf = (globalThis as unknown as { __rcPerf?: { camera(x: number, y: number, mpp: number): void } }).__rcPerf
  perf?.camera(cam.x, cam.y, cam.mpp)
}

import { Context, Service } from 'cordis'
import { drawUnitRoute } from './route-overlay.ts'
import { WORLD_W, WORLD_H, BUILD_RADIUS, SPAWN_MIN_DISTANCE } from '../shared/constants.ts'
import { DEFS, type BuildingDef, FACTIONS } from '../shared/data.ts'
import { worldToLonLat, lonLatToWorld } from '../shared/geo.ts'
import { effectiveScale, palette } from './sprites.ts'
import { PolyScene } from './poly/scene.ts'
import { graphicsSettings } from './poly/settings.ts'
import { MOBILE_QUERY, syncResponsiveView } from './responsive.ts'
import type { ClientEntity } from './state.ts'
import type { ViewRect, Camera } from './camera.ts'
import {visibleSightDiscs,sightClearsViewport,type SightCircle} from './visibility-mask.ts'

/** Drehflügler: sie stehen in der Luft und wirbeln Staub auf, statt zu ziehen. */
const ROTORCRAFT = new Set(['gunship', 'cargoheli', 'recon_drone'])

declare module 'cordis' {
  interface Context {
    renderer: Renderer
  }
  interface Events {
    'render/frame'(dt: number): void
  }
}

export class Renderer extends Service {
  static inject = ['camera', 'terrain', 'state', 'effects', 'input', 'link']
  canvas!: HTMLCanvasElement
  g!: CanvasRenderingContext2D
  time = 0
  fps = 0
  private fog!: HTMLCanvasElement
  private lastFrame = 0
  private raf = 0
  private lastViewSent = 0
  private lastView?: ViewRect
  private frames = 0
  private fpsAt = 0
  poly!: PolyScene
  private mapCanvas!: HTMLCanvasElement
  private performanceOutput?:HTMLOutputElement
  private performanceAt=0

  constructor(ctx: Context) {
    super(ctx, 'renderer')
  }

  [Service.init]() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement
    this.poly = new PolyScene(graphicsSettings(location.search, matchMedia('(prefers-reduced-motion: reduce)').matches))
    this.mapCanvas = document.createElement('canvas')
    this.mapCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0'
    this.canvas.before(this.mapCanvas)
    this.canvas.before(this.poly.canvas)
    this.poly.canvas.style.zIndex = '1'
    this.g = this.canvas.getContext('2d')!
    this.fog = document.createElement('canvas')
    if(new URLSearchParams(location.search).get('perf')==='on') {
      this.performanceOutput=document.createElement('output');this.performanceOutput.id='frame-performance'
      this.performanceOutput.setAttribute('aria-label','Grafikleistung')
      this.performanceOutput.style.cssText='position:fixed;left:340px;bottom:44px;z-index:9999;padding:8px 12px;background:#10271fea;color:#e5efdb;font:12px monospace;pointer-events:none'
      document.body.append(this.performanceOutput)
    }
    const resize = () => {
      this.poly.settings.view = syncResponsiveView(window, matchMedia(MOBILE_QUERY).matches)
      this.ctx.camera.perspective = this.poly.settings.view === 'perspective'
      this.poly.canvas.dataset.view = this.poly.settings.view
      // Pixeldichte begrenzen, damit große Retina-Fenster die Füllrate nicht sprengen (max. ~6 MPixel).
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6_000_000 / Math.max(1, innerWidth * innerHeight))))
      this.canvas.width = Math.floor(innerWidth * dpr)
      this.canvas.height = Math.floor(innerHeight * dpr)
      this.canvas.style.width = innerWidth + 'px'
      this.canvas.style.height = innerHeight + 'px'
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.mapCanvas.width = this.canvas.width; this.mapCanvas.height = this.canvas.height
      this.mapCanvas.style.width = innerWidth + 'px'; this.mapCanvas.style.height = innerHeight + 'px'
      this.mapCanvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.fog.width = Math.max(1, Math.ceil(innerWidth / 2)); this.fog.height = Math.max(1, Math.ceil(innerHeight / 2))
      this.ctx.camera.resize(innerWidth, innerHeight)
      this.poly.resize(innerWidth, innerHeight)
    }
    resize()
    addEventListener('resize', resize)
    this.lastFrame = performance.now()
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      const rawGap=now-this.lastFrame
      const dt = Math.min(0.1, rawGap / 1000)
      this.lastFrame = now
      if (document.hidden) return
      this.time += dt
      this.frames++
      if (now - this.fpsAt > 1000) { this.fps = this.frames; this.frames = 0; this.fpsAt = now }
      try {
        this.frame(dt,rawGap)
      } catch (error) {
        this.ctx.logger.error(error)
      }
    }
    this.raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(this.raf); removeEventListener('resize', resize); this.poly.dispose(); this.mapCanvas.remove();this.performanceOutput?.remove() }
  }

  private frame(dt: number,rawGap:number) {
    const { camera, state, effects, input } = this.ctx
    // Leistungsmessung: Die Anteile eines Bildes einzeln stoppen. Ohne sie rät
    // man beim Ruckeln nur herum. window.__rcPerf liefert die letzten Werte.
    const t0 = performance.now()
    input.update(dt)
    camera.update(dt)
    state.update(dt)
    effects.update(dt)
    const t1 = performance.now()
    this.draw()
    const t2 = performance.now()
    perf.push(rawGap, t1 - t0, t2 - t1)
    perf.camera(camera.x, camera.y, camera.mpp)
    this.ctx.emit('render/frame', dt)
    if(this.performanceOutput&&t2-this.performanceAt>700) {
      const report=perf.report(),gap=report.abstandMs as {p95:number,max:number},draw=report.zeichnenMs as {p95:number}
      const s=this.poly.stats
      this.performanceOutput.textContent=`${this.fps} FPS · p95 ${gap.p95} ms · CPU ${draw.p95} ms · max ${gap.max} ms · Gelände ${s.landscapeMs?.toFixed(1)} / Modelle ${s.modelsMs?.toFixed(1)} / Render ${s.renderMs?.toFixed(1)} ms · ${s.triangles.toLocaleString('de-DE')} Dreiecke`
      this.performanceOutput.title=JSON.stringify(report)
      this.performanceAt=t2
    }
    // Sichtbereich an den Server melden (gedrosselt).
    const now = performance.now()
    if (state.phase === 'play' || state.phase === 'spawn') {
      const v = camera.viewRect((camera.width * camera.mpp) * 0.15)
      const lv = this.lastView
      const changed = !lv || Math.abs(v.x0 - lv.x0) > (v.x1 - v.x0) * 0.08 || Math.abs(v.y0 - lv.y0) > (v.y1 - v.y0) * 0.08 || Math.abs((v.x1 - v.x0) - (lv.x1 - lv.x0)) > (v.x1 - v.x0) * 0.1
      if (changed && now - this.lastViewSent > 200) {
        this.lastViewSent = now
        this.lastView = v
        this.ctx.link.send({ t: 'view', x0: Math.max(0, v.x0), y0: Math.max(0, v.y0), x1: Math.min(WORLD_W, v.x1), y1: Math.min(WORLD_H, v.y1) })
      }
    }
  }

  private draw() {
    const { camera: cam, terrain, state, effects, input } = this.ctx
    const g = this.g
    const W = cam.width, H = cam.height
    const tA = performance.now()
    g.clearRect(0, 0, W, H)
    // The world map retains its geographic tiles at strategic distances.
    // At ground level the WebGL landscape is visible below this command overlay.
    const mapContext = this.mapCanvas.getContext('2d')!
    if (cam.mpp >= 160) terrain.draw(mapContext, cam)
    else mapContext.clearRect(0, 0, W, H)
    this.canvas.style.zIndex = '2'
    this.poly.render(cam, state.entities.values(), terrain.graphicsSource(), id => state.playerColor(id), this.time, state.selected)
    perf.mark('gelaende', performance.now() - tA)
    this.drawGraticule()
    const view = cam.viewRect(cam.mpp * 80)

    // Entitäten im Sichtbereich einsammeln und nach Ebene sortieren.
    const buildings: ClientEntity[] = [], ground: ClientEntity[] = [], air: ClientEntity[] = []
    for (const e of state.entities.values()) {
      if (e.x < view.x0 || e.x > view.x1 || e.y < view.y0 || e.y > view.y1) continue
      if (e.kind === 'd') continue
      else if (e.kind === 'b') buildings.push(e)
      else if (e.def && (e.def as any).domain === 'air') air.push(e)
      else ground.push(e)
    }
    const overlayStart=performance.now()
    effects.drawDecals(g, cam)
    this.drawContacts(g, cam)
    perf.mark('kontakte',performance.now()-overlayStart)
    const closeUp = cam.mpp < 12
    const drawList = (list: ClientEntity[]) => {
      for (const e of list) {
        if (closeUp && e.def && !e.ghost) {
          if (e.kind === 'b') {
            if (e.hp < e.maxHp * 0.55) effects.emitSmoke(e.id, e.x, e.y, e.def.size, 1 - e.hp / e.maxHp)
            const s = e.def.size
            if (e.type === 'power' || e.type === 'factory') effects.emitExhaust(e, cam.heightAt(e.x,e.y))
            else if (e.type === 'refinery') effects.emitAmbient(e.id, e.x - s * 0.13, e.y - s * 0.85, 'flare', s)
          } else if (e.kind === 'u' && (e.def as any).domain === 'land' && e.def.category === 'vehicle' && e.speed > 0.5) {
            effects.emitDust(e.id, e.x, e.y, e.heading, e.def.size)
            if (e.def.category === 'vehicle' && e.def.size >= 4) effects.emitTracks(e.id, e.x, e.y, e.heading, e.def.size * 1.25)
          } else if (e.kind === 'u' && (e.def as any).domain === 'sea' && e.speed > 0.5) {
            effects.emitWake(e.id, e.x, e.y, e.heading, e.def.size)
          } else if (e.kind === 'u' && (e.def as any).domain === 'air' && !e.off) {
            // Drehflügler wirbeln Staub auf, Düsenflugzeuge ziehen einen Streifen.
            if (ROTORCRAFT.has(e.type)) effects.emitDownwash(e.id, e.x, e.y, e.def.size)
            else if (e.speed > 40) effects.emitContrail(e.id, e.x, e.y, e.heading, e.def.size)
          }
        }
      }
    }
    const tE = performance.now()
    drawList(buildings)
    drawList(ground)
    perf.mark('einheiten', performance.now() - tE)
    // Befehlslinien und Sammelpunkte der Auswahl.
    this.drawOrderLines()
    effects.draw(g, cam)
    perf.mark('effekte',performance.now()-tE)
    drawList(air)
    const tF = performance.now()
    this.drawFog()
    perf.mark('nebel', performance.now() - tF)
    this.drawSelection()
    this.drawBases()
    this.drawPlacement()
    if (input.drag) {
      const d = input.drag
      g.strokeStyle = 'rgba(255,255,255,0.8)'
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.lineWidth = 1
      g.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0))
      g.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0))
    }
    if (state.phase === 'spawn') this.drawSpawnMarker()
    if (input.mode === 'attackmove') {
      g.fillStyle = 'rgba(255,90,54,0.9)'
      g.font = 'bold 12px sans-serif'
      g.fillText('ANGRIFFSMARSCH – Ziel anklicken (Esc bricht ab)', 12, H - 12)
    } else if (input.mode === 'rally') {
      g.fillStyle = 'rgba(245,197,24,0.9)'
      g.font = 'bold 12px sans-serif'
      g.fillText('SAMMELPUNKT – Position anklicken', 12, H - 12)
    }
    void W
  }

  private drawGraticule() {
    const { camera: cam } = this.ctx
    const g = this.g
    if (cam.mpp < 300) return
    const step = cam.mpp > 8000 ? 30 : cam.mpp > 2500 ? 10 : 5
    const alpha = Math.min(0.25, (cam.mpp - 300) / 4000)
    g.strokeStyle = `rgba(255,255,255,${alpha})`
    g.lineWidth = 1
    g.font = '10px monospace'
    g.fillStyle = `rgba(255,255,255,${alpha * 2.5})`
    const view = cam.viewRect()
    const a = worldToLonLat(view.x0, view.y0), b = worldToLonLat(view.x1, view.y1)
    for (let lon = Math.ceil(a.lon / step) * step; lon <= b.lon; lon += step) {
      const x = lonLatToWorld(lon, 0).x
      const [sx] = cam.worldToScreen(x, 0)
      g.beginPath(); g.moveTo(Math.round(sx) + 0.5, 0); g.lineTo(Math.round(sx) + 0.5, cam.height); g.stroke()
      g.fillText(`${Math.abs(lon)}°${lon < 0 ? 'W' : lon > 0 ? 'O' : ''}`, sx + 3, cam.height - 4)
    }
    for (let lat = Math.floor(a.lat / step) * step; lat >= b.lat; lat -= step) {
      const y = lonLatToWorld(0, lat).y
      const [, sy] = cam.worldToScreen(0, y)
      g.beginPath(); g.moveTo(0, Math.round(sy) + 0.5); g.lineTo(cam.width, Math.round(sy) + 0.5); g.stroke()
      g.fillText(`${Math.abs(lat)}°${lat < 0 ? 'S' : lat > 0 ? 'N' : ''}`, 4, sy - 3)
    }
  }


  /**
   * Radarkontakte im Weltbild. Sie zeigen einen Ort, keine Einheit: hohle Raute,
   * gestrichelter Ring, kein Lebensbalken, kein Name. Wer wissen will, was dort
   * steht, muss etwas hinschicken.
   */
  private drawContacts(g: CanvasRenderingContext2D, cam: Camera) {
    const state = this.ctx.state
    if (!state.contacts.length) return
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.2)
    g.save()
    g.lineWidth = 1.4
    for (const c of state.contacts) {
      const [sx, sy] = cam.worldToScreen(c.x, c.y)
      if (sx < -40 || sy < -40 || sx > cam.width + 40 || sy > cam.height + 40) continue
      const color = c.o ? state.playerColor(c.o) : '#7ad9ff'
      const r = c.c === 'a' ? 11 : 8
      g.globalAlpha = 0.35 + 0.35 * pulse
      g.strokeStyle = color
      g.setLineDash([3, 4])
      g.beginPath(); g.arc(sx, sy, r + 5, 0, Math.PI * 2); g.stroke()
      g.setLineDash([])
      g.globalAlpha = 0.9
      g.beginPath()
      g.moveTo(sx, sy - r); g.lineTo(sx + r, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r, sy)
      g.closePath(); g.stroke()
      if (c.c === 'a') { g.beginPath(); g.moveTo(sx - r - 4, sy); g.lineTo(sx + r + 4, sy); g.stroke() }
      if (c.c === 'n') { g.beginPath(); g.moveTo(sx - r, sy + r * 0.55); g.lineTo(sx + r, sy + r * 0.55); g.stroke() }
    }
    g.restore()
  }

  private drawOrderLines() {
    const { camera: cam, state } = this.ctx
    const g = this.g
    g.lineWidth = 1
    for (const e of state.selectedEntities()) {
      if (e.owner !== state.myId) continue
      const [sx, sy] = cam.worldToScreen(e.x, e.y)
      if (e.kind === 'u') drawUnitRoute(g, (x, y) => cam.worldToScreen(x, y), e)
      if (e.kind === 'b' && e.rx !== undefined && e.ry !== undefined) {
        const [tx, ty] = cam.worldToScreen(e.rx, e.ry)
        g.strokeStyle = 'rgba(245,197,24,0.7)'
        g.setLineDash([3, 3])
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke()
        g.setLineDash([])
        g.strokeStyle = '#111'; g.lineWidth = 2
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty - 14); g.stroke()
        g.fillStyle = '#f5c518'
        g.beginPath(); g.moveTo(tx, ty - 14); g.lineTo(tx + 10, ty - 11); g.lineTo(tx, ty - 7); g.closePath(); g.fill()
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(tx, ty + 1, 5, 2, 0, 0, Math.PI * 2); g.fill()
      }
    }
  }

  private drawFog() {
    const { camera: cam, state } = this.ctx
    if (state.phase !== 'play') return
    const g = this.g
    const fogAlpha = 0.42 * Math.max(0, Math.min(1, 1 - (cam.mpp - 800) / 6000))
    if (fogAlpha <= 0.02) return
    const fw = this.fog.width, fh = this.fog.height
    if (fw < 2 || fh < 2 || cam.width < 2 || cam.height < 2) return
    const fg = this.fog.getContext('2d')!
    const k = fw / cam.width
    fg.globalCompositeOperation = 'source-over'
    fg.clearRect(0, 0, fw, fh)
    fg.fillStyle = `rgba(3,8,12,${fogAlpha})`
    fg.fillRect(0, 0, fw, fh)
    fg.globalCompositeOperation = 'destination-out'
    const pxPerM = k / cam.mpp,circles:SightCircle[]=[]
    const project=cam.projector()
    for (const e of state.entities.values()) {
      if (e.owner !== state.myId || !e.def) continue
      const r = Math.max(4, e.def.sight * pxPerM)
      const [sx0, sy0] = project(e.x, e.y)
      const sx = sx0 * k, sy = sy0 * k
      if (sx < -r || sy < -r || sx > fw + r || sy > fh + r) continue
      const circle={x:sx,y:sy,r}
      if(sightClearsViewport(circle,fw,fh,cam.groundScale))return
      circles.push(circle)
    }
    for(const {x:sx,y:sy,r} of visibleSightDiscs(circles,cam.groundScale)) {
      fg.save()
      fg.translate(sx, sy); fg.scale(1, cam.groundScale)
      const grad = fg.createRadialGradient(0, 0, r * 0.85, 0, 0, r)
      grad.addColorStop(0, 'rgba(0,0,0,1)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      fg.fillStyle = grad
      fg.beginPath(); fg.arc(0, 0, r, 0, Math.PI * 2); fg.fill()
      fg.restore()
    }
    g.drawImage(this.fog, 0, 0, cam.width, cam.height)
  }

  private drawSelection() {
    const { camera: cam, state, input } = this.ctx
    const g = this.g
    const pxPerM = 1 / cam.mpp
    const drawBar = (e: ClientEntity, sx: number, sy: number, r: number) => {
      const w = Math.max(22, Math.min(80, r * 2)), h = 4
      const x = sx - w / 2, y = sy - r - 9
      const f = Math.max(0, Math.min(1, e.hp / e.maxHp))
      g.fillStyle = 'rgba(0,0,0,0.75)'
      g.fillRect(x - 1, y - 1, w + 2, h + 2)
      g.fillStyle = f > 0.5 ? '#3ecf5a' : f > 0.25 ? '#f5c518' : '#ff5a36'
      g.fillRect(x, y, w * f, h)
      g.fillStyle = 'rgba(0,0,0,0.5)'
      const seg = Math.max(4, Math.round(w / 8))
      for (let i = 1; i < seg; i++) g.fillRect(x + (w / seg) * i - 0.5, y, 1, h)
    }
    const bracket = (sx: number, sy: number, r: number, color: string) => {
      const l = Math.max(4, r * 0.35)
      g.strokeStyle = color
      g.lineWidth = 1.5
      g.beginPath()
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = sx + cx * r, py = sy + cy * r
        g.moveTo(px, py - cy * l); g.lineTo(px, py); g.lineTo(px - cx * l, py)
      }
      g.stroke()
    }
    for (const e of state.selectedEntities()) {
      if (!e.def) continue
      const k = effectiveScale(e.def, pxPerM)
      const r = e.def.size * k * (e.kind === 'b' ? 1.32 : 1.25) + 3
      const [sx, sy] = cam.worldToScreen(e.x, e.y)
      bracket(sx, sy, r, e.owner === state.myId ? 'rgba(255,255,255,0.95)' : 'rgba(255,120,90,0.95)')
      drawBar(e, sx, sy, r)
      if (e.def.kind === 'unit' && (e.def as any).role === 'extractor' && e.load !== undefined) {
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(sx - 12, sy - r - 15, 24, 3)
        g.fillStyle = '#4fc8ff'; g.fillRect(sx - 12, sy - r - 15, 24 * e.load, 3)
      }
    }
    if (cam.mpp < 40) {
      for (const e of state.entities.values()) {
        if (!e.def || e.hp >= e.maxHp || state.selected.has(e.id) || e.kind === 'd' || e.ghost) continue
        const [sx, sy] = cam.worldToScreen(e.x, e.y)
        if (sx < 0 || sy < 0 || sx > cam.width || sy > cam.height) continue
        drawBar(e, sx, sy, e.def.size * effectiveScale(e.def, pxPerM) + 3)
      }
    }
    const hover = input.hoverId !== undefined ? state.entities.get(input.hoverId) : undefined
    if (hover && hover.def && !state.selected.has(hover.id)) {
      const r = hover.def.size * effectiveScale(hover.def, pxPerM) * 1.25 + 3
      const [sx, sy] = cam.worldToScreen(hover.x, hover.y)
      bracket(sx, sy, r, hover.owner === state.myId ? 'rgba(255,255,255,0.45)' : 'rgba(255,120,90,0.5)')
    }
  }

  private drawBases() {
    const { camera: cam, state } = this.ctx
    const g = this.g
    if (cam.mpp < 25) return
    g.font = 'bold 11px sans-serif'
    g.textAlign = 'center'
    for (const b of state.bases) {
      const [sx, sy] = cam.worldToScreen(b.x, b.y)
      if (sx < -40 || sy < -40 || sx > cam.width + 40 || sy > cam.height + 40) continue
      const color = b.stale ? '#88968b' : state.playerColor(b.player)
      const own = b.player === state.myId
      g.fillStyle = color
      g.strokeStyle = '#000'
      g.lineWidth = 2
      g.beginPath(); g.moveTo(sx, sy - 9); g.lineTo(sx + 8, sy); g.lineTo(sx, sy + 9); g.lineTo(sx - 8, sy); g.closePath(); g.stroke(); g.fill()
      if (cam.mpp > 60) {
        g.fillStyle = 'rgba(0,0,0,0.6)'
        const name = (b.name ?? state.playerName(b.player)) + (b.stale ? ' · zuletzt erfasst' : b.source === 'radar' ? ' · Radar' : '')
        const w = g.measureText(name).width + 8
        g.fillRect(sx - w / 2, sy + 12, w, 14)
        g.fillStyle = own ? '#fff' : color
        g.fillText(name, sx, sy + 23)
      }
    }
    g.textAlign = 'left'
  }

  private drawPlacement() {
    const { camera: cam, input, state } = this.ctx
    if (!input.placing) return
    const def = DEFS[input.placing] as BuildingDef | undefined
    if (!def) return
    const g = this.g
    const { wx, wy } = input.mouse
    const check = input.placementCheck(def, wx, wy)
    const pxPerM = 1 / cam.mpp
    // Bauradius um eigene Gebäude
    g.strokeStyle = 'rgba(255,255,255,0.2)'
    g.lineWidth = 1
    g.setLineDash([6, 6])
    for (const e of state.entities.values()) {
      if (e.owner !== state.myId || e.kind !== 'b') continue
      const [bx, by] = cam.worldToScreen(e.x, e.y)
      g.beginPath(); g.arc(bx, by, BUILD_RADIUS * pxPerM, 0, Math.PI * 2); g.stroke()
    }
    g.setLineDash([])
    const [sx, sy] = cam.worldToScreen(wx, wy)
    const footprint = def.size * pxPerM
    g.fillStyle = check.ok ? 'rgba(100,230,155,.18)' : 'rgba(255,80,80,.22)'
    g.strokeStyle = check.ok ? '#8dffb0' : '#ff8a70'
    g.lineWidth = 2
    g.beginPath(); g.ellipse(sx,sy,footprint,footprint*cam.groundScale,0,0,Math.PI*2);g.fill();g.stroke()
    const r = Math.max(14, def.size * pxPerM * 1.1)
    g.font = 'bold 12px sans-serif'
    g.fillStyle = 'rgba(0,0,0,0.6)'
    const label = check.ok ? `${def.name} platzieren · Rechtsklick bricht ab` : (check.reason ?? 'Hier nicht baubar')
    const tw = g.measureText(label).width + 12
    g.fillRect(sx - tw / 2, sy + r + 6, tw, 18)
    g.fillStyle = check.ok ? '#8dffb0' : '#ff8a70'
    g.textAlign = 'center'
    g.fillText(label, sx, sy + r + 19)
    g.textAlign = 'left'
  }

  private drawSpawnMarker() {
    const { camera: cam, input, state } = this.ctx
    const g = this.g
    const pxPerM = 1 / cam.mpp
    // Sperrzonen um fremde Basen
    g.strokeStyle = 'rgba(255,90,54,0.5)'
    g.fillStyle = 'rgba(255,90,54,0.08)'
    g.lineWidth = 1
    for (const b of state.bases) {
      const [sx, sy] = cam.worldToScreen(b.x, b.y)
      const r = SPAWN_MIN_DISTANCE * pxPerM
      g.beginPath(); g.arc(sx, sy, Math.max(4, r), 0, Math.PI * 2); g.fill(); g.stroke()
    }
    if (!input.spawnPoint) return
    const [sx, sy] = cam.worldToScreen(input.spawnPoint[0], input.spawnPoint[1])
    g.strokeStyle = '#f5c518'
    g.lineWidth = 2
    g.beginPath(); g.arc(sx, sy, 12 + Math.sin(this.time * 5) * 3, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.moveTo(sx - 20, sy); g.lineTo(sx + 20, sy); g.moveTo(sx, sy - 20); g.lineTo(sx, sy + 20); g.stroke()
    g.font = 'bold 12px sans-serif'
    g.fillStyle = '#f5c518'
    g.fillText('Startpunkt', sx + 16, sy - 14)
  }

  get factions() { return FACTIONS }
  get palette() { return palette }
}

/**
 * Kleiner Ringpuffer für Bildzeiten. Er kostet drei Zahlen je Bild und macht
 * aus "es ruckelt" eine Messung: Bildabstand, Simulationsanteil, Zeichenanteil.
 * Auslesen im Browser mit window.__rcPerf.report().
 */
const perf = (() => {
  const N = 240
  const gap = new Float32Array(N), sim = new Float32Array(N), draw = new Float32Array(N)
  const parts = new Map<string, { total: number, n: number }>()
  const cam = { x: 0, y: 0, mpp: 0 }
  let i = 0, filled = 0
  const q = (a: Float32Array, n: number, p: number) => {
    const s = Array.from(a.slice(0, n)).sort((x, y) => x - y)
    return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2) : 0
  }
  const api = {
    push(g: number, s: number, d: number) {
      gap[i] = g; sim[i] = s; draw[i] = d
      i = (i + 1) % N
      if (filled < N) filled++
    },
    /** Kameralage mitschreiben – damit lässt sich prüfen, ob Verschieben wirkt. */
    camera(x: number, y: number, mpp: number) { cam.x = x; cam.y = y; cam.mpp = mpp },
    /** Einen benannten Abschnitt messen, etwa das Zeichnen des Geländes. */
    mark(name: string, ms: number) {
      const e = parts.get(name) ?? { total: 0, n: 0 }
      e.total += ms; e.n++
      parts.set(name, e)
    },
    report() {
      const out: Record<string, unknown> = {
        bilder: filled,
        abstandMs: { median: q(gap, filled, 0.5), p95: q(gap, filled, 0.95), max: q(gap, filled, 1) },
        simulationMs: { median: q(sim, filled, 0.5), p95: q(sim, filled, 0.95) },
        zeichnenMs: { median: q(draw, filled, 0.5), p95: q(draw, filled, 0.95) },
      }
      const ab: Record<string, number> = {}
      for (const [k, v] of parts) ab[k] = +(v.total / Math.max(1, v.n)).toFixed(2)
      out.abschnitteMsSchnitt = ab
      out.kamera = { x: Math.round(cam.x), y: Math.round(cam.y), mpp: +cam.mpp.toFixed(2) }
      return out
    },
    reset() { i = 0; filled = 0; parts.clear() },
  }
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__rcPerf = api
  return api
})()

export const renderPerf = perf

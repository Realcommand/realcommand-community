import { Context, Service } from 'cordis'
import { BUILD_RADIUS, WORLD_W, WORLD_H } from '../shared/constants.ts'
import { DEFS, type BuildingDef, type UnitDef } from '../shared/data.ts'
import type { OrderSpec } from '../shared/protocol.ts'
import { effectiveScale } from './sprites.ts'
import type { ClientEntity } from './state.ts'
import { checkPlacement } from '../shared/placement.ts'
import { translateError } from '../shared/errors.ts'
import { bindTouchMap } from './touch-map.ts'
import { tacticalNavigation, type CommandMode } from './tactics.ts'

/** Zoom je Einheit deltaY. Ein Mausrad rastet mit rund 100, Aufziehen mit 1–10. */
const ZOOM_WHEEL = 1.0025
const ZOOM_PINCH = 1.03
/**
 * Grenze je Ereignis. Trackpads liefern beim Aufziehen sehr unterschiedliche
 * Werte; ohne Grenze springt der Zoom bei einem kräftigen Wischer um das
 * Doppelte, statt gleichmäßig zu laufen.
 */
const clampStep = (f: number) => Math.min(1.35, Math.max(1 / 1.35, f))

declare module 'cordis' {
  interface Context {
    input: Input
  }
  interface Events {
    'input/spawn-point'(x: number, y: number): void
    /** Ein Befehl wurde erteilt: Empfänger und Art. Der Funk quittiert daran. */
    'input/order'(ids: number[], kind: string): void
  }
}

export type Mode = CommandMode

export class Input extends Service {
  static inject = ['camera', 'state', 'link', 'terrain', 'audio']
  private commandMode: Mode = 'normal'
  private queueEnabled = false
  private routeRepeats = false
  private routeStartPending = false
  private navigation?: ReturnType<typeof tacticalNavigation>
  get mode() { return this.commandMode }
  set mode(value: Mode) {
    this.commandMode = value
    if (value === 'normal') { this.queueEnabled = false; this.routeRepeats = false; this.routeStartPending = false }
    this.navigation?.set({ command: value, ...(value === 'normal' ? { queued: false, repeat: false } : {}) })
  }
  get queued() { return this.queueEnabled }
  set queued(value: boolean) { this.queueEnabled = value; this.navigation?.set({ queued: value }) }
  get repeat() { return this.routeRepeats }
  set repeat(value: boolean) { this.routeRepeats = value; this.navigation?.set({ repeat: value }) }

  /** First click replaces the old route, subsequent clicks append to it. */
  beginRoute(repeat: boolean) {
    this.placing = undefined
    this.mode = repeat ? 'attackmove' : 'move'
    this.queued = true
    this.repeat = repeat
    this.routeStartPending = true
  }

  endRoute() {
    this.mode = 'normal'
    this.queued = false
    this.repeat = false
    this.routeStartPending = false
  }
  placing?: string
  spawnPoint?: [number, number]
  mouse = { sx: 0, sy: 0, wx: 0, wy: 0, inside: false }
  drag?: { x0: number, y0: number, x1: number, y1: number }
  hoverId?: number
  private keys = new Set<string>()
  private down?: { button: number, sx: number, sy: number, moved: boolean, command: boolean }
  private lastClick?: { time: number, sx: number, sy: number }

  constructor(ctx: Context) {
    super(ctx, 'input')
  }

  [Service.init]() {
    if (typeof window !== 'undefined') {
      this.navigation = tacticalNavigation(window, route => { this.commandMode = route.command; this.queueEnabled = route.queued; this.routeRepeats = route.repeat })
      const route = this.navigation.current()
      this.commandMode = route.command; this.queueEnabled = route.queued; this.routeRepeats = route.repeat
    }
    const canvas = document.getElementById('game') as HTMLCanvasElement
    const onMove = (ev: MouseEvent) => this.onMouseMove(ev)
    const onDown = (ev: MouseEvent) => this.onMouseDown(ev)
    const onUp = (ev: MouseEvent) => this.onMouseUp(ev)
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const cam = this.ctx.camera
      // Ein Mausrad und ein Trackpad sagen dasselbe Ereignis, meinen aber
      // Verschiedenes: das Rad meint Zoom, zwei Finger meinen Schieben. Sie sind
      // unterscheidbar – ein Rad rastet in groben, ganzzahligen Stufen und kennt
      // kein deltaX, ein Trackpad wischt fein und in beide Richtungen. Sobald
      // einmal ein Trackpad erkannt wurde, gilt das für die restliche Sitzung.
      // Als sicheres Zeichen gilt nur waagerechtes Wischen: ein Mausrad kennt
      // keine zweite Achse. So wird kein Radnutzer versehentlich umgestellt.
      if (ev.deltaX !== 0) this.trackpad = true

      // Umschalt+Rad schiebt seitwärts, wie in Tabellen und Zeitleisten üblich.
      if (ev.shiftKey) { cam.panPixels(ev.deltaY || ev.deltaX, 0); return }
      // Aufziehen mit zwei Fingern meldet der Browser als Rad mit Strg – aber in
      // winzigen Schritten. Mit dem Faktor des Mausrads bräuchte man hundert
      // Wischer für eine Zoomstufe, deshalb ein deutlich kräftigerer Faktor.
      if (ev.ctrlKey) { cam.zoomBy(clampStep(Math.pow(ZOOM_PINCH, ev.deltaY)), ev.clientX, ev.clientY); return }
      if (this.trackpad) { cam.panPixels(ev.deltaX, ev.deltaY); return }
      cam.zoomBy(clampStep(Math.pow(ZOOM_WHEEL, ev.deltaY)), ev.clientX, ev.clientY)
    }
    const onCtx = (ev: MouseEvent) => ev.preventDefault()
    const onKeyDown = (ev: KeyboardEvent) => this.onKeyDown(ev)
    const onKeyUp = (ev: KeyboardEvent) => this.keys.delete(ev.code)
    const onLeave = () => { this.mouse.inside = false; this.keys.clear(); this.down = undefined; this.drag = undefined; this.lastClick = undefined }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onCtx)
    addEventListener('keydown', onKeyDown)
    addEventListener('keyup', onKeyUp)
    addEventListener('blur', onLeave)
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onLeave)
    const stopTouch = bindTouchMap(canvas, {
      pan: (dx, dy) => this.ctx.camera.panPixels(dx, dy),
      zoom: (factor, x, y) => this.ctx.camera.zoomBy(clampStep(factor), x, y),
      tap: (x, y) => {
        const event = new MouseEvent('mouseup', { button: 0, clientX: x, clientY: y })
        this.onMouseMove(event)
        this.onMouseDown(event)
        this.onMouseUp(event)
      },
    })
    return () => {
      this.navigation?.dispose()
      stopTouch()
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      removeEventListener('mouseup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onCtx)
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      removeEventListener('blur', onLeave)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onLeave)
    }
  }

  /** Tastatur-Scrollen, pro Frame. */
  update(dt: number) {
    const cam = this.ctx.camera
    const speed = 600 * dt
    let dx = 0, dy = 0
    // Die Zeigerposition allein bewegt die Karte nicht, auch nicht am Rand.
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= speed
    if (this.keys.has('KeyS') && !this.keys.has('ShiftLeft') || this.keys.has('ArrowDown')) dy += speed
    if (this.keys.has('KeyA') && this.mode !== 'attackmove' || this.keys.has('ArrowLeft')) dx -= speed
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += speed
    if (dx || dy) cam.panPixels(dx, dy)
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) cam.zoomBy(Math.pow(0.06, dt))
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) cam.zoomBy(Math.pow(16, dt))
    this.updateHover()
  }

  private updateHover() {
    if (!this.mouse.inside || this.drag) { this.hoverId = undefined; this.setCursor('default'); return }
    const e = this.pickAt(this.mouse.sx, this.mouse.sy)
    this.hoverId = e?.id
    this.setCursor(this.cursorFor(e))
  }

  private cursorFor(hover?: ClientEntity): string {
    const { state } = this.ctx
    if (state.phase === 'spawn') return 'build'
    if (state.phase !== 'play') return 'default'
    if (this.placing) return 'build'
    if (this.mode === 'attackmove') return 'attack'
    if (this.mode === 'rally' || this.mode === 'move') return 'move'
    const units = state.ownSelectedUnits()
    if (!units.length) return hover ? 'select' : 'default'
    if (!hover) return 'move'
    if (hover.kind === 'd') return units.some(u => (u.def as UnitDef).role === 'extractor') ? 'harvest' : 'move'
    if (hover.owner === state.myId) {
      if (hover.kind === 'u' && (hover.def as UnitDef).cargo && units.some(u => u.id !== hover.id)) return 'enter'
      return 'select'
    }
    if (hover.kind === 'b' && units.every(u => (u.def as UnitDef).role === 'engineer')) return 'capture'
    return 'attack'
  }

  private setCursor(name: string) {
    const canvas = document.getElementById('game')
    if (canvas && canvas.dataset.cursor !== name) canvas.dataset.cursor = name
  }

  private onMouseMove(ev: MouseEvent) {
    const cam = this.ctx.camera
    const sx = ev.clientX, sy = ev.clientY
    this.mouse.inside = true
    if (this.down && (this.down.button === 1 || this.down.button === 2)) {
      cam.panPixels(this.mouse.sx - sx, this.mouse.sy - sy)
      if (Math.abs(sx - this.down.sx) + Math.abs(sy - this.down.sy) > 4) this.down.moved = true
    } else if (this.down && this.down.button === 0) {
      if (Math.abs(sx - this.down.sx) + Math.abs(sy - this.down.sy) > 5) {
        this.down.moved = true
        if (!this.down.command) this.drag = { x0: this.down.sx, y0: this.down.sy, x1: sx, y1: sy }
      }
    }
    this.mouse.sx = sx; this.mouse.sy = sy
    ;[this.mouse.wx, this.mouse.wy] = cam.screenToWorld(sx, sy)
  }

  private onMouseDown(ev: MouseEvent) {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    this.down = { button: ev.button, sx: ev.clientX, sy: ev.clientY, moved: false, command: ev.button === 0 && ev.metaKey }
    if (this.down.command) ev.preventDefault()
    this.mouse.sx = ev.clientX; this.mouse.sy = ev.clientY
    ;[this.mouse.wx, this.mouse.wy] = this.ctx.camera.screenToWorld(ev.clientX, ev.clientY)
  }

  private onMouseUp(ev: MouseEvent) {
    const down = this.down
    if (!down) return
    this.down = undefined
    const drag = this.drag
    this.drag = undefined
    if (Math.abs(ev.clientX - down.sx) + Math.abs(ev.clientY - down.sy) > 5) down.moved = true
    // Das Loslassen über einem Menü darf keinen Befehl an die Karte darunter senden.
    if (!down.moved && !this.isMapPoint(ev.clientX, ev.clientY)) { this.lastClick = undefined; return }
    if (down.button === 0) {
      if (down.command || ev.metaKey) {
        ev.preventDefault()
        this.lastClick = undefined
        if (!down.moved) this.rightClick(ev)
      }
      else if (drag && down.moved) { this.lastClick = undefined; this.boxSelect(drag, ev.shiftKey) }
      else if (!down.moved) this.leftClick(ev)
    } else if (down.button === 2 && !down.moved) {
      this.rightClick(ev)
    }
  }

  private leftClick(ev: MouseEvent) {
    const { state, link, camera } = this.ctx
    const previousClick = this.lastClick
    this.lastClick = undefined
    const [wx, wy] = camera.screenToWorld(ev.clientX, ev.clientY)
    if (state.phase === 'spawn') {
      this.spawnPoint = [wx, wy]
      this.ctx.emit('input/spawn-point', wx, wy)
      return
    }
    if (state.phase !== 'play') return
    if (this.placing) {
      const def = DEFS[this.placing] as BuildingDef
      const check = this.placementCheck(def, wx, wy)
      if (!check.ok) { this.ctx.emit('state/notice', check.reason ?? 'Hier nicht baubar', 'error'); return }
      link.send({ t: 'place', type: this.placing, x: wx, y: wy })
      this.placing = undefined
      return
    }
    if (this.mode === 'attackmove' || this.mode === 'move') {
      this.issue({ k: this.mode, x: wx, y: wy }, ev.shiftKey)
      if (!ev.shiftKey && !this.queued) this.mode = 'normal'
      return
    }
    if (this.mode === 'rally') {
      const rallied: number[] = []
      for (const e of state.selectedEntities()) if (e.kind === 'b' && e.owner === state.myId) { link.send({ t: 'rally', id: e.id, x: wx, y: wy }); rallied.push(e.id) }
      if (rallied.length) this.ctx.emit('input/order', rallied, 'rally')
      this.mode = 'normal'
      return
    }
    // Mit eigener Auswahl folgt der Linksklick dem Zeiger: über freiem Gelände
    // zeigt er „bewegen“ – und bewegt jetzt auch. Eigene Einheiten anzuklicken
    // wählt weiterhin aus, sonst käme man an die Auswahl nie wieder heran; die
    // Auswahl selbst löst Escape.
    const selected = state.ownSelectedUnits()
    const hit = this.pickAt(ev.clientX, ev.clientY)
    const picksSelection = !!hit && hit.owner === state.myId
      && !(hit.kind === 'u' && (hit.def as UnitDef).cargo && selected.some(u => u.id !== hit.id))
    if (selected.length && !ev.shiftKey && !picksSelection) {
      this.commandAt(selected, hit, wx, wy, ev)
      return
    }
    const now = performance.now()
    const dbl = previousClick && now - previousClick.time < 350 && Math.hypot(ev.clientX - previousClick.sx, ev.clientY - previousClick.sy) <= 8
    if (dbl) {
      state.select(this.unitsInScreenRect({ x0: 0, y0: 0, x1: camera.width, y1: camera.height }), ev.shiftKey)
      return
    }
    this.lastClick = { time: now, sx: ev.clientX, sy: ev.clientY }
    if (!hit) { if (!ev.shiftKey) state.select([]); return }
    if (ev.shiftKey && hit.owner === state.myId) {
      if (state.selected.has(hit.id)) { state.selected.delete(hit.id); this.ctx.emit('state/selection') }
      else state.select([hit.id], true)
    } else {
      state.select([hit.id])
    }
  }

  private isMapPoint(sx: number, sy: number) {
    return document.elementFromPoint(sx, sy) === document.getElementById('game')
  }

  /** Dieselbe sichtbare Auswahl für Doppelklick und Rahmen, einschließlich aller Einheitentypen. */
  private unitsInScreenRect(rect: { x0: number, y0: number, x1: number, y1: number }): number[] {
    const { state, camera } = this.ctx
    const project = camera.projector()
    const ids: number[] = []
    for (const e of state.entities.values()) {
      if (e.owner !== state.myId || e.kind !== 'u' || !e.visible || e.ghost || e.inside !== undefined || e.hp <= 0) continue
      const [sx, sy] = project(e.x, e.y)
      if (sx >= rect.x0 && sx <= rect.x1 && sy >= rect.y0 && sy <= rect.y1 && this.isMapPoint(sx, sy)) ids.push(e.id)
    }
    return ids
  }

  private boxSelect(drag: { x0: number, y0: number, x1: number, y1: number }, additive: boolean) {
    const { state } = this.ctx
    if (state.phase !== 'play') return
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1)
    const y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1)
    const ids = this.unitsInScreenRect({ x0, y0, x1, y1 })
    if (ids.length) state.select(ids, additive)
  }

  private rightClick(ev: MouseEvent) {
    this.lastClick = undefined
    const { state, link, camera } = this.ctx
    if (this.placing) { this.placing = undefined; return }
    if (this.mode !== 'normal') { this.mode = 'normal'; return }
    if (state.phase !== 'play') return
    const [wx, wy] = camera.screenToWorld(ev.clientX, ev.clientY)
    const units = state.ownSelectedUnits()
    const hit = this.pickAt(ev.clientX, ev.clientY)
    if (!units.length) {
      // Gebäude gewählt: Sammelpunkt setzen
      const rallied: number[] = []
      for (const e of state.selectedEntities()) {
        if (e.kind === 'b' && e.owner === state.myId && (e.def as BuildingDef).produces) { link.send({ t: 'rally', id: e.id, x: wx, y: wy }); rallied.push(e.id) }
      }
      if (rallied.length) this.ctx.emit('input/order', rallied, 'rally')
      return
    }
    this.commandAt(units, hit, wx, wy, ev)
  }

  /**
   * Der Befehl, den der Zeiger verspricht. Rechtsklick, ⌘-Klick und – mit eigener
   * Auswahl – auch der einfache Linksklick laufen hier zusammen.
   */
  private commandAt(units: ClientEntity[], hit: ClientEntity | undefined, wx: number, wy: number, ev: MouseEvent) {
    const { state, link } = this.ctx
    if (!hit || hit.id === units[0].id && units.length === 1) {
      const transports = units.filter(u => (u.cargo ?? 0) > 0)
      if (transports.length && ev.ctrlKey) { this.issue({ k: 'unload', x: wx, y: wy }); return }
      this.issue(ev.ctrlKey ? { k: 'attackmove', x: wx, y: wy } : { k: 'move', x: wx, y: wy }, ev.shiftKey)
      return
    }
    if (hit.kind === 'd') {
      const extractors = units.filter(u => (u.def as UnitDef).role === 'extractor')
      this.orderTarget(extractors.map(u => u.id), 'harvest', hit.id)
      const others = units.filter(u => (u.def as UnitDef).role !== 'extractor')
      if (others.length) this.issueTo(others.map(u => u.id), { k: 'move', x: wx, y: wy }, ev.shiftKey)
      return
    }
    if (hit.owner === state.myId) {
      const hdef = hit.def as UnitDef
      if (hit.kind === 'u' && hdef.cargo) {
        const passengers = units.filter(u => u.id !== hit.id)
        this.orderTarget(passengers.map(u => u.id), 'load', hit.id)
        return
      }
      this.issue({ k: 'move', x: wx, y: wy }, ev.shiftKey)
      return
    }
    // Feind
    const engineers = units.filter(u => (u.def as UnitDef).role === 'engineer')
    this.orderTarget(hit.kind === 'b' ? engineers.map(u => u.id) : [], 'capture', hit.id)
    const fighters = units.filter(u => (u.def as UnitDef).role !== 'engineer')
    this.orderTarget(fighters.map(u => u.id), 'attack', hit.id)
  }

  issue(order: OrderSpec, queued = false) {
    if (order.k !== 'move' && order.k !== 'attackmove' && order.k !== 'fire') this.endRoute()
    this.issueTo(this.ctx.state.ownSelectedUnits().map(u => u.id), order, queued)
  }

  private issueTo(ids: number[], order: OrderSpec, queued = false) {
    if (!ids.length) return
    const routeOrder = order.k === 'move' || order.k === 'attackmove'
    if (routeOrder) {
      order = { ...order,
        ...((queued || this.queued) && !this.routeStartPending ? { queued: true } : {}),
        ...(this.queued ? { repeat: this.repeat } : {}),
      }
      this.routeStartPending = false
    }
    this.ctx.link.send({ t: 'order', ids, order })
    this.ctx.emit('input/order', ids, order.k)
  }

  /** Befehl mit Ziel-Objekt (angreifen, fördern, übernehmen, aufsitzen). */
  private orderTarget(ids: number[], kind: 'attack' | 'harvest' | 'capture' | 'load', target: number) {
    if (!ids.length) return
    this.ctx.link.send({ t: 'order', ids, order: { k: kind, target } })
    this.ctx.emit('input/order', ids, kind)
  }

  /** Vom UI-Dienst gesetzt: F1 öffnet die Hilfe, Enter springt ins Funkfeld. */
  onHelpKey?: () => void
  onChatKey?: () => void

  /** Einmal erkannt, bleibt es dabei: zwei Finger schieben, Aufziehen zoomt. */
  private trackpad = false

  private onKeyDown(ev: KeyboardEvent) {
    const { state, link, camera } = this.ctx
    const target = ev.target as HTMLElement
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.closest?.('button, select, [contenteditable="true"]')) {
      if (ev.key === 'Escape') target.blur()
      return
    }
    this.keys.add(ev.code)
    if (ev.key === 'Escape') { this.placing = undefined; this.mode = 'normal'; if (state.phase === 'play') state.select([]); return }
    // Hilfe und Funkfeld gehören dem UI-Dienst; er meldet sich hier an, damit
    // die Eingabe nichts über den DOM-Aufbau der Oberfläche wissen muss.
    if (ev.key === 'F1') { ev.preventDefault(); this.onHelpKey?.(); return }
    if (ev.key === 'Enter') { ev.preventDefault(); this.onChatKey?.(); return }
    if (state.phase !== 'play') return
    if (ev.ctrlKey && /^[1-9]$/.test(ev.key)) {
      ev.preventDefault()
      state.groups.set(Number(ev.key), [...state.selected])
      this.ctx.emit('state/notice', `Gruppe ${ev.key} gespeichert (${state.selected.size})`, 'info')
      return
    }
    if (/^[1-9]$/.test(ev.key)) {
      const ids = state.groups.get(Number(ev.key))
      if (ids) state.select(ids.filter(id => state.entities.has(id)))
      return
    }
    const units = state.ownSelectedUnits()
    switch (ev.code) {
      case 'KeyA': if (units.length) this.mode = 'attackmove'; break
      case 'KeyS': if (ev.shiftKey || units.length) { if (units.length) { this.mode = 'normal'; this.issue({ k: 'stop' }) } } break
      case 'KeyG': if (units.length) this.issue({ k: 'guard' }); break
      case 'KeyD': if (units.some(u => (u.def as UnitDef).role === 'crawler')) this.issue({ k: 'deploy' }); break
      case 'KeyU': if (units.some(u => (u.cargo ?? 0) > 0)) this.issue({ k: 'unload' }); break
      case 'KeyR': if (units.some(u => (u.def as UnitDef).domain === 'air' || u.def?.category === 'vehicle')) this.issue({ k: 'return' }); break
      case 'KeyH': { const home = state.homePosition(); if (home) camera.animateTo(home.x, home.y, Math.min(camera.mpp, 3)); break }
      case 'Space': {
        const sel = state.selectedEntities()
        if (sel.length) {
          const cx = sel.reduce((s, e) => s + e.x, 0) / sel.length, cy = sel.reduce((s, e) => s + e.y, 0) / sel.length
          camera.animateTo(cx, cy)
        }
        ev.preventDefault()
        break
      }
    }
    void link
  }

  /** Entität unter dem Bildschirmpunkt. */
  pickAt(sx: number, sy: number): ClientEntity | undefined {
    const { state, camera } = this.ctx
    const project=camera.projector()
    const pxPerM = 1 / camera.mpp
    let best: ClientEntity | undefined, bestD = Infinity, bestPrio = -1
    for (const e of state.entities.values()) {
      if ((!e.visible && !e.ghost) || e.inside !== undefined) continue
      if (!e.def && e.kind !== 'd') continue
      const [ex, ey] = project(e.x, e.y)
      const r = e.def ? Math.max(6, e.def.size * effectiveScale(e.def, pxPerM) * 1.3) : Math.max(6, 60 * pxPerM)
      const d = Math.hypot(ex - sx, ey - sy)
      if (d > r + 3) continue
      const prio = e.kind === 'u' ? 3 : e.kind === 'b' ? 2 : 1
      if (prio > bestPrio || (prio === bestPrio && d < bestD)) { best = e; bestD = d; bestPrio = prio }
    }
    return best
  }

  placementCheck(def: BuildingDef, wx: number, wy: number): { ok: boolean, reason?: string } {
    const { terrain, state } = this.ctx
    const issue=checkPlacement({def,x:wx,y:wy,owner:state.myId,terrain,allied:(a,b)=>{const alliance=state.players.get(a)?.allianceId;return alliance!==undefined&&alliance===state.players.get(b)?.allianceId},query:(x,y,r,visit)=>{
      for(const e of state.entities.values()) {
        if(!e.visible && !e.ghost)continue
        const d2=(e.x-x)**2+(e.y-y)**2
        if(d2<=r*r)visit({...e,kind:e.kind==='b'?'building':e.kind==='u'?'unit':'deposit'},d2)
      }
    }})
    return issue ? {ok:false,reason:translateError(issue.code,issue.message)} : {ok:true}
  }
}

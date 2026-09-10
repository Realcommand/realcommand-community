// Real Command · Sichtbare Effekte
// =============================================================================
// Leuchtspuren, Mündungsfeuer, Partikel, Krater und Spuren. Der Ton zu denselben
// Ereignissen entsteht getrennt davon in client/audio.ts.

import { Context, Service } from 'cordis'
import { DEFS } from '../shared/data.ts'
import type { GameEvent } from '../shared/protocol.ts'
import type { Camera } from './camera.ts'
import { makeModel, type Part } from './poly/models.ts'

declare module 'cordis' {
  interface Context {
    effects: Effects
  }
}

interface Tracer { x0: number, y0: number, x1: number, y1: number, t: number, ttl: number, w: string }
interface Flash { x: number, y: number, angle: number, t: number, ttl: number, size: number }
interface Ring { x: number, y: number, r: number, t: number, ttl: number, color: string, width: number }
interface Particle { x: number, y: number, vx: number, vy: number, t: number, ttl: number, size: number, grow: number, r: number, g: number, b: number, alpha: number, kind: 'smoke' | 'fire' | 'spark' | 'dust' | 'debris' | 'steam', drag: number, elevation?: number, rise?: number }
interface Decal { x: number, y: number, r: number, t: number, ttl: number, kind: 'crater' | 'wreck' | 'rubble', heading: number, w: number, h: number }
interface Track { x0: number, y0: number, x1: number, y1: number, w: number, t: number, ttl: number }
/** Aufsteigende Zahl über dem Ort des Geschehens, etwa „+1 Holz“. */
interface Float { x: number, y: number, text: string, color: string, t: number, ttl: number }

/** Waffen ohne Mündungsfeuer: Wurfbahnen und Handwaffen. */
const SILENT_MUZZLE = new Set(['bomb', 'torpedo', 'melee', 'arrow'])
/** Sammelziele, die stauben statt zu splittern. */
const HARD_RESOURCES = new Set(['stone', 'clay', 'sand', 'iron_ore', 'copper_ore', 'coal'])

const MAX_PARTICLES = 1600
const MAX_DECALS = 240
const MAX_FLOATS = 40

export class Effects extends Service {
  static inject = ['state', 'terrain']
  tracers: Tracer[] = []
  flashes: Flash[] = []
  rings: Ring[] = []
  particles: Particle[] = []
  decals: Decal[] = []
  tracks: Track[] = []
  floats: Float[] = []
  private lastTrack = new Map<number, { x: number, y: number }>()
  private emitTimers = new Map<number | string, number>()
  private exhaustPorts = new Map<string, Part[]>()
  private time = 0

  constructor(ctx: Context) {
    super(ctx, 'effects')
  }

  [Service.init]() {
    this.ctx.on('state/event', (ev) => this.onEvent(ev))
  }

  // ---------------------------------------------------------------- Ereignisse

  private onEvent(ev: GameEvent) {
    switch (ev.e) {
      case 'shot': {
        const angle = Math.atan2(ev.ty - ev.y, ev.tx - ev.x)
        const heavy = ev.w === 'shell' || ev.w === 'rocket' || ev.w === 'missile' || ev.w === 'torpedo'
        // ev.ttl ist die Flugzeit in Spielsekunden. Bei hohem Zeitfaktor muss die
        // Leuchtspur entsprechend kürzer zu sehen sein, sonst fliegt sie noch,
        // wenn das Ziel längst zerstört ist.
        const flight = Math.max(0.06, Math.min(ev.ttl / Math.max(1, this.ctx.state?.timeRate ?? 1), 6))
        this.tracers.push({ x0: ev.x, y0: ev.y, x1: ev.tx, y1: ev.ty, t: 0, ttl: flight, w: ev.w })
        // Nur Pulver blitzt. Bomben und Torpedos fallen, Pfeil und Nahkampf wirbeln höchstens Staub auf.
        if (!SILENT_MUZZLE.has(ev.w)) this.flashes.push({ x: ev.x, y: ev.y, angle, t: 0, ttl: heavy ? 0.14 : 0.07, size: heavy ? 5 : ev.w === 'flak' ? 1.6 : 2.2 })
        if (heavy) for (let i = 0; i < 3; i++) this.particle('smoke', ev.x + Math.cos(angle) * 4, ev.y + Math.sin(angle) * 4, Math.cos(angle) * 6 + (Math.random() - 0.5) * 3, Math.sin(angle) * 6 + (Math.random() - 0.5) * 3, 1.2, 1.5, 2.5, 0.35)
        else if (ev.w === 'melee') for (let i = 0; i < 3; i++) this.particle('dust', ev.x + Math.cos(angle) * 1.5, ev.y + Math.sin(angle) * 1.5, Math.cos(angle) * 3, Math.sin(angle) * 3, 0.4, 0.5, 0.6, 0.4)
        break
      }
      case 'hit': {
        const big = ev.r > 0
        // Wasser spritzt, statt zu funken und zu brennen.
        if (this.ctx.terrain?.isWater(ev.x, ev.y)) {
          const column = big ? Math.max(6, ev.r * 0.5) : 3
          for (let i = 0; i < (big ? 18 : 8); i++) {
            const a = Math.random() * Math.PI * 2, v = column * (0.6 + Math.random() * 1.2)
            this.particle('steam', ev.x, ev.y, Math.cos(a) * v * 0.4, Math.sin(a) * v * 0.4 - v, 0.7 + Math.random() * 0.6, column * 0.3, column * 0.25, 0.7)
          }
          this.rings.push({ x: ev.x, y: ev.y, r: column * 2, t: 0, ttl: 0.9, color: '190,225,255', width: 2 })
          break
        }
        // Flak zerplatzt in der Luft: dunkle Wolke, keine Bodenspur.
        if (!big && ev.w === 'flak') {
          for (let i = 0; i < 5; i++) this.particle('smoke', ev.x, ev.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 1.4 + Math.random(), 2.2, 2.6, 0.6)
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, v = 14 * (0.4 + Math.random())
            this.particle('spark', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.3, 0.5, 0, 1)
          }
          break
        }
        const n = big ? 14 : 6
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = (big ? 18 : 10) * (0.4 + Math.random())
          this.particle('spark', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.3, 0.5, 0, 1)
        }
        for (let i = 0; i < (big ? 6 : 2); i++) this.particle('smoke', ev.x, ev.y, (Math.random() - 0.5) * 4, -2 - Math.random() * 3, 1.5 + Math.random(), big ? 3 : 1.5, big ? 3 : 1.5, 0.45)
        if (big) {
          for (let i = 0; i < 4; i++) this.particle('fire', ev.x + (Math.random() - 0.5) * 3, ev.y + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, -1 - Math.random() * 2, 0.4 + Math.random() * 0.3, Math.max(3, ev.r * 0.35), 2, 0.9)
          this.rings.push({ x: ev.x, y: ev.y, r: Math.max(6, ev.r * 1.2), t: 0, ttl: 0.5, color: '255,230,160', width: 2 })
          this.decal('crater', ev.x, ev.y, Math.max(2, ev.r * 0.45), 0)
          // Schwere Sprengköpfe treiben eine Säule hoch und schicken eine zweite Welle über den Boden.
          if (ev.r >= 60) {
            for (let i = 0; i < 14; i++) this.particle('smoke', ev.x + (Math.random() - 0.5) * ev.r * 0.3, ev.y + (Math.random() - 0.5) * ev.r * 0.3, (Math.random() - 0.5) * 4, -6 - Math.random() * 10, 4 + Math.random() * 3, ev.r * 0.22, ev.r * 0.3, 0.6)
            for (let i = 0; i < 10; i++) {
              const a = Math.random() * Math.PI * 2, v = ev.r * (0.5 + Math.random())
              this.particle('dust', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random(), ev.r * 0.12, ev.r * 0.25, 0.5)
            }
            this.rings.push({ x: ev.x, y: ev.y, r: ev.r * 3, t: 0, ttl: 1.2, color: '255,190,120', width: 3 })
          }
        } else if (ev.w === 'shell' || ev.w === 'rocket' || ev.w === 'missile') {
          this.decal('crater', ev.x, ev.y, 2.5, 0)
        }
        break
      }
      case 'die': {
        if (ev.c) break
        const def = DEFS[ev.ty]
        const size = def ? def.size : 5
        const isBuilding = ev.k === 'b'
        // Ein gefallener Mensch hinterlässt Staub, kein Wrack und keinen Krater.
        if (ev.k === 'p' || ev.k === 'a') {
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 5
            this.particle('dust', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.5, 0.8, 1.2, 0.45)
          }
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 8
            this.particle('debris', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.4, 0.4, 0, 0.9)
          }
          this.rings.push({ x: ev.x, y: ev.y, r: Math.max(3, size * 1.6), t: 0, ttl: 0.6, color: '210,200,180', width: 2 })
          break
        }
        const scale = isBuilding ? size * 0.9 : size * 1.6
        for (let i = 0; i < (isBuilding ? 26 : 12); i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * scale * 0.7
          this.particle('fire', ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, (Math.random() - 0.5) * 6, -3 - Math.random() * 6, 0.8 + Math.random() * 0.9, scale * 0.35 + Math.random() * scale * 0.2, scale * 0.3, 0.95)
        }
        for (let i = 0; i < (isBuilding ? 30 : 14); i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * scale * 0.6
          this.particle('smoke', ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, (Math.random() - 0.5) * 5, -3 - Math.random() * 5, 3.5 + Math.random() * 3, scale * 0.3, scale * 0.4, 0.55)
        }
        for (let i = 0; i < (isBuilding ? 24 : 10); i++) {
          const a = Math.random() * Math.PI * 2, v = 12 + Math.random() * 22
          this.particle('debris', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.8, 0.6 + Math.random() * 1.2, 0, 1)
        }
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2, v = 25 + Math.random() * 25
          this.particle('spark', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.4 + Math.random() * 0.4, 0.6, 0, 1)
        }
        this.rings.push({ x: ev.x, y: ev.y, r: scale * 2.2, t: 0, ttl: 1.0, color: '255,220,140', width: 3 })
        this.rings.push({ x: ev.x, y: ev.y, r: scale * 1.2, t: 0, ttl: 0.35, color: '255,255,230', width: 6 })
        if (isBuilding) this.decal('rubble', ev.x, ev.y, size * 1.1, 0)
        else if (def && (def as any).domain === 'land' && def.category === 'vehicle') this.decal('wreck', ev.x, ev.y, size, Math.random() * Math.PI * 2, size * 2, size * 1.2)
        this.decal('crater', ev.x, ev.y, scale * 0.8, 0)
        break
      }
      case 'placed': {
        const def = DEFS[ev.ty]
        const s = def ? def.size : 30
        this.rings.push({ x: ev.x, y: ev.y, r: s * 1.6, t: 0, ttl: 1.2, color: '120,255,160', width: 2 })
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2
          this.particle('dust', ev.x + Math.cos(a) * s, ev.y + Math.sin(a) * s, Math.cos(a) * 4, Math.sin(a) * 4 - 1, 1.5 + Math.random(), s * 0.25, s * 0.2, 0.5)
        }
        break
      }
      case 'capture': {
        const e = this.ctx.state.entities.get(ev.id)
        if (!e) break
        const s = e.def ? e.def.size : 30
        this.rings.push({ x: e.x, y: e.y, r: s * 1.5, t: 0, ttl: 1.5, color: '255,220,80', width: 3 })
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2
          this.particle('spark', e.x + Math.cos(a) * s * 0.6, e.y + Math.sin(a) * s * 0.6, Math.cos(a) * 2, Math.sin(a) * 2 - 6, 0.9 + Math.random() * 0.5, 0.6, 0, 0.9)
        }
        break
      }
      // ---- v2 ----
      case 'gather': {
        // Steinstaub oder Späne – so ist von weitem zu sehen, woran gearbeitet wird.
        const hard = HARD_RESOURCES.has(ev.rs)
        for (let i = 0; i < (hard ? 6 : 4); i++) {
          const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6
          if (hard) this.particle('dust', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v - 2, 0.6 + Math.random() * 0.4, 0.5, 0.9, 0.5)
          else this.particle('debris', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v - 4, 0.5 + Math.random() * 0.4, 0.35, 0, 0.85)
        }
        break
      }
      case 'site_done': {
        const e = this.ctx.state.entities.get(ev.id)
        if (!e) break
        const s = e.def ? e.def.size : DEFS[ev.ty] ? DEFS[ev.ty].size : 20
        this.rings.push({ x: e.x, y: e.y, r: s * 1.4, t: 0, ttl: 1.4, color: '150,255,190', width: 3 })
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2
          this.particle('dust', e.x + Math.cos(a) * s * 0.8, e.y + Math.sin(a) * s * 0.8, Math.cos(a) * 2, Math.sin(a) * 2 - 1, 1.2 + Math.random(), s * 0.18, s * 0.15, 0.45)
        }
        break
      }
      case 'avatar_died': {
        this.rings.push({ x: ev.x, y: ev.y, r: 16, t: 0, ttl: 1.6, color: '255,120,120', width: 3 })
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6
          this.particle('dust', ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 1 + Math.random(), 1, 1.6, 0.5)
        }
        for (let i = 0; i < 5; i++) this.particle('smoke', ev.x, ev.y, (Math.random() - 0.5) * 2, -2 - Math.random() * 2, 2.5 + Math.random(), 1.4, 1.8, 0.4)
        break
      }
      case 'arrive': {
        const e = this.ctx.state.entities.get(ev.id)
        if (e) this.rings.push({ x: e.x, y: e.y, r: (e.def ? e.def.size : 20) * 1.3, t: 0, ttl: 1.2, color: '120,200,255', width: 2 })
        break
      }
    }
  }

  private particle(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, ttl: number, size: number, grow: number, alpha: number) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.splice(0, 100)
    let r = 200, g = 200, b = 200, drag = 0.9
    if (kind === 'smoke') { const v = 50 + Math.random() * 40; r = v; g = v; b = v + 4; drag = 0.85 }
    else if (kind === 'steam') { const v = 205 + Math.random() * 40; r = v; g = v; b = v; drag = 0.85 }
    else if (kind === 'fire') { r = 255; g = 150 + Math.random() * 70; b = 40; drag = 0.8 }
    else if (kind === 'spark') { r = 255; g = 230; b = 140; drag = 0.94 }
    else if (kind === 'dust') { r = 150; g = 135; b = 100; drag = 0.86 }
    else if (kind === 'debris') { const v = 40 + Math.random() * 40; r = v; g = v - 5; b = v - 10; drag = 0.9 }
    const particle: Particle = { x, y, vx, vy, t: 0, ttl, size, grow, r, g, b, alpha, kind, drag }
    this.particles.push(particle)
    return particle
  }

  /** Aufsteigende Zahl, etwa nach einer Lieferung: emitFloat(x, y, '+1 Holz'). */
  emitFloat(x: number, y: number, text: string, color = '#3fbdf5') {
    if (this.floats.length >= MAX_FLOATS) this.floats.shift()
    this.floats.push({ x, y, text, color, t: 0, ttl: 1.6 })
  }

  private decal(kind: Decal['kind'], x: number, y: number, r: number, heading: number, w = r, h = r) {
    if (this.decals.length >= MAX_DECALS) this.decals.splice(0, 20)
    this.decals.push({ x, y, r, t: 0, ttl: kind === 'crater' ? 120 : 90, kind, heading, w, h })
  }

  /** Rauch beschädigter Gebäude (vom Renderer je Frame aufgerufen, intern gedrosselt). */
  emitSmoke(id: number, x: number, y: number, size: number, damage: number) {
    const next = this.emitTimers.get(id) ?? 0
    if (this.time < next) return
    this.emitTimers.set(id, this.time + Math.max(0.12, 0.6 - damage * 0.5))
    const a = (id * 1.7 + Math.floor(this.time * 0.3)) % (Math.PI * 2), d = size * 0.5 * ((id % 7) / 7)
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d
    this.particle('smoke', px, py, (Math.random() - 0.5) * 2, -3 - Math.random() * 3, 3 + Math.random() * 2, size * 0.18, size * 0.22, 0.4 + damage * 0.3)
    if (damage > 0.6 && Math.random() < 0.5) this.particle('fire', px, py, (Math.random() - 0.5) * 1.5, -2 - Math.random() * 2, 0.5 + Math.random() * 0.4, size * 0.12, size * 0.06, 0.9)
  }

  /** Kettenspuren fahrender Fahrzeuge (Segmente alle paar Meter). */
  emitTracks(id: number, x: number, y: number, heading: number, width: number) {
    const last = this.lastTrack.get(id)
    if (!last) { this.lastTrack.set(id, { x, y }); return }
    const d = Math.hypot(x - last.x, y - last.y)
    if (d < Math.max(4, width * 0.8)) return
    if (d > 80) { this.lastTrack.set(id, { x, y }); return }
    if (this.tracks.length > 900) this.tracks.splice(0, 100)
    this.tracks.push({ x0: last.x, y0: last.y, x1: x, y1: y, w: width, t: 0, ttl: 40 })
    this.lastTrack.set(id, { x, y })
    void heading
  }

  /** Small, short-lived wisps originate at the normalized model's chimney mouths. */
  emitExhaust(e: {id:number,type:string,x:number,y:number,heading:number,off?:boolean}, ground: number) {
    if(e.off || (e.type !== 'power' && e.type !== 'factory'))return
    let ports=this.exhaustPorts.get(e.type)
    if(!ports) { ports=makeModel(DEFS[e.type]).filter(p=>p.exhaust);this.exhaustPorts.set(e.type,ports) }
    const scale=DEFS[e.type].size,cos=Math.cos(e.heading),sin=Math.sin(e.heading)
    for(const [i,port] of ports.entries()) {
      const key=`exhaust:${e.id}:${i}`
      if(this.time<(this.emitTimers.get(key) ?? 0))continue
      this.emitTimers.set(key,this.time+.10+Math.random()*.06)
      const radius=port.s[0]*scale/2
      const x=e.x+(port.p[0]*cos-port.p[2]*sin)*scale
      const y=e.y+(port.p[0]*sin+port.p[2]*cos)*scale
      const p=this.particle(port.exhaust!,x+(Math.random()-.5)*radius*.4,y+(Math.random()-.5)*radius*.4,
        radius*(.15+Math.random()*.12),radius*(Math.random()-.5)*.12,
        1.5+Math.random()*.9,radius*(.5+Math.random()*.35),radius*.2,port.exhaust==='steam'?.22:.3)
      p.elevation=ground+(port.p[1]+port.s[1]/2)*scale
      p.rise=radius*(2+Math.random());p.drag=.98
    }
  }

  /** Raffineriefackel; Schornsteinrauch kommt aus den Modellöffnungen. */
  emitAmbient(id: number, x: number, y: number, kind: 'flare', size: number) {
    const key = `ambient:${id}:${kind}`
    const next = this.emitTimers.get(key) ?? 0
    if (this.time < next) return
    this.emitTimers.set(key, this.time + 0.25)
    this.particle('fire', x, y, (Math.random() - 0.5) * 0.3, -1.5, 0.35 + Math.random() * 0.2, size * 0.22, size * 0.1, 0.85)
  }

  /** Staubfahne fahrender Fahrzeuge. */
  emitDust(id: number, x: number, y: number, heading: number, size: number) {
    const next = this.emitTimers.get(id) ?? 0
    if (this.time < next) return
    this.emitTimers.set(id, this.time + 0.18)
    const bx = x - Math.cos(heading) * size, by = y - Math.sin(heading) * size
    this.particle('dust', bx + (Math.random() - 0.5) * size * 0.6, by + (Math.random() - 0.5) * size * 0.6, -Math.cos(heading) * 2 + (Math.random() - 0.5) * 1.5, -Math.sin(heading) * 2 + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 0.6, size * 0.25, size * 0.35, 0.35)
  }

  /** Schaumspur eines fahrenden Schiffs: hinter dem Heck, nach beiden Seiten. */
  emitWake(id: number, x: number, y: number, heading: number, size: number) {
    const key = `wake:${id}`
    if (this.time < (this.emitTimers.get(key) ?? 0)) return
    this.emitTimers.set(key, this.time + 0.12)
    const back = -Math.cos(heading) * size * 0.9, backY = -Math.sin(heading) * size * 0.9
    for (const side of [-1, 1]) {
      const nx = -Math.sin(heading) * side, ny = Math.cos(heading) * side
      this.particle('steam', x + back + nx * size * 0.3, y + backY + ny * size * 0.3,
        nx * size * 0.5 - Math.cos(heading) * 2, ny * size * 0.5 - Math.sin(heading) * 2,
        2.2 + Math.random(), size * 0.22, size * 0.3, 0.5)
    }
  }

  /** Kondensstreifen schneller Flugzeuge – dünn, lang und ohne Auftrieb. */
  emitContrail(id: number, x: number, y: number, heading: number, size: number) {
    const key = `trail:${id}`
    if (this.time < (this.emitTimers.get(key) ?? 0)) return
    this.emitTimers.set(key, this.time + 0.16)
    const p = this.particle('steam', x - Math.cos(heading) * size, y - Math.sin(heading) * size,
      0, 0, 7 + Math.random() * 3, size * 0.18, size * 0.12, 0.3)
    p.drag = 1
  }

  /** Abwind eines Hubschraubers: Staub, der unter ihm nach außen weicht. */
  emitDownwash(id: number, x: number, y: number, size: number) {
    const key = `wash:${id}`
    if (this.time < (this.emitTimers.get(key) ?? 0)) return
    this.emitTimers.set(key, this.time + 0.2)
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2
      this.particle('dust', x + Math.cos(a) * size * 0.4, y + Math.sin(a) * size * 0.4,
        Math.cos(a) * size * 1.6, Math.sin(a) * size * 1.6, 0.7 + Math.random() * 0.4, size * 0.16, size * 0.4, 0.35)
    }
  }

  // ---------------------------------------------------------------- Simulation

  update(dt: number) {
    this.time += dt
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.t += dt; if (t.t >= t.ttl) this.tracers.splice(i, 1) }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t >= f.ttl) this.flashes.splice(i, 1) }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t >= r.ttl) this.rings.splice(i, 1) }
    for (let i = this.decals.length - 1; i >= 0; i--) { const d = this.decals[i]; d.t += dt; if (d.t >= d.ttl) this.decals.splice(i, 1) }
    for (let i = this.tracks.length - 1; i >= 0; i--) { const t = this.tracks[i]; t.t += dt; if (t.t >= t.ttl) this.tracks.splice(i, 1) }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.t += dt; if (f.t >= f.ttl) this.floats.splice(i, 1) }
    // Rauchfahne von Raketen
    for (const t of this.tracers) {
      if (t.w !== 'missile' && t.w !== 'rocket') continue
      const f = Math.min(1, t.t / t.ttl)
      if (Math.random() < 0.6) this.particle('smoke', t.x0 + (t.x1 - t.x0) * f, t.y0 + (t.y1 - t.y0) * f, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1.2 + Math.random() * 0.8, 1.2, 2.5, 0.3)
    }
    const drag = (p: Particle) => Math.pow(p.drag, dt * 10)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.t += dt
      if (p.t >= p.ttl) { this.particles.splice(i, 1); continue }
      const k = drag(p)
      p.vx *= k; p.vy *= k
      if (p.elevation !== undefined) p.elevation += p.rise! * dt
      else if (p.kind === 'smoke' || p.kind === 'fire' || p.kind === 'steam') p.vy -= 2.5 * dt
      if (p.kind === 'debris') p.vy += 6 * dt
      p.x += p.vx * dt; p.y += p.vy * dt
      p.size += p.grow * dt
    }
    if (this.emitTimers.size > 3000) this.emitTimers.clear()
    if (this.lastTrack.size > 3000) this.lastTrack.clear()
  }

  // ---------------------------------------------------------------- Zeichnen

  /** Bodenspuren (Krater, Wracks) – vor den Einheiten zeichnen. */
  drawDecals(g: CanvasRenderingContext2D, cam: Camera) {
    const project=cam.projector()
    if (cam.mpp > 60) return
    const pxPerM = 1 / cam.mpp
    if (cam.mpp < 6) {
      g.lineCap = 'round'
      for (const t of this.tracks) {
        const fade = Math.min(1, (t.ttl - t.t) / 12) * 0.35
        const [ax, ay] = project(t.x0, t.y0)
        const [bx, by] = project(t.x1, t.y1)
        if ((ax < -50 && bx < -50) || (ay < -50 && by < -50) || (ax > cam.width + 50 && bx > cam.width + 50) || (ay > cam.height + 50 && by > cam.height + 50)) continue
        const ang = Math.atan2(by - ay, bx - ax)
        const off = Math.max(1.5, t.w * 0.55 * pxPerM)
        const nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off
        g.strokeStyle = `rgba(35,30,22,${fade})`
        g.lineWidth = Math.max(1, t.w * 0.22 * pxPerM)
        g.beginPath(); g.moveTo(ax + nx, ay + ny); g.lineTo(bx + nx, by + ny); g.moveTo(ax - nx, ay - ny); g.lineTo(bx - nx, by - ny); g.stroke()
      }
      g.lineCap = 'butt'
    }
    for (const d of this.decals) {
      const fade = Math.min(1, (d.ttl - d.t) / 15)
      const [sx, sy] = project(d.x, d.y)
      if (sx < -100 || sy < -100 || sx > cam.width + 100 || sy > cam.height + 100) continue
      if (d.kind === 'crater') {
        const r = Math.max(1.5, d.r * pxPerM)
        const gr = g.createRadialGradient(sx, sy, r * 0.2, sx, sy, r)
        gr.addColorStop(0, `rgba(20,16,12,${0.55 * fade})`)
        gr.addColorStop(0.7, `rgba(35,28,20,${0.35 * fade})`)
        gr.addColorStop(1, 'rgba(35,28,20,0)')
        g.fillStyle = gr
        g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill()
      } else if (d.kind === 'wreck') {
        g.save()
        g.translate(sx, sy)
        g.rotate(d.heading)
        g.globalAlpha = 0.85 * fade
        const w = Math.max(6, d.w * pxPerM), h = Math.max(4, d.h * pxPerM)
        g.fillStyle = '#1f1d1a'
        g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h * 0.2); g.fill()
        g.fillStyle = '#3a342c'
        g.fillRect(-w * 0.3, -h * 0.3, w * 0.5, h * 0.6)
        g.restore()
      } else {
        const r = Math.max(3, d.r * pxPerM)
        g.fillStyle = `rgba(40,38,34,${0.7 * fade})`
        g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill()
        g.fillStyle = `rgba(70,66,60,${0.7 * fade})`
        for (let i = 0; i < 6; i++) { const a = i * 1.1 + d.x; g.fillRect(sx + Math.cos(a) * r * 0.5 - r * 0.12, sy + Math.sin(a) * r * 0.5 - r * 0.12, r * 0.25, r * 0.2) }
      }
    }
  }

  draw(g: CanvasRenderingContext2D, cam: Camera) {
    const project=cam.projector()
    const pxPerM = 1 / cam.mpp
    const far = cam.mpp > 200
    for (const t of this.tracers) {
      const f = t.t / t.ttl
      const [ax, ay] = project(t.x0, t.y0)
      const [bx, by] = project(t.x1, t.y1)
      const px = ax + (bx - ax) * f, py = ay + (by - ay) * f
      if (t.w === 'bullet' || t.w === 'cannon' || t.w === 'flak') {
        g.strokeStyle = t.w === 'flak' ? 'rgba(255,220,120,0.95)' : 'rgba(255,245,200,0.95)'
        g.lineWidth = 1.5
        const tail = Math.min(0.3, 1 - f)
        g.beginPath(); g.moveTo(ax + (bx - ax) * Math.max(0, f - tail), ay + (by - ay) * Math.max(0, f - tail)); g.lineTo(px, py); g.stroke()
      } else {
        const r = Math.max(2, (t.w === 'bomb' ? 1.2 : 0.8) * pxPerM)
        // Ballistische Bahn: Granaten steigen und fallen, Bomben fallen aus Flughöhe.
        const len = Math.hypot(bx - ax, by - ay)
        const height = t.w === 'shell' ? Math.sin(Math.PI * f) * Math.min(120, len * 0.22) : t.w === 'bomb' ? (1 - f) * Math.min(60, 40 * pxPerM + 12) : t.w === 'torpedo' ? 0 : Math.sin(Math.PI * f) * Math.min(30, len * 0.06)
        if (height > 1) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.arc(px, py, r * 0.9, 0, Math.PI * 2); g.fill() }
        g.fillStyle = t.w === 'shell' ? '#ffd27a' : t.w === 'bomb' ? '#ddd' : t.w === 'torpedo' ? '#9fd8ff' : '#ffb347'
        g.shadowColor = g.fillStyle; g.shadowBlur = 6
        g.beginPath(); g.arc(px, py - height, r, 0, Math.PI * 2); g.fill()
        g.shadowBlur = 0
        if (t.w === 'missile' || t.w === 'rocket') {
          g.strokeStyle = 'rgba(255,255,255,0.35)'
          g.lineWidth = Math.max(1.5, r * 0.8)
          g.beginPath(); g.moveTo(ax + (bx - ax) * Math.max(0, f - 0.15), ay + (by - ay) * Math.max(0, f - 0.15)); g.lineTo(px, py); g.stroke()
        }
      }
    }
    for (const fl of this.flashes) {
      const f = 1 - fl.t / fl.ttl
      const [sx, sy] = project(fl.x, fl.y)
      const r = Math.max(4, fl.size * pxPerM)
      g.save()
      g.translate(sx, sy)
      g.rotate(fl.angle)
      g.fillStyle = `rgba(255,240,180,${0.9 * f})`
      g.beginPath(); g.moveTo(0, -r * 0.35); g.lineTo(r * 2.2, 0); g.lineTo(0, r * 0.35); g.closePath(); g.fill()
      g.fillStyle = `rgba(255,200,90,${0.7 * f})`
      g.beginPath(); g.arc(r * 0.4, 0, r * 0.6, 0, Math.PI * 2); g.fill()
      g.restore()
    }
    if (!far) {
      for (const p of this.particles) {
        const [sx, sy] = project(p.x, p.y, p.elevation)
        if (sx < -50 || sy < -50 || sx > cam.width + 50 || sy > cam.height + 50) continue
        const life = 1 - p.t / p.ttl
        const size = p.elevation === undefined ? Math.max(1.2, p.size * pxPerM) : Math.abs(project(p.x+p.size,p.y,p.elevation)[0]-sx)
        if (p.elevation !== undefined) {
          if(size < .3)continue
          const alpha=p.alpha*Math.min(1,p.t/.16)*life*life
          const gr=g.createRadialGradient(sx,sy,0,sx,sy,size)
          gr.addColorStop(0,`rgba(${p.r},${p.g},${p.b},${alpha})`)
          gr.addColorStop(.45,`rgba(${p.r},${p.g},${p.b},${alpha*.6})`)
          gr.addColorStop(1,`rgba(${p.r},${p.g},${p.b},0)`)
          g.fillStyle=gr;g.beginPath();g.arc(sx,sy,size,0,Math.PI*2);g.fill()
        } else if (p.kind === 'spark') {
          g.strokeStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha * life})`
          g.lineWidth = Math.max(1, size)
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - p.vx * pxPerM * 0.05, sy - p.vy * pxPerM * 0.05); g.stroke()
        } else if (p.kind === 'fire') {
          const gr = g.createRadialGradient(sx, sy, 0, sx, sy, size)
          gr.addColorStop(0, `rgba(255,255,200,${p.alpha * life})`)
          gr.addColorStop(0.4, `rgba(${p.r},${p.g},${p.b},${p.alpha * life * 0.9})`)
          gr.addColorStop(1, `rgba(200,40,10,0)`)
          g.fillStyle = gr
          g.beginPath(); g.arc(sx, sy, size, 0, Math.PI * 2); g.fill()
        } else if (p.kind === 'debris') {
          g.fillStyle = `rgba(${p.r},${p.g},${p.b},${life})`
          g.fillRect(sx - size / 2, sy - size / 2, size, size)
        } else {
          g.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha * life * (p.kind === 'dust' ? 0.8 : 1)})`
          g.beginPath(); g.arc(sx, sy, size, 0, Math.PI * 2); g.fill()
        }
      }
    }
    for (const r of this.rings) {
      const f = r.t / r.ttl
      const [sx, sy] = project(r.x, r.y)
      g.strokeStyle = `rgba(${r.color},${(1 - f)})`
      g.lineWidth = r.width * (1 - f) + 0.5
      g.beginPath(); g.arc(sx, sy, Math.max(3, r.r * pxPerM) * (0.3 + f * 0.9), 0, Math.PI * 2); g.stroke()
    }

    // Aufsteigende Zahlen: nüchtern gesetzt, mit dunklem Saum für Lesbarkeit
    // über hellem wie dunklem Gelände. Nur bei nahem Zoom, sonst wird es Konfetti.
    if (pxPerM > 0.05 && this.floats.length) {
      g.save()
      g.font = '600 12px "JetBrains Mono", ui-monospace, monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineWidth = 3
      g.lineJoin = 'round'
      for (const fl of this.floats) {
        const f = fl.t / fl.ttl
        const [sx, sy] = project(fl.x, fl.y)
        const y = sy - 14 - f * 26
        g.globalAlpha = f < 0.75 ? 1 : (1 - f) * 4
        g.strokeStyle = 'rgba(5,7,10,.85)'
        g.strokeText(fl.text, sx, y)
        g.fillStyle = fl.color
        g.fillText(fl.text, sx, y)
      }
      g.restore()
    }
  }
}

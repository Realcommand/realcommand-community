import { Context, Service } from 'cordis'
import { DEFS, type Def, type FactionId } from '../shared/data.ts'
import type { BaseInfo, ContactWire, EntityKind, EntityWire, GameEvent, PlayerInfo, PlayerState, RadarStationWire, ServerMessage } from '../shared/protocol.ts'
import { translateError } from '../shared/errors.ts'
import type { FireDiscipline, RouteWaypoint } from '../shared/tactics.ts'

function angleDeltaLocal(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
function lerpAngleTo(a: number, b: number, k: number) {
  return a + angleDeltaLocal(a, b) * Math.min(1, k)
}

declare module 'cordis' {
  interface Context {
    state: GameState
  }
  interface Events {
    'state/phase'(phase: Phase): void
    'state/me'(me: PlayerState): void
    'state/players'(): void
    'state/bases'(): void
    'state/chat'(from: number, name: string, text: string): void
    'state/notice'(text: string, kind: 'info' | 'error'): void
    /** Neuer Kommandant angelegt – der Zugangscode muss gezeigt werden. */
    'state/created'(token: string): void
    'state/event'(ev: GameEvent): void
    'state/selection'(): void
  }
}

export type Phase = 'login' | 'connecting' | 'spawn' | 'play'

export interface Sample { t: number, x: number, y: number, h: number }

export interface ClientEntity {
  id: number
  kind: EntityKind
  type: string
  owner: number
  x: number
  y: number
  tx: number
  ty: number
  heading: number
  thead: number
  /** Turmwinkel (absolut), clientseitig auf das Ziel gerichtet. */
  turret: number
  /** Geschwindigkeit m/s laut Server */
  speed: number
  samples: Sample[]
  hp: number
  maxHp: number
  state?: string
  target?: number
  load?: number
  ammo?: number
  battery?: number
  cargo?: number
  inside?: number
  amount?: number
  repairing?: boolean
  off?: boolean
  dx?: number
  dy?: number
  route?: RouteWaypoint[]
  routeRepeat?: boolean
  fireDiscipline?: FireDiscipline
  rx?: number
  ry?: number
  visible: boolean
  ghost: boolean
  lastUpdate: number
  seen: number
  def?: Def
}

export class GameState extends Service {
  static inject = ['link']
  phase: Phase = 'login'
  me?: PlayerState
  myId = 0
  myInfo?: PlayerInfo
  faction?: FactionId
  name = ''
  token?: string
  players = new Map<number, PlayerInfo>()
  population = { online: 0, total: 0 }
  bases: BaseInfo[] = []
  entities = new Map<number, ClientEntity>()
  /**
   * Radarkontakte: Objekte, die das eigene Radar erfasst, aber niemand sieht.
   * Sie tragen bewusst nur Ort und Klasse – mehr verrät ein Blip nicht.
   */
  contacts: ContactWire[] = []
  /** Eigene Radarstellungen; daraus zeichnet die Karte die Abdeckung. */
  radarStations: RadarStationWire[] = []
  selected = new Set<number>()
  groups = new Map<number, number[]>()
  chat: { from: number, name: string, text: string, time: number }[] = []
  lastStateAt = 0
  /**
   * Gemessener Zeitfaktor des Servers: Weltsekunden je echter Sekunde. Effekte
   * brauchen ihn, weil Flugzeiten in Spielsekunden ankommen – bei Zeitfaktor
   * 1000 ist eine Granate längst eingeschlagen, während die Leuchtspur noch fliegt.
   */
  timeRate = 1
  private lastServerNow?: number
  private lastServerReal = 0
  /** Zeitpunkt (performance.now) des letzten Serverzustands, für Interpolation. */
  private statesReceived = 0

  constructor(ctx: Context) {
    super(ctx, 'state')
    try {
      this.name = localStorage.getItem('rc.name') ?? ''
      this.token = localStorage.getItem('rc.token') ?? undefined
    } catch {}
  }

  [Service.init]() {
    this.ctx.on('link/message', (msg) => this.handle(msg))
    this.ctx.on('link/close', (willRetry) => {
      if (this.phase === 'login') return
      this.setPhase(willRetry ? 'connecting' : 'login')
      this.ctx.emit('state/notice', willRetry ? 'Verbindung verloren – verbinde erneut …' : 'Verbindung getrennt', 'error')
    })
  }

  /** Neuen Kommandanten anlegen: bewusst OHNE gespeicherten Code. */
  loginAsNew(name: string) {
    this.name = name
    this.token = undefined
    try { localStorage.removeItem('rc.token') } catch {}
    this.setPhase('connecting')
    this.ctx.link.connect(name, undefined)
  }

  /** Anmeldung mit einem Zugangscode: der Name spielt dabei keine Rolle. */
  loginWithCode(code: string) {
    this.token = code.trim()
    this.setPhase('connecting')
    this.ctx.link.connect(this.name || 'Kommandant', this.token)
  }

  login(name: string) {
    this.name = name
    try { localStorage.setItem('rc.name', name) } catch {}
    this.setPhase('connecting')
    this.ctx.link.connect(name, this.token)
  }

  setPhase(phase: Phase) {
    if (this.phase === phase) return
    this.phase = phase
    this.ctx.emit('state/phase', phase)
  }

  private handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        this.myId = msg.player.id
        this.myInfo = msg.player
        this.faction = msg.faction
        this.token = msg.token
        this.name = msg.player.name
        try { localStorage.setItem('rc.token', msg.token); localStorage.setItem('rc.name', msg.player.name) } catch {}
        this.entities.clear()
        this.selected.clear()
        // Neue Kommandanten müssen ihren Zugangscode zu sehen bekommen: ohne ihn
        // kommen sie nach dem Löschen der Browserdaten nie wieder an ihre Basis.
        if (msg.created) this.ctx.emit('state/created', msg.token)
        this.setPhase(msg.player.spawned ? 'play' : 'spawn')
        break
      case 'error':
        this.ctx.emit('state/notice', translateError(msg.code, msg.msg), 'error')
        break
      case 'notice':
        this.ctx.emit('state/notice', msg.msg, 'info')
        break
      case 'players':
        this.population = { online: msg.online ?? msg.list.filter(p => p.online).length, total: msg.total ?? msg.list.length }
        this.players.clear()
        for (const p of msg.list) this.players.set(p.id, p)
        this.myInfo = this.players.get(this.myId) ?? this.myInfo
        if (this.myInfo?.faction) this.faction = this.myInfo.faction
        this.ctx.emit('state/players')
        break
      case 'bases':
        this.bases = msg.list
        this.ctx.emit('state/bases')
        break
      case 'chat':
        this.chat.push({ from: msg.from, name: msg.name, text: msg.text, time: Date.now() })
        if (this.chat.length > 60) this.chat.shift()
        this.ctx.emit('state/chat', msg.from, msg.name, msg.text)
        break
      case 'state':
        this.applyState(msg)
        break
    }
  }

  private applyState(msg: Extract<ServerMessage, { t: 'state' }>) {
    const now = performance.now()
    this.lastStateAt = now
    this.statesReceived++
    if (this.lastServerNow !== undefined && now > this.lastServerReal) {
      const rate = (msg.now - this.lastServerNow) / ((now - this.lastServerReal) / 1000)
      if (rate > 0 && Number.isFinite(rate)) this.timeRate = this.timeRate * .7 + rate * .3
    }
    this.lastServerNow = msg.now
    this.lastServerReal = now
    const wasSpawned = this.me?.spawned
    // v2: `me` kommt nur bei geänderter Version mit.
    if (msg.me) this.me = msg.me
    if (msg.me?.spawned && !wasSpawned) {
      if (msg.me.faction) this.faction = msg.me.faction
      this.setPhase('play')
    }
    // Alles verloren: der Server nimmt die Landung zurück, damit man neu
    // beginnen kann, statt als Zuschauer im eigenen Spiel zu sitzen.
    if (wasSpawned && msg.me && !msg.me.spawned) {
      this.entities.clear()
      this.selected.clear()
      this.ctx.emit('state/notice', 'Basis verloren. Wähle einen freien Startpunkt für den Wiederaufbau. Bankeinlagen bleiben erhalten; Einheiten und Bargeld werden nicht ersetzt.', 'error')
      this.setPhase('spawn')
    }
    if (msg.rc) this.contacts = msg.rc
    if (msg.rd) this.radarStations = msg.rd
    for (const w of msg.ents) this.upsert(w, now)
    for (const id of msg.gone) {
      const e = this.entities.get(id)
      if (!e) continue
      if (e.kind === 'b' && e.owner !== this.myId) { e.visible = false; e.ghost = true }
      else { this.entities.delete(id); this.selected.delete(id) }
    }
    let selectionChanged = false
    for (const id of msg.dead) {
      if (this.selected.delete(id)) selectionChanged = true
      this.entities.delete(id)
    }
    for (const ev of msg.evs) this.ctx.emit('state/event', ev)
    if (selectionChanged) this.ctx.emit('state/selection')
    if (msg.me) this.ctx.emit('state/me', msg.me)
  }

  private upsert(w: EntityWire, now: number) {
    let e = this.entities.get(w.i)
    const def = DEFS[w.ty]
    if (!e) {
      e = {
        id: w.i, kind: w.k, type: w.ty, owner: w.o, x: w.x, y: w.y, tx: w.x, ty: w.y, heading: w.h, thead: w.h, turret: w.h, speed: w.sp ?? 0,
        samples: [{ t: now, x: w.x, y: w.y, h: w.h }],
        hp: w.hp, maxHp: def ? def.hp : 1, visible: true, ghost: false, lastUpdate: now, seen: now, def,
      }
      this.entities.set(w.i, e)
    } else {
      // Große Sprünge (Teleport nach Entladen, Debug-Zeitfaktor) nicht interpolieren.
      const jump = Math.hypot(w.x - e.tx, w.y - e.ty)
      if (jump > 400 || !e.visible) { e.x = w.x; e.y = w.y; e.heading = w.h; e.samples.length = 0 }
      e.tx = w.x; e.ty = w.y; e.thead = w.h
      e.speed = w.sp ?? 0
      e.samples.push({ t: now, x: w.x, y: w.y, h: w.h })
      if (e.samples.length > 4) e.samples.shift()
      e.hp = w.hp
      e.owner = w.o
      e.visible = true
      e.ghost = false
      e.lastUpdate = now
    }
    e.state = w.s
    e.inside = w.inside
    e.visible = w.inside === undefined
    e.target = w.tg
    e.load = w.ld
    e.ammo = w.am
    e.battery = w.bt
    e.cargo = w.cg
    e.amount = w.a
    e.repairing = !!w.rp
    e.off = !!w.off
    e.dx = w.dx; e.dy = w.dy
    e.route = w.rt; e.routeRepeat = w.rr; e.fireDiscipline = w.fd
    e.rx = w.rx; e.ry = w.ry
  }

  /** Interpolation zwischen Serverzuständen (Wiedergabe ~300 ms hinter dem Server, lineare Bewegung). */
  update(dt: number) {
    const now = performance.now()
    const renderT = now - 320
    for (const e of this.entities.values()) {
      if (!e.visible) continue
      const s = e.samples
      if (e.kind !== 'u' || s.length === 0) {
        e.x = e.tx; e.y = e.ty; e.heading = e.thead
      } else if (s.length === 1 || renderT <= s[0].t) {
        const a = s[0]
        e.x = a.x; e.y = a.y; e.heading = lerpAngleTo(e.heading, a.h, dt * 8)
      } else {
        let i = s.length - 1
        while (i > 0 && s[i - 1].t > renderT) i--
        const b = s[i]
        if (renderT >= b.t) {
          // Extrapolation mit Servergeschwindigkeit (max. 0,4 s)
          const ahead = Math.min(0.4, (renderT - b.t) / 1000)
          e.x = b.x + Math.cos(b.h) * e.speed * ahead
          e.y = b.y + Math.sin(b.h) * e.speed * ahead
          e.heading = lerpAngleTo(e.heading, b.h, dt * 8)
        } else {
          const a = s[i - 1]
          const f = (renderT - a.t) / Math.max(1, b.t - a.t)
          e.x = a.x + (b.x - a.x) * f
          e.y = a.y + (b.y - a.y) * f
          e.heading = a.h + angleDeltaLocal(a.h, b.h) * f
        }
      }
      // Turm: auf Ziel richten, sonst in Fahrtrichtung.
      let aim = e.heading
      if (e.target !== undefined) {
        const t = this.entities.get(e.target)
        if (t && t.visible) aim = Math.atan2(t.y - e.y, t.x - e.x)
      }
      e.turret = lerpAngleTo(e.turret, aim, dt * 3.5)
    }
  }

  isOwn(e: ClientEntity) { return e.owner === this.myId }

  playerColor(id: number) {
    return this.players.get(id)?.color ?? (id === 0 ? '#9aa39e' : '#c0c0c0')
  }

  playerName(id: number) {
    return this.players.get(id)?.name ?? `Spieler ${id}`
  }

  select(ids: Iterable<number>, additive = false) {
    if (!additive) this.selected.clear()
    for (const id of ids) if (this.entities.has(id)) this.selected.add(id)
    this.ctx.emit('state/selection')
  }

  selectedEntities(): ClientEntity[] {
    const out: ClientEntity[] = []
    for (const id of this.selected) {
      const e = this.entities.get(id)
      if (e) out.push(e); else this.selected.delete(id)
    }
    return out
  }

  ownSelectedUnits(): ClientEntity[] {
    return this.selectedEntities().filter(e => e.kind === 'u' && e.owner === this.myId && e.inside === undefined)
  }

  /** Eigene Kommandozentrale (oder erstes eigenes Gebäude). */
  homePosition(): { x: number, y: number } | undefined {
    for (const e of this.entities.values()) if (e.owner === this.myId && e.type === 'command') return { x: e.x, y: e.y }
    for (const e of this.entities.values()) if (e.owner === this.myId && e.kind === 'b') return { x: e.x, y: e.y }
    for (const e of this.entities.values()) if (e.owner === this.myId && e.type === 'crawler') return { x: e.x, y: e.y }
    return this.me?.home
  }
}

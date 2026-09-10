import { Context, Service } from 'cordis'
import { PROTOCOL_VERSION } from '../shared/constants.ts'
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts'

declare module 'cordis' {
  interface Context {
    link: Link
  }
  interface Events {
    'link/open'(): void
    'link/close'(willRetry: boolean): void
    'link/message'(msg: ServerMessage): void
  }
}

/** WebSocket-Verbindung zum Spielserver mit automatischer Wiederverbindung. */
export class Link extends Service {
  static inject = []
  ws?: WebSocket
  connected = false
  latency = 0
  /** Geschätzte Serverzeit (Spielzeit in Sekunden). */
  serverTime = 0
  private serverTimeAt = 0
  private playerName = ''
  private token?: string
  private retry = 0
  private retryTimer?: number
  private pingTimer?: number
  private pingSent = 0
  private wantConnection = false

  constructor(ctx: Context) {
    super(ctx, 'link')
  }

  connect(name: string, token?: string) {
    this.playerName = name
    this.token = token
    this.wantConnection = true
    this.retry = 0
    // Ein zweiter Aufruf bei bestehender Verbindung darf sie nicht abreißen –
    // sonst löst der Abbruch eine Wiederverbindung aus, die die nächste gesunde
    // Verbindung wieder abreißt, und das schaukelt sich endlos auf.
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.open()
  }

  disconnect() {
    this.wantConnection = false
    this.ws?.close()
  }

  private open() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = undefined }
    if (this.ws) {
      // Die alte Verbindung wird zuerst abgemeldet, damit ihr onclose nichts mehr
      // auslöst; erst danach wird sie geschlossen.
      const old = this.ws
      this.ws = undefined
      old.onclose = null
      old.onmessage = null
      try { old.close() } catch {}
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}`)
    this.ws = ws
    ws.onopen = () => {
      this.connected = true
      this.retry = 0
      this.send({ t: 'hello', name: this.playerName, token: this.token, v: PROTOCOL_VERSION })
      this.ctx.emit('link/open')
      this.pingTimer = window.setInterval(() => {
        this.pingSent = performance.now()
        this.send({ t: 'ping', c: this.pingSent })
      }, 5000)
    }
    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.t === 'pong') {
        this.latency = Math.round(performance.now() - msg.c)
        this.serverTime = msg.now + this.latency / 2000
        this.serverTimeAt = performance.now()
      } else if (msg.t === 'welcome') {
        this.token = msg.token
        this.serverTime = msg.now
        this.serverTimeAt = performance.now()
      } else if (msg.t === 'state') {
        this.serverTime = msg.now
        this.serverTimeAt = performance.now()
      }
      this.ctx.emit('link/message', msg)
    }
    ws.onclose = () => {
      // Eine bereits abgelöste Verbindung meldet hier nur ihr eigenes Ende.
      // Sie darf weder den Zustand der aktuellen Verbindung überschreiben noch
      // einen neuen Versuch planen: genau das erzeugte eine endlose Schleife aus
      // „verbinde erneut“ und sofortigem Abbruch.
      if (this.ws !== ws) return
      const wasConnected = this.connected
      this.connected = false
      this.ws = undefined
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = undefined }
      const willRetry = this.wantConnection
      if (willRetry) {
        const delay = Math.min(15_000, 1000 * Math.pow(2, this.retry++))
        if (this.retryTimer) clearTimeout(this.retryTimer)
        this.retryTimer = window.setTimeout(() => this.open(), delay)
      }
      if (wasConnected || !willRetry) this.ctx.emit('link/close', willRetry)
    }
    ws.onerror = () => {}
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  /** Aktuelle Spielzeit (Sekunden), extrapoliert. */
  now() {
    return this.serverTime + (performance.now() - this.serverTimeAt) / 1000
  }

  [Service.init]() {
    return () => {
      this.wantConnection = false
      if (this.retryTimer) clearTimeout(this.retryTimer)
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.ws?.close()
    }
  }
}

import { civicPanel } from './ui/civic.ts'
import { worldPanel } from './ui/world.ts'
import type { CivicReport } from '../shared/civic.ts'
// Real Command · UI-Dienst
// =============================================================================
// Verbindet Spielzustand und HUD. Der DOM-Aufbau liegt vollständig in
// client/ui/shell.ts; hier steht nur noch, WANN sich was ändert. Deshalb gibt
// es in dieser Datei kein getElementById und kein innerHTML mehr.

import { Context, Service } from 'cordis'
import { BUILDINGS, UNITS, CATEGORIES, FACTIONS, DEFS, PRODUCER_ROLE, type Category, type Def, type FactionId, type UnitDef, type BuildingDef } from '../shared/data.ts'
import { formatLonLat, formatDistance, lonLatToWorld } from '../shared/geo.ts'
import { formatTime } from '../shared/math.ts'
import { WORLD_W, WORLD_H, COMMUNITY_REPO_URL, SELL_REFUND } from '../shared/constants.ts'
import { drawIcon } from './sprites.ts'
import { cancelReadyBuilding, cancelTarget, CANCEL_LABEL, missingPrereqs, productionMark, shownCategory } from './production.ts'
import type { ClientEntity, Phase } from './state.ts'
import { buildShell, type ShellRefs } from './ui/shell.ts'
import { h, fill } from './engine/render.ts'
import { installTheme } from './engine/theme.ts'
import { toast as engineToast, tooltip, openDialog } from './engine/widgets.ts'
import { Icon } from './engine/icons.ts'
import { radarBounds, paintRadarCoverage, paintRadarOverlay } from './ui/radar.ts'

import { radarNavigation, bindRadarControls } from './ui/radar-navigation.ts'
import { unitPanel } from './ui/units.ts'
import { unitStatus } from './ui/unit-roster.ts'
import { tacticalControls } from './ui/tactics.ts'

declare module 'cordis' {
  interface Context {
    ui: UI
  }
}

const TAB_ICON: Record<Category, string> = { structure: 'power', defense: 'turret', infantry: 'rifleman', vehicle: 'mbt', aircraft: 'gunship', ship: 'destroyer' }
const TAB_SHORT: Record<Category, string> = { structure: 'BAU', defense: 'SCHUTZ', infantry: 'INF', vehicle: 'FZG', aircraft: 'LUFT', ship: 'SEE' }

interface ItemCard {
  el: HTMLElement
  meta: HTMLElement
  cancel: HTMLElement
  badge: HTMLElement
  progress: HTMLElement
  percent: HTMLElement
  status: HTMLElement
  /** Symbolreihe der fehlenden Voraussetzungen; jedes Symbol führt dorthin. */
  needs: HTMLElement
}

export class UI extends Service {
  static inject = ['state', 'link', 'camera', 'input', 'terrain', 'audio']
  private shell!: ShellRefs
  private units!: ReturnType<typeof unitPanel>
  private city!: ReturnType<typeof civicPanel>
  private showCity!: () => void
  private global!: ReturnType<typeof worldPanel>
  private tab: Category = CATEGORIES.find(c => c.id === new URLSearchParams(location.search).get('tab'))?.id ?? 'structure'
  private icons = new Map<string, HTMLCanvasElement>()
  private faction: FactionId = 'aurora'
  private selectionKey = ''
  private cards = new Map<string, ItemCard>()
  private tabButtons = new Map<Category, HTMLElement>()
  private portraitType = ''
  /** Der Willkommensgruß gehört einmal ins Protokoll, nicht bei jeder Wiederverbindung. */
  private greeted = false
  private radarNavigation!: ReturnType<typeof radarNavigation>
  private disposeRadar?: () => void
  /**
   * Der Geländehintergrund des Radars liegt in einem eigenen Canvas, nicht als
   * ImageData. Verschieben ist damit ein drawImage statt getImageData +
   * putImageData – letzteres holt das Bild aus der Grafikkarte zurück und legt
   * die Darstellung jedes Mal kurz still. Genau das ruckelte beim Zoomen.
   */
  private radarCache?: { x0: number, y0: number, w: number, canvas: HTMLCanvasElement }
  private radarPending = false

  constructor(ctx: Context) {
    super(ctx, 'ui')
  }

  [Service.init]() {
    installTheme('dark')
    document.body.classList.add('rc-root')
    this.shell = buildShell(document.body)
    this.units = unitPanel({
      color: () => this.ctx.state.playerColor(this.ctx.state.myId),
      select: (ids, restoring) => {
        this.ctx.input.placing = undefined
        if (!restoring) this.ctx.input.mode = 'normal'
        this.ctx.state.select(ids)
      },
      pick: (entity, restoring) => {
        const target = entity.inside === undefined ? entity : this.ctx.state.entities.get(entity.inside)
        if (!target) return
        this.ctx.input.placing = undefined
        if (!restoring) this.ctx.input.mode = 'normal'
        this.ctx.state.select([target.id])
        this.ctx.camera.animateTo(target.x, target.y, Math.min(this.ctx.camera.mpp, 1.6))
        this.shell.closeUnitPanel()
      },
    })
    this.shell.unitsHost.append(this.units.element)
    const civicRequest = async (path: string, body?: unknown): Promise<CivicReport> => {
      const response = await fetch('/api/v1/me/civic' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.ctx.state.token }, body: body === undefined ? undefined : JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message ?? data.error ?? 'Aktion fehlgeschlagen.')
      return path ? data.civic : data
    }
    this.city = civicPanel({
      trade: (side, good, quantity) => civicRequest('/trade', { side, good, quantity }),
      education: enabled => civicRequest('/education', { enabled }),
      housing:()=>[...this.ctx.state.entities.values()].filter(e=>e.owner===this.ctx.state.myId&&e.type==='housing').map(e=>({id:e.id,name:'Wohnquartier #'+e.id})),
      upgrade:id=>civicRequest('/upgrade',{id}),
      build: id => { this.ctx.link.send({ t: 'produce', category: 'structure', type: id }); this.tab = 'structure'; this.buildTabs() },
    })
    this.showCity = () => { this.city.open(); void civicRequest('').then(this.city.update).catch(error => this.toast(error.message, 'error')) }
    this.shell.onCivic(this.showCity)
    this.global=worldPanel(async(body?:unknown)=>{
      const r=await fetch('/api/v1/me/world',{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer '+this.ctx.state.token},body:body===undefined?undefined:JSON.stringify(body)})
      const data=await r.json();if(!r.ok)throw new Error(data.error??'Globale Aktion fehlgeschlagen.');return data
    })
    this.shell.onWorld(()=>this.global.open())
    this.bindShell()
    this.buildFactions()
    this.buildTabs()

    this.ctx.on('state/phase', (phase) => this.onPhase(phase))
    this.ctx.on('state/me', () => this.refreshHud())
    this.ctx.on('state/players', () => this.refreshHud())
    this.ctx.on('state/notice', (text, kind) => this.toast(text, kind))
    // Funksprüche stehen im selben Kanal wie Befehle und Meldungen.
    this.ctx.on('audio/radio', (text) => this.addChat('Funk', text, 'var(--ok)'))
    this.ctx.on('state/chat', (from, name, text) => this.addChat(name, text,
      name === 'KI' ? 'var(--info)' : name === 'System' ? 'var(--accent)' : this.ctx.state.playerColor(from)))
    this.ctx.on('state/selection', () => { this.refreshSelection(); this.units.selectionChanged(this.ctx.state.selected) })
    this.ctx.on('input/spawn-point', (x, y) => this.onSpawnPoint(x, y))

    // Wenn das Fenster im Hintergrund liegt, drosselt der Browser zwar die
    // Zeitgeber, stellt sie aber nicht ab. Ohne diese Schranke arbeitet die
    // Oberfläche für ein Bild weiter, das niemand sieht.
    const wach = () => !document.hidden && this.ctx.state.phase !== 'login'
    const timers = [
      window.setInterval(() => { if (wach()) { this.refreshSelection(); this.units.update(this.ctx.state.entities, this.ctx.state.myId, this.ctx.state.selected) } }, 300),
      window.setInterval(() => { if (wach()) this.drawMinimap() }, 250),
      window.setInterval(() => { if (wach()) this.refreshCoords() }, 100),
    ]
    this.onPhase(this.ctx.state.phase)
    // Der Zeitfaktor kann sich auch von außen ändern (API, zweiter Client),
    // deshalb regelmäßig nachsehen statt nur beim Öffnen der Tafel.
    void this.refreshDebug()
    timers.push(window.setInterval(() => { if (!document.hidden) void this.refreshDebug() }, 5000))
    return () => {timers.forEach(clearInterval);this.global.close();this.global.dispose();this.disposeRadar?.();this.radarNavigation.dispose();this.units.dispose()}
  }

  // ---------------------------------------------------------------- Verdrahtung

  private bindShell() {
    const s = this.shell
    const { state, camera, audio, link } = this.ctx

    s.loginName.value = state.name
    // Eine bestehende Browsersitzung ist der bequeme Weg: der Zugangscode liegt
    // schon hier. Ohne ihn bleibt nur ein neuer Kommandant oder der Code selbst.
    s.setStoredName(state.token ? (state.name || 'Gespeicherter Zugang') : '')
    setTimeout(() => { if (!state.token) s.loginName.focus() }, 50)

    s.onLogin(() => {
      const name = s.loginName.value.trim()
      if (name.length < 2) { s.setLoginHint('Bitte mindestens 2 Zeichen.'); return }
      s.setLoginHint('')
      state.loginAsNew(name)
    })

    s.onLoginWithCode((code) => {
      const clean = code.trim()
      if (clean.length < 8) { s.setLoginHint('Das sieht nicht nach einem Zugangscode aus.'); return }
      s.setLoginHint('')
      state.loginWithCode(clean)
    })

    s.onContinue(() => {
      s.setLoginHint('')
      state.login(state.name || 'Kommandant')
    })

    this.ctx.on('state/created', (code) => s.showAccessCode(code))

    s.onSpawn(() => {
      const p = this.ctx.input.spawnPoint
      if (!p) return
      link.send({ t: 'spawn', x: p[0], y: p[1], faction: this.faction })
    })

    // Wo fremde Basen stehen, sieht man nicht mehr – also muss der Server einen
    // gültigen Platz vorschlagen können. Sonst klickte man blind gegen den
    // Mindestabstand.
    s.onSuggestSpot(() => this.suggestSpawnSpot())

    s.onHome(() => {
      const home = state.homePosition()
      if (home) camera.animateTo(home.x, home.y, Math.min(camera.mpp, 1.6))
    })

    // Ton: Knopf und Regler zeigen den gespeicherten Stand, bevor jemand klickt.
    s.setSound(audio.on)
    s.setMusic(audio.music)
    s.setVoice(audio.settings.voice)
    s.setVolumes({
      master: Math.round(audio.settings.master * 100),
      world: Math.round(audio.settings.world * 100),
      ambient: Math.round(audio.settings.ambient * 100),
      ui: Math.round(audio.settings.ui * 100),
      music: Math.round(audio.settings.music * 100),
      radio: Math.round(audio.settings.radio * 100),
      machines: Math.round(audio.settings.machines * 100),
    })
    s.onSound(() => s.setSound(audio.toggle()))
    s.onMusic(() => s.setMusic(audio.toggleMusic()))
    s.onVoice((mode) => s.setVoice(audio.setVoice(mode)))
    s.onVolume((which, value) => audio.setVolume(which, value / 100))
    // Jeder Knopf im HUD klickt hörbar; das Spielfeld selbst meldet sich über die Eingabe.
    s.root.addEventListener('click', (event) => {
      if ((event.target as HTMLElement)?.closest?.('button, .rc-switch, .rc-check')) audio.cue('ui.click')
    }, true)
    s.onHelp(() => s.openHelp())
    s.onChat((text) => link.send({ t: 'chat', text }))
    s.onCopyToken(async () => {
      try { await navigator.clipboard.writeText(state.token ?? ''); this.toast('Token kopiert') }
      catch { this.toast('Kopieren nicht möglich', 'error') }
    })
    s.onTimeScale((value) => this.setTimeScale(value))
    s.onApi(() => this.openApiPanel())
    this.radarNavigation = radarNavigation(window, () => radarBounds(camera, s.radarMode() === 'world'), () => this.drawMinimap())
    const centerRadar = () => this.radarNavigation.center(camera.x, camera.y)
    s.onRadarZoom(factor => this.radarNavigation.zoom(factor))
    s.onRadarCenter(centerRadar)
    s.onRadarReset(() => this.radarNavigation.reset())
    this.disposeRadar = bindRadarControls(s.minimap, this.radarNavigation, (x, y) => camera.animateTo(x, y), centerRadar)

    // Tastaturkürzel, die die Oberfläche betreffen, meldet der Dienst bei der
    // Eingabe an – sonst müsste die Eingabe Element-Ids kennen.
    this.ctx.input.onHelpKey = () => s.openHelp()
    this.ctx.input.onChatKey = () => s.chatInput.focus()

  }

  // ---------------------------------------------------------------- Phasen

  private onPhase(phase: Phase) {
    const s = this.shell
    s.setPhase(phase === 'connecting' ? 'connecting' : phase === 'spawn' ? 'spawn' : phase === 'play' ? 'play' : 'login')
    s.setLoginHint(phase === 'connecting' ? 'Verbinde …' : '')
    if (phase === 'spawn') {
      this.ctx.camera.moveTo(WORLD_W / 2, WORLD_H / 2, this.ctx.camera.maxMpp)
      this.ctx.input.spawnPoint = undefined
      s.setSpawnStatus('Noch kein Startpunkt gewählt – auf die Karte klicken. Mausrad zoomt.', false)
    }
    if (phase === 'play') {
      this.buildTabs()
      const home = this.ctx.state.homePosition()
      if (home) this.ctx.camera.moveTo(home.x, home.y, 1.6)
      else setTimeout(() => { const hp = this.ctx.state.homePosition(); if (hp) this.ctx.camera.moveTo(hp.x, hp.y, 1.6) }, 600)
      if (!this.greeted) {
        this.greeted = true
        this.addChat('System', 'Verbunden. F1 zeigt die Bedienung.', 'var(--accent)')
      }
    }
  }

  private buildFactions() {
    const host = this.shell.factionsHost
    const cards: HTMLElement[] = []
    for (const [id, f] of Object.entries(FACTIONS) as [FactionId, typeof FACTIONS[FactionId]][]) {
      const card = h('button', {
        type: 'button',
        class: { 'hud-faction': true, 'is-active': id === this.faction },
        onClick: () => {
          this.faction = id
          for (const c of cards) c.classList.toggle('is-active', c === card)
        },
      },
        h('div', { class: 'hud-faction-name' }, f.name),
        h('div', { class: 'hud-faction-motto rc-faint' }, f.motto),
        h('div', { class: 'hud-faction-desc rc-muted' }, f.description),
      )
      cards.push(card)
    }
    fill(host, ...cards)
  }

  /** Holt vom Server einen freien Landeplatz und fliegt ihn an. */
  private async suggestSpawnSpot() {
    const s = this.shell
    s.setSpawnStatus('Suche einen freien Platz …', false)
    try {
      const res = await fetch('/api/v1/spawn-spots?count=1')
      const data = await res.json()
      const spot = data.spots?.[0]
      if (!spot) { s.setSpawnStatus('Kein freier Platz gefunden. Bitte selbst einen Punkt wählen.', false); return }
      const { x, y } = lonLatToWorld(spot.lon, spot.lat)
      this.ctx.input.spawnPoint = [x, y]
      this.ctx.camera.animateTo(x, y, 400)
      this.onSpawnPoint(x, y)
    } catch {
      s.setSpawnStatus('Der Server antwortet nicht. Bitte selbst einen Punkt wählen.', false)
    }
  }

  private onSpawnPoint(x: number, y: number) {
    const s = this.shell
    if (!this.ctx.terrain.isLand(x, y)) {
      s.setSpawnStatus(`${formatLonLat(x, y)} – das ist Wasser. Bitte einen Punkt an Land wählen.`, false)
      return
    }
    let tooClose = false
    for (const b of this.ctx.state.bases) if (Math.hypot(b.x - x, b.y - y) < 60_000) tooClose = true
    s.setSpawnStatus(
      tooClose
        ? `${formatLonLat(x, y)} – zu nah an einer fremden Basis (min. 60 km).`
        : `Startpunkt ${formatLonLat(x, y)} – Land. Das Landungsflugzeug startet 18 km entfernt.`,
      !tooClose)
  }

  // ---------------------------------------------------------------- API-Tafel

  private openApiPanel() {
    const base = location.origin
    const token = this.ctx.state.token ?? '(noch nicht verbunden)'
    this.shell.openApi((f) => {
      f.token = token
      f.rest = [
        `curl -s ${base}/api/v1/me/situation -H "authorization: Bearer ${token}"`,
        `curl -s ${base}/api/v1/me/radar     -H "authorization: Bearer ${token}"`,
        `curl -s -X POST ${base}/api/v1/me/production -H "authorization: Bearer ${token}" \\`,
        `     -H "content-type: application/json" -d '{"type":"power"}'`,
        `OpenAPI: ${base}/api/v1/openapi.json · Regeln: ${base}/api/v1/rules`,
      ].join('\n')
      // Die Agenten liegen offen; ohne diese Zeile wäre `agents/…` ein Pfad,
      // den der Spieler nirgends findet.
      f.source = [
        `git clone ${COMMUNITY_REPO_URL}.git`,
        `cd realcommand-community && npm install`,
      ].join('\n')
      f.mcp = [
        `claude mcp add realcommand -e REALCOMMAND_URL=${base} -e REALCOMMAND_TOKEN=${token} \\`,
        `  -- node agents/mcp-server.mjs`,
        `# danach z. B.: "Baue meine Basis auf: Kraftwerk, Aufbereitung, Kaserne, Verteidigung."`,
      ].join('\n')
      f.agents = [
        `node agents/autopilot.mjs --url ${base} --token ${token}`,
        `LLM_API_KEY=… node agents/llm-commander.mjs --url ${base} --token ${token} --interval 45`,
        `# Werkzeuge für Aufklärung, Bau, Handel und Ausbildung.`,
      ].join('\n')
    })
    this.refreshDebug()
  }

  private async setTimeScale(value: number) {
    try {
      const r = await fetch('/api/v1/admin/timescale', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      this.toast(`Zeitfaktor jetzt ×${j.timeScale}`)
    } catch (error) {
      this.toast((error as Error).message ?? String(error), 'error')
    }
    this.refreshDebug()
  }

  /**
   * Im Betrieb gibt es die Debug-Endpunkte nicht. Dann hört diese Abfrage auf,
   * statt alle fünf Sekunden gegen eine 404 zu laufen – der Zeitfaktor ist dort
   * ohnehin fest 1.
   */
  private debugGone = false

  private async refreshDebug() {
    if (this.debugGone) return
    try {
      const r = await fetch('/api/v1/admin')
      if (r.status === 404 || r.status === 403) { this.debugGone = true; this.shell.setDebug(false, '–'); this.shell.setSpeed(1); return }
      const j = await r.json()
      this.shell.setDebug(r.ok, r.ok ? `aktuell ×${j.timeScale}` : '–')
      this.shell.setSpeed(r.ok ? Number(j.timeScale) || 1 : 1)
    } catch { this.shell.setDebug(false, '–'); this.shell.setSpeed(1) }
  }

  // ---------------------------------------------------------------- Kopfzeile

  private refreshCoords() {
    const { input, camera, link, state } = this.ctx
    const s = this.shell
    s.setCoords(input.mouse.inside ? formatLonLat(input.mouse.wx, input.mouse.wy) : '–')
    s.setScale(camera.scaleLabel())
    s.setPing(link.connected ? `${link.latency} ms` : 'offline', link.connected)
    if (state.phase === 'play' || state.phase === 'spawn') s.setClock(formatTime(link.now()))
  }

  private refreshHud() {
    const { state } = this.ctx
    const me = state.me
    if (!me) return
    const s = this.shell
    s.setFunds(me.funds.toLocaleString('de-DE'))
    s.setPower(me.powerProd, me.powerCons)
    s.setCounts(me.units, me.buildings)
    s.setProtection(me.protectedFor ?? 0)
    s.setOnline(`${state.population.online} / ${state.population.total} online`)
    if (me.civic) this.city.update(me.civic)
    if (state.phase === 'play' && new URLSearchParams(location.search).get('panel') === 'civic' && !this.city.isOpen()) this.showCity()
    if ((state.phase==='play'||state.phase==='spawn')&&new URLSearchParams(location.search).get('panel')==='world'&&!this.global.isOpen())this.global.open()
    this.refreshSidebar()
  }

  // ---------------------------------------------------------------- Bauliste

  private icon(def: Def, w = 96, h = 60) {
    const color = this.ctx.state.playerColor(this.ctx.state.myId)
    const key = `${def.id}:${color}:${w}x${h}`
    let c = this.icons.get(key)
    if (!c) { c = drawIcon(def, color, w, h); this.icons.set(key, c) }
    return c
  }

  private buildTabs() {
    this.tabButtons.clear()
    const buttons = CATEGORIES.map(cat => {
      const b = h('button', {
        type: 'button',
        class: { 'hud-tab': true, 'is-active': cat.id === this.tab },
        title: cat.name,
        onClick: () => this.selectTab(cat.id),
      },
        this.icon(DEFS[TAB_ICON[cat.id]], 68, 42),
        h('span', TAB_SHORT[cat.id]),
      )
      this.tabButtons.set(cat.id, b)
      return b
    })
    fill(this.shell.tabsHost, ...buttons)
    this.buildItems()
  }

  /**
   * Führt zu einem Bauplan: richtiger Reiter, in den sichtbaren Bereich gerollt,
   * kurz hervorgehoben. Ohne das sucht man die fehlende Voraussetzung in sechs
   * Reitern – und findet sie erst nach dem dritten Blick.
   */
  private revealItem(id: string) {
    const def = DEFS[id]
    if (!def) return
    this.selectTab(def.category)
    const card = this.cards.get(id)
    if (!card) return
    card.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    card.el.classList.add('is-flash')
    setTimeout(() => card.el.classList.remove('is-flash'), 1200)
    this.ctx.audio?.cue('ui.open')
  }

  /** Reiter wechseln – von den Reitern selbst und aus der Warteschlangenzeile. */
  private selectTab(cat: Category) {
    if (cat === this.tab) return
    this.tab = cat
    const url = new URL(location.href)
    url.searchParams.set('tab', cat)
    history.replaceState(null, '', url)
    this.buildTabs()
  }

  private defsForTab(): Def[] {
    const faction = this.ctx.state.faction
    const all: Def[] = this.tab === 'structure' || this.tab === 'defense' ? BUILDINGS : UNITS
    return all.filter(d => d.category === this.tab
      && !(d.kind === 'building' && d.role === 'command')
      && (!d.factions || (faction && d.factions.includes(faction))))
  }

  private buildItems() {
    this.cards.clear()
    const cards = this.defsForTab().map(def => {
      const badge = h('div', { class: 'hud-item-badge is-hidden' })
      // Fehlt eine Voraussetzung, steht sie nicht nur da: ein Klick auf ihr
      // Symbol springt zu ihr, statt dass man sie in sechs Reitern sucht.
      const needs = h('div', { class: 'hud-item-needs is-hidden' })
      const progress = h('div', { class: 'hud-item-progress' })
      const percent = h('div', { class: 'hud-item-pct rc-num' })
      const status = h('div', { class: 'hud-item-status' })
      const meta = h('div', { class: 'hud-item-meta rc-num' }, `${def.cost} · ${formatTime(def.buildTime)}`)
      // Abbrechen geht für jeden Stand: fertig, im Bau, eingereiht. Der Server
      // erstattet überall die vollen Kosten, deshalb fragt der Knopf nicht nach.
      const cancel = h('button', {
        type: 'button', class: 'hud-item-cancel is-hidden',
        title: `${def.cost.toLocaleString('de-DE')} Credits zurückerhalten`,
        onClick: () => this.cancelBuild(def),
      }, 'Stornieren')
      // Eine Zeile, kein Plakat: kleine scharfe Ikone links, Name und Kosten rechts.
      // Die Ikone wird doppelt so groß gezeichnet wie angezeigt, damit sie auf
      // Bildschirmen mit hoher Punktdichte nicht verwaschen wirkt.
      const el = h('button', {
        type: 'button',
        class: 'hud-item',
        onClick: () => this.clickItem(def),
        onContextMenu: (ev: Event) => { ev.preventDefault(); this.cancelItem(def) },
      },
        h('div', { class: 'hud-item-icon' }, this.icon(def, 116, 72)),
        h('div', { class: 'hud-item-text' },
          h('div', { class: 'hud-item-name' }, def.name),
          meta, needs),
        badge, percent, status, progress,
      )
      // Die Blase hängt am Element, nicht am Mauszeiger: Die Engine kennt nur
      // diese Form. Vorher rief diese Stelle tooltip.show/hide/move auf – die
      // gibt es nicht, jeder Zeigerwechsel warf einen Fehler und es erschien nie
      // eine Blase. Die Seitenleiste steht rechts, also klappt sie nach links auf.
      tooltip(el, () => this.tooltipView(def), { placement: 'left' })
      this.cards.set(def.id, { el, meta, cancel, badge, progress, percent, status, needs })
      return h('div', { class: 'hud-build-row' }, el, cancel)
    })
    fill(this.shell.itemsHost, ...cards)
    this.refreshSidebar()
  }

  private refreshSidebar() {
    const { state } = this.ctx
    const me = state.me
    if (!me) return
    const available = new Set(me.available)
    const slot = me.prod[this.tab]

    for (const [id, card] of this.cards) {
      const locked = !available.has(id)
      // Fehlende Voraussetzungen als anklickbare Symbole – der kurze Weg dorthin.
      const missing = locked ? missingPrereqs(DEFS[id], state.entities.values(), state.myId) : []
      card.needs.classList.toggle('is-hidden', !missing.length)
      // Die Zeile tritt an die Stelle von Kosten und Bauzeit: gesperrt zählt nur,
      // was fehlt, und die Karte bleibt so hoch wie alle anderen.
      card.meta.classList.toggle('is-hidden', missing.length > 0)
      if (missing.length && card.needs.dataset.for !== missing.join(',')) {
        card.needs.dataset.for = missing.join(',')
        fill(card.needs, h('span', { class: 'rc-faint' }, 'Fehlt:'), ...missing.map(need => h('button', {
          type: 'button', class: 'hud-need',
          title: `${DEFS[need].name} zuerst bauen – klicken führt hin`,
          'aria-label': `Zu ${DEFS[need].name} springen`,
          onClick: (ev: Event) => { ev.stopPropagation(); this.revealItem(need) },
        }, this.icon(DEFS[need], 44, 28))))
      }
      const active = slot?.type === id
      const ready = slot?.ready.filter(type=>type===id).length ?? 0
      // Der Knopf zeigt an, was er trifft: fertigen Bau, laufenden Bau oder Auftrag.
      const target = me.prod ? cancelTarget(me.prod, DEFS[id], 'ready') : undefined
      card.cancel.classList.toggle('is-hidden', !target)
      if (target) {
        card.cancel.textContent = CANCEL_LABEL[target.kind]
        card.cancel.setAttribute('aria-label', `${DEFS[id].name}: ${CANCEL_LABEL[target.kind]} – ${DEFS[id].cost.toLocaleString('de-DE')} Credits zurück`)
      }
      card.meta.textContent = ready ? (ready > 1 ? `${ready} × PLATZIEREN` : 'PLATZIEREN') : `${DEFS[id].cost} · ${formatTime(DEFS[id].buildTime)}`
      card.el.classList.toggle('is-locked', locked && !ready)
      card.el.classList.toggle('is-active', active)
      card.el.classList.toggle('is-ready', ready > 0)
      card.el.classList.toggle('is-blocked', active && !!slot?.blocked)
      const queued = slot?.queue.filter(q => q === id).length ?? 0
      card.badge.classList.toggle('is-hidden', !queued)
      card.badge.textContent = queued ? `+${queued}` : ''
      if (active) {
        const p = slot!.progress ?? 0
        card.progress.style.width = `${Math.round(p * 100)}%`
        if (slot!.blocked) { card.status.textContent = slot!.blocked; card.percent.textContent = '' }
        else { card.status.textContent = ''; card.percent.textContent = `${Math.round(p * 100)} %` }
      } else {
        card.progress.style.width = '0'
        card.status.textContent = ''
        card.percent.textContent = ''
      }
      if (ready) card.status.textContent = ''
    }

    for (const [cat, b] of this.tabButtons) b.classList.toggle('is-busy', !!me.prod[cat]?.type)

    // Die Zeile zeigt, was wirklich läuft – notfalls aus einer anderen Kategorie.
    // Vorher stand hier „Keine Produktion aktiv“, während die Fahrzeughalle baute,
    // nur weil ein anderer Reiter offen war.
    const order = CATEGORIES.map(c => c.id)
    const shown = shownCategory(me.prod, this.tab, order)
    const shownSlot = shown ? me.prod[shown] : undefined
    const q = this.shell.queueHost
    if (shown && shownSlot) {
      const running = shownSlot.type ? DEFS[shownSlot.type]?.name ?? shownSlot.type : ''
      const percent = Math.round((shownSlot.progress ?? 0) * 100)
      fill(q,
        h('button', {
          type: 'button', class: { 'hud-qcat': true, 'rc-caps': true, 'is-elsewhere': shown !== this.tab },
          title: shown === this.tab ? 'Warteschlange dieser Kategorie' : `Produktion läuft unter ${CATEGORIES.find(c => c.id === shown)?.name ?? shown} – klicken zum Wechseln`,
          onClick: () => this.selectTab(shown),
        }, TAB_SHORT[shown]),
        // Der laufende Bau ist anklickbar: das ist der Abbruch, den man am
        // häufigsten braucht und den es bisher nur per Rechtsklick gab.
        running && shownSlot.type
          ? h('button', {
              type: 'button', class: 'hud-qnow',
              title: `Bau abbrechen – ${(DEFS[shownSlot.type]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`,
              onClick: () => {
                this.ctx.link.send({ t: 'cancel', category: shown })
                this.toast(`${running}: Bau abgebrochen · ${(DEFS[shownSlot.type!]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`)
              },
            }, `${running} ${percent} %`)
          : h('span', { class: 'rc-faint' }, 'bereit'),
        shownSlot.remaining && !shownSlot.blocked
          ? h('span', { class: 'hud-qtime rc-num' }, formatTime(shownSlot.remaining))
          : undefined,
        // Der Blockgrund ist die wichtigste Information der Zeile: ohne ihn
        // steht der Bau still und niemand weiß, warum.
        shownSlot.blocked ? h('span', { class: 'hud-qblock' }, shownSlot.blocked) : undefined,
        ...(shownSlot.ready.length ? [h('button', {
          type: 'button', class: 'hud-qready',
          title: `Fertigen Bau stornieren – ${(DEFS[shownSlot.ready[0]]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`,
          onClick: () => {
            const type = shownSlot.ready[0]
            this.ctx.link.send({ t: 'cancel', category: shown, readyType: type })
            this.toast(`${DEFS[type]?.name ?? type}: storniert · ${(DEFS[type]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`)
          },
        }, `${shownSlot.ready.length} × platzieren`)] : []),
        ...shownSlot.queue.map((t, i) => h('button', {
          type: 'button', class: 'hud-qitem', title: `Auftrag streichen – ${(DEFS[t]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`,
          onClick: () => {
            this.ctx.link.send({ t: 'cancel', category: shown, index: i })
            this.toast(`${DEFS[t]?.name ?? t}: Auftrag gestrichen · ${(DEFS[t]?.cost ?? 0).toLocaleString('de-DE')} Credits zurück`)
          },
        }, DEFS[t]?.name ?? t)),
      )
    } else {
      const producer = PRODUCER_ROLE[this.tab]
      const has = [...state.entities.values()].some(e => e.owner === state.myId && e.kind === 'b' && (e.def as BuildingDef).role === producer)
      fill(q, h('span', { class: 'rc-faint' }, has ? 'Keine Produktion aktiv.' : `Benötigt: ${DEFS[producer]?.name ?? producer}`))
    }

    // Auf schmalen Fenstern liegt die Seitenleiste hinter der unteren Leiste.
    // Deshalb trägt der Knopf „Bauen“ selbst, was die Produktion gerade macht.
    this.shell.setProduction(productionMark(me.prod, order))
  }

  private clickItem(def: Def) {
    const { state, link, input } = this.ctx
    const me = state.me
    if (!me) return
    const slot = me.prod[def.category]
    if (slot?.ready.includes(def.id)) {
      input.placing = def.id
      this.toast(`${def.name} platzieren: auf die Karte klicken`)
      return
    }
    if (!me.available.includes(def.id)) {
      const missing = missingPrereqs(def, state.entities.values(), state.myId)
      this.toast(missing.length ? `Benötigt: ${missing.map(p => DEFS[p].name).join(', ')}` : 'Nicht verfügbar', 'error')
      // Ein Klick auf das gesperrte Feld führt gleich zum ersten fehlenden Stück.
      if (missing.length) this.revealItem(missing[0])
      return
    }
    if (me.funds < def.cost) { this.toast(`Nicht genug Geld (${def.cost} benötigt)`, 'error'); return }
    link.send({ t: 'produce', category: def.category, type: def.id })
  }

  /** Rechtsklick auf einen Bauplan: nimmt zuerst den zuletzt eingereihten Auftrag zurück. */
  private cancelItem(def: Def) {
    this.sendCancel(cancelTarget(this.ctx.state.me?.prod ?? {}, def, 'queue'), def)
  }

  /** Knopf an der Karte: räumt zuerst den fertigen Bau weg, der die Halle belegt. */
  private cancelBuild(def: Def) {
    const target = cancelTarget(this.ctx.state.me?.prod ?? {}, def, 'ready')
    if (target?.kind === 'ready') { cancelReadyBuilding(this.ctx, def); return }
    this.sendCancel(target, def)
  }

  private sendCancel(target: ReturnType<typeof cancelTarget>, def: Def) {
    if (!target) return
    this.ctx.link.send(target.message)
    this.toast(`${def.name}: ${CANCEL_LABEL[target.kind].toLowerCase()} · ${def.cost.toLocaleString('de-DE')} Credits zurück`)
  }

  /** Inhalt der Hinweisblase eines Bauplans. */
  private tooltipView(def: Def) {
    const rows: [string, string][] = [
      ['Kosten', `${def.cost}`],
      ['Bauzeit', formatTime(def.buildTime)],
      ['Panzerung', `${def.hp} TP · ${def.armor}`],
    ]
    if (def.kind === 'unit') {
      const u = def as UnitDef
      rows.push(['Tempo', `${u.speed} km/h`])
      rows.push(['Sicht', formatDistance(u.sight)])
      if (u.cargo) rows.push(['Ladung', String(u.cargo)])
      if (u.ammo) rows.push(['Munition', String(u.ammo)])
      if (u.endurance) rows.push(['Flugzeit', formatTime(u.endurance)], ['Vollladung', formatTime(u.recharge!)])
    } else {
      const b = def as BuildingDef
      rows.push(['Energie', `${b.power >= 0 ? '+' : ''}${b.power}`])
      rows.push(['Sicht', formatDistance(b.sight)])
      if (b.placement === 'coast') rows.push(['Lage', 'nur an der Küste'])
    }
    if (def.radar) rows.push(['Radar', `${formatDistance(def.radar)} Grundreichweite`])
    for (const w of def.weapons) {
      rows.push(['Waffe', `${w.warhead} · ${w.damage} Schaden / ${w.reload}s · ${formatDistance(w.range)} · ${w.targets.join('/')}`])
    }
    if (def.prereq.length) rows.push(['Voraussetzung', def.prereq.map(p => DEFS[p]?.name ?? p).join(', ')])
    if (this.ctx.state.me?.prod[def.category]?.ready.includes(def.id)) rows.push(['Stornieren', `${def.cost.toLocaleString('de-DE')} Credits zurück · Knopf neben dem Bauplan oder Rechtsklick`])

    return h('div', null,
      h('h4', def.name),
      h('div', { class: 'rc-muted' }, def.description),
      h('dl', null, ...rows.flatMap(([k, v]) => [h('dt', k), h('dd', v)])),
    )
  }

  // ---------------------------------------------------------------- Auswahl

  private refreshSelection() {
    const { state, link, input } = this.ctx
    const s = this.shell
    const sel = state.selectedEntities()
    if (!sel.length) { s.showSelection(false); this.selectionKey = ''; return }
    s.showSelection(true)
    const key = `${input.mode}:${input.queued}:${input.repeat}:` + sel.map(e => `${e.id}:${Math.ceil(e.hp)}:${e.state}:${e.cargo}:${e.repairing}:${e.ammo}:${e.battery}:${e.fireDiscipline}:${e.route?.length}:${e.routeRepeat}`).join(',')
    if (key === this.selectionKey) return
    this.selectionKey = key

    const first = sel[0]
    const own = first.owner === state.myId
    const def = first.def

    const pkey = `${first.type}:${first.owner}`
    if (this.portraitType !== pkey) {
      this.portraitType = pkey
      const p = s.portrait
      const g = p.getContext('2d')!
      g.clearRect(0, 0, p.width, p.height)
      if (def) g.drawImage(drawIcon(def, state.playerColor(first.owner), 96, 60), 0, 0)
      else {
        g.fillStyle = 'rgba(18,165,232,.12)'; g.fillRect(0, 0, 96, 60)
        g.fillStyle = '#3fbdf5'; g.font = 'bold 11px system-ui'; g.fillText('Lagerstätte', 12, 34)
      }
    }

    if (sel.length === 1) {
      const f = first.kind === 'd' ? 1 : first.hp / first.maxHp
      let info: string
      if (first.kind === 'd') info = `Restbestand ${(first.amount ?? 0).toLocaleString('de-DE')}`
      else {
        const st = unitStatus(first)
        info = [
          `${Math.ceil(first.hp)} / ${first.maxHp} TP`,
          st,
          first.cargo !== undefined ? `Ladung ${first.cargo}/${(def as UnitDef).cargo}` : '',
          first.ammo !== undefined ? `Munition ${first.ammo}` : '',
          first.battery !== undefined ? `Akku ${first.battery} %` : '',
          first.load !== undefined ? `Fracht ${Math.round(first.load * 100)} %` : '',
        ].filter(Boolean).join(' · ')
      }
      s.setSelection({
        name: def ? def.name : 'Lagerstätte',
        owner: first.kind === 'd' ? 'neutral' : state.playerName(first.owner),
        ownerColor: first.kind === 'd' ? 'var(--text-faint)' : state.playerColor(first.owner),
        hp: f,
        status: info,
      })
    } else {
      const counts = new Map<string, number>()
      let hpSum = 0, maxSum = 0
      for (const e of sel) { counts.set(e.type, (counts.get(e.type) ?? 0) + 1); hpSum += e.hp; maxSum += e.maxHp }
      s.setSelection({
        name: `${sel.length} Einheiten`,
        owner: own ? 'eigene Streitkräfte' : state.playerName(first.owner),
        ownerColor: state.playerColor(first.owner),
        hp: maxSum ? hpSum / maxSum : 1,
        status: [...counts].map(([t, n]) => `${n}× ${DEFS[t]?.name ?? t}`).join(' · '),
      })
    }

    const actions: HTMLElement[] = []
    if (own) {
      const add = (icon: Parameters<typeof Icon>[0], label: string, fn: () => void, title = '', danger = false) => {
        const button = h('button', {
          type: 'button', class: { 'hud-action': true, 'is-danger': danger }, title,
          onClick: fn,
        }, Icon(icon, { size: 14 }), h('span', label)) as HTMLButtonElement
        actions.push(button)
        return button
      }
      const units = sel.filter(e => e.kind === 'u' && e.owner === state.myId && e.inside === undefined)
      const buildings = sel.filter(e => e.kind === 'b')
      if (units.length) {
        actions.push(tacticalControls(input, units))
        add('shield', 'Wache', () => input.issue({ k: 'guard' }), 'G – Standort bewachen; Drohnen starten und kehren nach dem Laden zum Wachpunkt zurück')
        const crawlers = units.filter(u => (u.def as UnitDef).role === 'crawler')
        if (crawlers.length) {
          // Wer sich schon entfaltet, hat hier nichts mehr zu holen: ein zweiter
          // Auftrag setzt die 45 Sekunden nur von vorn an.
          const unfolding = crawlers.every(u => u.state === 'deploy')
          add('base', 'Entfalten', () => input.issue({ k: 'deploy' }),
            unfolding ? 'Entfaltet sich bereits – daraus wird die Kommandozentrale' : 'D – wird zur Kommandozentrale (45 s)',
          ).disabled = unfolding
        }
        if (units.some(u => (u.def as UnitDef).role === 'extractor')) add('resource', 'Abbauen', () => input.issue({ k: 'harvest' }))
        if (units.some(u => (u.cargo ?? 0) > 0)) add('download', 'Entladen', () => input.issue({ k: 'unload' }), 'U')
        if (units.some(u => (u.def as UnitDef).domain === 'air')) add('refresh', 'Zum Flugfeld', () => input.issue({ k: 'return' }), 'R – Akku laden, nachrüsten und ausbessern')
        if (units.some(u => (u.def as UnitDef).category === 'vehicle' && u.hp < u.maxHp * 0.99)) {
          add('wrench', 'In die Werkstatt', () => input.issue({ k: 'return' }), 'R – fährt zur nächsten Werkstatt und wird instand gesetzt')
        }
      }
      if (buildings.length === 1) {
        const b = buildings[0]
        // Ein unversehrtes Gebäude lässt sich nicht reparieren: der Server nimmt
        // den Auftrag wortlos nicht an. Der Knopf erscheint deshalb erst, wenn es
        // etwas auszubessern gibt – wie „In die Werkstatt“ bei den Fahrzeugen.
        if (b.repairing || b.hp < b.maxHp * 0.99) {
          add('wrench', b.repairing ? 'Reparatur stoppen' : 'Reparieren', () => { link.send({ t: 'repair', id: b.id }); this.ctx.audio?.play('repair', { x: b.x, y: b.y }) },
            'Baut Schäden laufend aus; volle Instandsetzung kostet 30 % der Baukosten. Unter Beschuss ruht die Arbeit.')
        }
        if ((b.def as BuildingDef).produces) add('pin', 'Sammelpunkt', () => { input.mode = 'rally' }, 'Danach Position anklicken')
        // Kein confirm(): eingebettete und ferngesteuerte Browser beantworten es
        // wortlos mit „nein“, und der Knopf tat dann gar nichts. Der Dialog der
        // Engine gehört ohnehin zum Rest der Oberfläche – und kann den Betrag
        // nennen, den es wirklich gibt: anteilig zum Zustand, nicht pauschal.
        add('trash', 'Verkaufen', () => {
          const def = b.def as BuildingDef | undefined
          const back = Math.floor((def?.cost ?? 0) * SELL_REFUND * (b.hp / b.maxHp))
          openDialog({
            title: `${def?.name ?? 'Gebäude'} verkaufen?`,
            icon: 'trash', danger: true, width: 420,
            actions: [
              { label: 'Abbrechen' },
              { label: 'Verkaufen', variant: 'danger', onSelect: () => {
                link.send({ t: 'sell', id: b.id })
                this.ctx.audio?.play('sell', { x: b.x, y: b.y })
              } },
            ],
          }, h('p', `Es verschwindet sofort. Zurück kommen ${back.toLocaleString('de-DE')} Credits – die Hälfte der Baukosten, anteilig zum Zustand.`))
        }, 'Halbe Baukosten zurück, anteilig zum Zustand', true)
      }
    }
    fill(this.shell.actionsHost, ...actions)
  }

  // ---------------------------------------------------------------- Radar

  private drawMinimap() {
    const tStart = performance.now()
    const perf = (window as unknown as { __rcPerf?: { mark(n: string, ms: number): void } }).__rcPerf
    const { terrain, state, camera } = this.ctx
    const mm = this.shell.minimap
    const bounds = mm.getBoundingClientRect()
    if (bounds.width < 1 || bounds.height < 1) return
    const W = Math.round(bounds.width), H = Math.round(bounds.height)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pixelW = Math.round(W * dpr), pixelH = Math.round(H * dpr)
    if (mm.width !== pixelW || mm.height !== pixelH) { mm.width = pixelW; mm.height = pixelH }
    const g = mm.getContext('2d')!
    g.setTransform(pixelW / W, 0, 0, pixelH / H, 0, 0)
    const rect = this.radarNavigation.rect()
    const worldMode = rect.w === WORLD_W
    g.fillStyle = '#0a141c'; g.fillRect(0, 0, W, H)
    const img = terrain.minimapImage()
    if (img) g.drawImage(img, rect.x0 / WORLD_W * img.width, rect.y0 / WORLD_H * img.height, rect.w / WORLD_W * img.width, rect.h / WORLD_H * img.height, 0, 0, W, H)
    if (worldMode) {
      this.shell.setRadarScale('Weltkarte')
    } else {
      const c = this.radarCache
      const stale = !c || c.w !== rect.w || c.canvas.width !== pixelW || c.canvas.height !== pixelH || Math.abs(c.x0 - rect.x0) > rect.w * .04 || Math.abs(c.y0 - rect.y0) > rect.h * .04
      if (stale) this.planRadarBackdrop(rect, rect.w, rect.h, pixelW, pixelH)
      if (c) {
        const k = c.w / rect.w
        g.drawImage(c.canvas, (c.x0 - rect.x0) / rect.w * W, (c.y0 - rect.y0) / rect.h * H, W * k, H * k)
      }
      this.shell.setRadarScale(formatDistance(rect.w) + ' breit')
    }
    g.fillStyle = 'rgba(5,12,18,.28)'; g.fillRect(0, 0, W, H)

    paintRadarCoverage(g, state.radarStations, rect, W, H)
    paintRadarOverlay(g, {
      rect, width: W, height: H, world: worldMode, viewport: camera.viewRect(),
      myId: state.myId, entities: state.entities.values(), bases: state.bases,
      contacts: state.contacts, selected: state.selected,
    })
    perf?.mark('radarkarte', performance.now() - tStart)
  }

  private planRadarBackdrop(rect: { x0: number, y0: number }, w: number, hh: number, W: number, H: number) {
    if (this.radarPending) return
    this.radarPending = true
    void this.ctx.terrain.radarImage(rect.x0,rect.y0,w,hh,W,H).then(image=>{
      if(!image)return
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      canvas.getContext('2d')!.putImageData(image,0,0)
      this.radarCache={x0:rect.x0,y0:rect.y0,w,canvas}
    }).finally(()=>{this.radarPending=false})
  }

  // ---------------------------------------------------------------- Funk und Meldungen

  /**
   * Befehlskanal. Er ist privat: hier stehen nur eigene Anweisungen, die
   * Rückmeldungen der eigenen KI und Meldungen des Spiels. Deshalb bekommt
   * jede Zeile eine erkennbare Herkunft statt nur eines Namens.
   */
  private addChat(name: string, text: string, color: string) {
    const log = this.shell.chatLog
    const art = name === 'KI' ? 'ki' : name === 'System' ? 'system' : 'ich'
    log.appendChild(h('div', { class: `hud-chatline is-${art}` },
      h('b', { style: { color } }, name),
      h('span', ' ' + text)))
    while (log.children.length > 80) log.firstElementChild!.remove()
    log.scrollTop = log.scrollHeight
  }

  toast(text: string, kind: 'info' | 'error' = 'info') {
    engineToast(text, { kind: kind === 'error' ? 'crit' : 'info' })
  }
}

export type { ClientEntity }

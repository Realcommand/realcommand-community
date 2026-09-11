// Real Command · HUD-Gerüst
// =============================================================================
// Baut die komplette Spieloberfläche aus den Bausteinen der UI-Engine und gibt
// benannte Griffe zurück. Der UI-Dienst (client/ui.ts) steuert damit, ohne
// jemals das DOM zu durchsuchen: kein getElementById, kein innerHTML.
//
// Aufteilung des Bildschirms:
//   Kopfzeile   – Ort, Maßstab, Zeit, Verbindung, Werkzeuge
//   links       – Karte (das Canvas des Spiels liegt darunter)
//   rechts      – Radar, Lage, Bauliste, Warteschlange
//   unten links – Auswahl und Befehle, darunter der Funkverkehr
//   Overlays    – Anmeldung, Landung, Schnittstelle, Hilfe

import { h, Show, For, text, insert, type View } from '../engine/render.ts'
import { signal, computed, onCleanup, type Accessor } from '../engine/signal.ts'
import { Icon, type IconName } from '../engine/icons.ts'
import { Header } from './header.ts'
import type { Volumes, VolumeKey, VoiceMode } from './audio-controls.ts'
import { urlPanelNavigation } from './header-navigation.ts'
import { MOBILE_QUERY } from '../responsive.ts'
import { COMMUNITY_REPO_URL } from '../../shared/constants.ts'
import { RADAR_COLORS } from './radar.ts'
import {
  Button, Meter, Tag, Kbd, Segmented,
  Panel, EmptyState, toast as engineToast, tooltip as attachTooltip,
} from '../engine/widgets.ts'

export interface ShellRefs {
  root: HTMLElement
  canvas: HTMLCanvasElement
  minimap: HTMLCanvasElement
  portrait: HTMLCanvasElement

  /** Kopfzeile */
  setCoords(v: string): void
  setScale(v: string): void
  setClock(v: string): void
  setPing(v: string, connected: boolean): void
  setOnline(v: string): void
  setSound(on: boolean): void
  setMusic(on: boolean): void
  setVoice(mode: VoiceMode): void
  setVolumes(v: Volumes): void

  /** Zeigt am Bauen-Knopf der unteren Leiste, dass etwas läuft, fertig ist oder klemmt. */
  setProduction(state: { progress: number, ready: number, blocked: boolean }): void

  /** Lage */
  setFunds(v: string): void
  setPower(prod: number, cons: number): void
  setCounts(units: number, buildings: number): void

  /** Radar */
  radarMode: Accessor<'local' | 'world'>
  toggleRadarMode(): void
  setRadarScale(v: string): void

  /** Bereiche, die der Dienst selbst füllt */
  unitsHost: HTMLElement
  closeUnitPanel(): void
  tabsHost: HTMLElement
  itemsHost: HTMLElement
  queueHost: HTMLElement
  actionsHost: HTMLElement
  chatLog: HTMLElement
  chatInput: HTMLInputElement
  factionsHost: HTMLElement

  /** Auswahlleiste */
  showSelection(v: boolean): void
  setSelection(o: { name: string, owner: string, ownerColor: string, hp: number, status: string }): void

  /** Phasen */
  setPhase(phase: 'login' | 'connecting' | 'spawn' | 'play'): void
  setLoginHint(v: string): void
  loginName: HTMLInputElement
  loginCode: HTMLInputElement
  /** Name aus der Browsersitzung; leer, wenn keine vorhanden ist. */
  setStoredName(v: string): void
  /** Zeigt den Zugangscode eines frisch angelegten Kommandanten. */
  showAccessCode(code: string): void
  setSpawnStatus(v: string, ready: boolean): void

  /** Overlays */
  openApi(fill: (o: ApiPanelFields) => void): void
  closeApi(): void
  openHelp(): void
  setDebug(visible: boolean, label: string): void
  /** Zeitfaktor für die Anzeige in der Kopfzeile; 1 blendet sie aus. */
  setSpeed(v: number): void
  /** Restlicher Landeschutz in Spielsekunden; 0 blendet die Anzeige aus. */
  setProtection(seconds: number): void

  onLogin(fn: () => void): void
  onLoginWithCode(fn: (code: string) => void): void
  onContinue(fn: () => void): void
  onSpawn(fn: () => void): void
  onSuggestSpot(fn: () => void): void
  onHome(fn: () => void): void
  onSound(fn: () => void): void
  onMusic(fn: () => void): void
  onVoice(fn: (mode: VoiceMode) => void): void
  onVolume(fn: (which: VolumeKey, value: number) => void): void
  onApi(fn: () => void): void
  onCivic(fn: () => void): void
  onWorld(fn: () => void): void
  onHelp(fn: () => void): void
  onChat(fn: (text: string) => void): void
  onTimeScale(fn: (value: number) => void): void
  onCopyToken(fn: () => void): void
  onRadarZoom(fn: (factor: number) => void): void
  onRadarCenter(fn: () => void): void
  onRadarReset(fn: () => void): void
}

export interface ApiPanelFields {
  token: string
  rest: string
  source: string
  mcp: string
  agents: string
}

type Handler<T = void> = (arg: T) => void
const noop = () => {}

export function buildShell(root: HTMLElement): ShellRefs {
  // --- Zustand, den das Gerüst selbst hält ---------------------------------
  const [phase, setPhaseSignal] = signal<'login' | 'connecting' | 'spawn' | 'play'>('login')
  // Solange das Anmeldefenster liegt, ist das ganze HUD nur Kulisse: es fängt
  // jeden Klick ab. Alles, was dann nicht bedienbar ist, bleibt ausgeblendet.
  const inWorld = () => phase() !== 'login' && phase() !== 'connecting'
  const [coords, setCoords] = signal('–')
  const [scale, setScale] = signal('–')
  const [clock, setClock] = signal('0h')
  const [ping, setPing] = signal('offline')
  const [connected, setConnected] = signal(false)
  const [online, setOnline] = signal('0')
  const [sound, setSound] = signal(false)
  const [music, setMusic] = signal(true)
  const [voice, setVoiceSignal] = signal<VoiceMode>('speech')
  const [volumes, setVolumes] = signal<Volumes>({ master: 70, world: 100, ambient: 5, ui: 75, music: 5, radio: 90, machines: 60 })
  const [funds, setFunds] = signal('0')
  const [powerProd, setPowerProd] = signal(0)
  const [powerCons, setPowerCons] = signal(0)
  const [units, setUnits] = signal(0)
  const [buildings, setBuildings] = signal(0)
  const [radarMode, setRadarMode] = signal<'local' | 'world'>('local')
  const radarNavigation = urlPanelNavigation(window, 'radar', ['local', 'world'], 'local', setRadarMode)
  setRadarMode(radarNavigation.current())
  onCleanup(radarNavigation.dispose)
  const [radarScale, setRadarScale] = signal('')
  const [loginHint, setLoginHint] = signal('')
  const [loginMode, setLoginMode] = signal<'neu' | 'code'>('neu')
  const [storedName, setStoredName] = signal('')
  const [newCode, setNewCode] = signal('')
  const [spawnStatus, setSpawnStatus] = signal('Noch kein Startpunkt gewählt – auf die Karte klicken.')
  const [spawnReady, setSpawnReady] = signal(false)
  const [apiOpen, setApiOpen] = signal(false)
  const [helpOpen, setHelpOpen] = signal(false)
  const [debugVisible, setDebugVisible] = signal(false)
  const [debugLabel, setDebugLabel] = signal('–')
  const [speed, setSpeed] = signal(0)
  const [protection, setProtection] = signal(0)
  const [apiFields, setApiFields] = signal<ApiPanelFields>({ token: '', rest: '', source: '', mcp: '', agents: '' })
  const [selVisible, setSelVisible] = signal(false)
  const [sel, setSel] = signal({ name: '–', owner: '', ownerColor: '#888', hp: 1, status: '' })
  const [sidePanel, setSidePanel] = signal<'build' | 'units'>('build')
  const sideNavigation = urlPanelNavigation(window, 'side', ['build', 'units'], 'build', setSidePanel)
  setSidePanel(sideNavigation.current()); onCleanup(sideNavigation.dispose)
  type MobilePanel = 'map' | 'build' | 'units' | 'radar' | 'chat'
  const [mobilePanel, setMobilePanel] = signal<MobilePanel>('map')
  const mobileNavigation = urlPanelNavigation(window, 'mobilePanel', ['map', 'build', 'units', 'radar', 'chat'], 'map', setMobilePanel)
  setMobilePanel(mobileNavigation.current())
  onCleanup(mobileNavigation.dispose)

  // --- Rückrufe ------------------------------------------------------------
  const cb = {
    login: noop as Handler, loginCode: noop as Handler<string>, weiter: noop as Handler,
    spawn: noop as Handler, suggest: noop as Handler, home: noop as Handler, sound: noop as Handler,
    music: noop as Handler, voice: noop as Handler<VoiceMode>,
    volume: noop as (which: VolumeKey, value: number) => void,
    civic: noop as Handler, world: noop as Handler, api: noop as Handler, help: noop as Handler,
    chat: noop as Handler<string>, timeScale: noop as Handler<number>,
    copyToken: noop as Handler, radarZoom: noop as Handler<number>, radarCenter: noop as Handler, radarReset: noop as Handler,
  }

  // --- Elemente, die der Dienst füllt --------------------------------------
  // Das Spiel-Canvas steht schon im Dokument: Renderer und Eingabe binden sich
  // vor dem UI-Dienst daran. Es hier neu zu erzeugen käme zu spät.
  const canvas = (document.getElementById('game')
    ?? root.appendChild(h('canvas', { id: 'game', 'data-cursor': 'default' }))) as HTMLCanvasElement
  const minimap = h('canvas', {
    class: 'hud-minimap', width: 264, height: 132, tabindex: 0,
    'aria-describedby': 'radar-instructions',
    'aria-label': 'Radarkarte mit Einheiten, Gebäuden und aktuellem Kameraausschnitt',
    title: 'Ziehen: Radar verschieben · Mausrad / zwei Finger: zoomen · Tippen: Hauptkarte bewegen',
  }) as HTMLCanvasElement
  const portrait = h('canvas', { class: 'hud-portrait', width: 96, height: 60 }) as HTMLCanvasElement
  const tabsHost = h('div', { class: 'hud-tabs' })
  const itemsHost = h('div', { class: 'hud-items' })
  const unitsHost = h('div', { class: 'hud-units-host' })
  const queueHost = h('div', { class: 'hud-queue' })
  const actionsHost = h('div', { class: 'hud-actions' })
  const chatLog = h('div', { class: 'hud-chatlog' })
  const factionsHost = h('div', { class: 'hud-factions' })
  const chatInput = h('input', {
    class: 'hud-chatinput', maxlength: 200, autocomplete: 'off',
    placeholder: 'Enter: Anweisung an deine KI',
    onKeyDown: (e: Event) => {
      const ev = e as KeyboardEvent
      if (ev.key !== 'Enter') return
      const value = chatInput.value.trim()
      chatInput.value = ''
      chatInput.blur()
      if (value) cb.chat(value)
    },
  }) as HTMLInputElement
  const loginName = h('input', {
    class: 'hud-loginname', maxlength: 20, autocomplete: 'off', placeholder: 'Dein Name',
    onKeyDown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') cb.login() },
  }) as HTMLInputElement
  const loginCode = h('input', {
    class: 'hud-loginname rc-mono', maxlength: 64, autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Zugangscode einfügen',
    onKeyDown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') cb.loginCode(loginCode.value) },
  }) as HTMLInputElement

  const selectRadarMode = (mode: 'local' | 'world') => { radarNavigation.set(mode); cb.radarReset() }

  // --- Kopfzeile -----------------------------------------------------------
  const mobileDock = h('nav', {
    class: { 'hud-mobile-nav': true, 'is-hidden': () => !inWorld() },
    'aria-label': 'Kartenbereiche',
    onKeyDown: (event: Event) => event.stopPropagation(),
  })
  const topbar = Header({
    host: root, coords, scale, clock, ping, online, connected, active: inWorld, sound, music, voice, volumes, speed, protection,
    mobileMenuHost: mobileDock, onMenuOpen: () => mobileNavigation.set('map'),
    onCivic: () => cb.civic(), onWorld: () => cb.world(), onHome: () => cb.home(),
    onUnits: () => {
      sideNavigation.set('units')
      if (matchMedia(MOBILE_QUERY).matches) mobileNavigation.set('units')
      requestAnimationFrame(() => unitsHost.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }))
    },
    onApi: () => cb.api(), onSound: () => cb.sound(), onHelp: () => cb.help(),
    onMusic: () => cb.music(),
    onVoice: (mode) => { setVoiceSignal(mode); cb.voice(mode) },
    onVolume: (which, value) => { setVolumes({ ...volumes(), [which]: value }); cb.volume(which, value) },
  })
  const openMobile = (next: MobilePanel) => {
    topbar.close()
    const destination = next === mobilePanel() && next !== 'map' ? 'map' : next
    mobileNavigation.set(destination)
    if (destination !== 'map') requestAnimationFrame(() => {
      if (mobilePanel() !== destination) return
      if (destination === 'chat') chatInput.focus({ preventScroll: true })
      else sidebar.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    })
  }
  const dockButtons = (['map', 'build', 'units', 'radar', 'chat'] as const).map(id => {
    const labels = { map: 'Karte', build: 'Bauen', units: 'Einheiten', radar: 'Radar', chat: 'Funk' }
    const icons = { map: 'map', build: 'build', units: 'aircraft', radar: 'radar', chat: 'terminal' } as const
    const button = Button({ label: labels[id], icon: icons[id], pressed: () => mobilePanel() === id, onClick: () => openMobile(id) })
    button.setAttribute('data-panel', id)
    return button
  })
  mobileDock.prepend(...dockButtons)
  const buildDock = dockButtons.find(b => b.dataset.panel === 'build')!
  const closeMobile = () => {
    mobileNavigation.set('map')
    dockButtons[0].focus({ preventScroll: true })
  }
  const mobileHead = (title: string | (() => string)) => h('div', { class: 'hud-mobile-panel-head' },
    h('b', typeof title === 'string' ? title : text(title)),
    Button({ label: 'Schließen', icon: 'close', onClick: closeMobile }))

  // --- Seitenleiste --------------------------------------------------------
  const sidebar = h('aside', { class: { 'hud-side': true, 'is-hidden': () => !inWorld() }, 'data-side-panel': sidePanel },
    mobileHead(() => mobilePanel() === 'radar' ? 'Radar & Versorgung' : mobilePanel() === 'units' ? 'Einheiten' : 'Bauen & Produktion'),
    h('div', { class: 'hud-radar', onKeyDown: (e: Event) => e.stopPropagation(), style: {
      '--radar-own': RADAR_COLORS.own, '--radar-foreign': RADAR_COLORS.foreign, '--radar-contact': RADAR_COLORS.contact,
    } },
      h('div', { class: 'hud-radar-bar' },
        Segmented({
          label: 'Radaransicht', value: radarMode, onChange: selectRadarMode,
          options: [{ value: 'local', label: 'Umgebung' }, { value: 'world', label: 'Welt' }],
        }),
        h('div', { class: 'hud-radar-controls', role: 'group', 'aria-label': 'Radarnavigation' },
          Button({ label: 'Radar vergrößern', icon: 'plus', iconOnly: true, onClick: () => cb.radarZoom(.5) }),
          Button({ label: 'Radar verkleinern', icon: 'minus', iconOnly: true, onClick: () => cb.radarZoom(2) }),
          Button({ label: 'Radar auf Kamera zentrieren', icon: 'target', iconOnly: true, onClick: () => cb.radarCenter() }),
        ),
      ),
      minimap,
      h('span', { id: 'radar-instructions', class: 'hud-radar-instructions' }, 'Ziehen verschiebt das Radar. Mausrad oder zwei Finger zoomen. Tippen bewegt die Hauptkarte. Tastatur: Pfeile, Plus, Minus und Pos1.'),
      h('div', { class: 'hud-radar-legend', 'aria-label': 'Radarlegende' },
        h('span', h('i', { class: 'is-own' }), 'Eigene'),
        h('span', h('i', { class: 'is-foreign' }), 'Fremde'),
        h('span', h('i', { class: 'is-contact' }), 'Kontakt'),
        h('span', h('i', { class: 'is-viewport' }), 'Kamera'),
        h('span', { class: 'rc-num hud-radar-scale' }, text(radarScale)),
      ),
    ),
    h('div', { class: 'hud-status' },
      h('div', { class: 'hud-funds' },
        h('span', { class: 'rc-caps' }, 'Guthaben'),
        h('b', { class: 'rc-num' }, text(funds)),
      ),
      Meter({
        label: 'Energie',
        value: powerProd,
        max: () => Math.max(1, powerProd(), powerCons()),
        threshold: powerCons,
        kind: 'accent',
        showValue: () => `${powerProd()} / ${powerCons()}`,
      }),
      h('div', { class: 'hud-counts' },
        h('span', { class: 'rc-caps' }, 'Einheiten · Gebäude'),
        h('b', { class: 'rc-num' }, text(() => `${units()} · ${buildings()}`)),
      ),
    ),
    h('div', { class: 'hud-side-switch' }, Segmented({
      label: 'Seitenleiste', value: sidePanel, onChange: value => sideNavigation.set(value),
      options: [{ value: 'build', label: 'Bauen' }, { value: 'units', label: 'Einheiten' }],
    })),
    unitsHost,
    tabsHost,
    itemsHost,
    queueHost,
  )

  // --- Auswahlleiste -------------------------------------------------------
  const command = h('div', { class: { 'hud-command': true, 'is-hidden': () => !selVisible() } },
    portrait,
    h('div', { class: 'hud-selinfo' },
      h('div', { class: 'hud-selname' }, text(() => sel().name)),
      h('div', { class: 'hud-selowner' },
        h('span', { class: 'hud-swatch', style: { background: () => sel().ownerColor } }),
        text(() => sel().owner)),
      h('div', { class: 'hud-hp' }, h('div', { class: 'hud-hp-fill', style: { width: () => Math.round(sel().hp * 100) + '%' } })),
      h('div', { class: 'hud-selstatus rc-faint' }, text(() => sel().status)),
    ),
    actionsHost,
  )

  // --- Funkverkehr ---------------------------------------------------------
  const chat = h('div', { class: { 'hud-chat': true, 'is-hidden': () => !inWorld() } },
    mobileHead('Funk & KI'), chatLog, chatInput)

  // --- Overlays ------------------------------------------------------------
  const loginOverlay = h('div', { class: { 'hud-overlay': true, 'is-hidden': inWorld } },
    h('div', { class: 'hud-dialog' },
      h('h1', { class: 'hud-title' }, 'Real Command'),
      h('p', { class: 'rc-muted' },
        'Ein persistentes Echtzeit-Strategiespiel auf der flachen Weltkarte. Keine Runden, kein Ende. ',
        'Panzer fahren in km/h, Flugzeuge brauchen Stunden über den Ozean, und eine Fabrik baut eben nicht zehn Panzer in zwei Sekunden.'),

      // Bestehende Sitzung: der Zugangscode liegt schon im Browser.
      Show(() => !!storedName(), () => h('div', { class: 'hud-session' },
        h('div', { class: 'hud-session-row' },
          Icon('user', { size: 15 }),
          h('div', null,
            h('div', { class: 'hud-session-name' }, text(storedName)),
            h('div', { class: 'rc-faint' }, 'in diesem Browser angemeldet'))),
        Button({
          label: 'Fortsetzen', variant: 'primary', full: true, icon: 'play',
          disabled: () => phase() === 'connecting', loading: () => phase() === 'connecting',
          onClick: () => cb.weiter(),
        }),
      )),

      h('div', { class: 'hud-tabs is-login' },
        h('button', {
          type: 'button', class: { 'hud-tab': true, 'is-active': () => loginMode() === 'neu' },
          onClick: () => { setLoginMode('neu'); setLoginHint('') },
        }, h('span', 'Neuer Kommandant')),
        h('button', {
          type: 'button', class: { 'hud-tab': true, 'is-active': () => loginMode() === 'code' },
          onClick: () => { setLoginMode('code'); setLoginHint('') },
        }, h('span', 'Mit Zugangscode')),
      ),

      Show(() => loginMode() === 'neu', () => h('div', { class: 'hud-loginbox' },
        h('label', { class: 'rc-caps' }, 'Name'),
        loginName,
        h('p', { class: 'rc-faint hud-small' },
          'Du bekommst danach einen Zugangscode. Er ist deine Identität – bewahre ihn auf, ',
          'sonst kommst du nach dem Löschen der Browserdaten nicht mehr an deine Basis.'),
        Button({
          label: 'Kommandant anlegen', variant: 'primary', full: true,
          disabled: () => phase() === 'connecting', loading: () => phase() === 'connecting',
          onClick: () => cb.login(),
        }),
      )),

      Show(() => loginMode() === 'code', () => h('div', { class: 'hud-loginbox' },
        h('label', { class: 'rc-caps' }, 'Zugangscode'),
        loginCode,
        h('p', { class: 'rc-faint hud-small' },
          'Derselbe Code, den auch die API und der MCP-Server benutzen. Wer ihn hat, spielt als du.'),
        Button({
          label: 'Anmelden', variant: 'primary', full: true,
          disabled: () => phase() === 'connecting', loading: () => phase() === 'connecting',
          onClick: () => cb.loginCode(loginCode.value),
        }),
      )),

      h('p', { class: 'hud-hint' }, text(loginHint)),
    ))

  // Der Zugangscode eines frisch angelegten Kommandanten – einmal, deutlich.
  const codeOverlay = h('div', { class: { 'hud-overlay': true, 'is-hidden': () => !newCode() } },
    h('div', { class: 'hud-dialog' },
      h('h2', { class: 'hud-title' }, 'Dein Zugangscode'),
      h('p', { class: 'rc-muted' },
        'Bewahre ihn auf. Mit ihm meldest du dich in jedem Browser an und steuerst deine Basis ',
        'über die API oder einen KI-Agenten. Wer ihn hat, spielt als du.'),
      h('div', { class: 'hud-codebox rc-mono' }, text(newCode)),
      h('div', { class: 'hud-row' },
        Button({
          label: 'Kopieren', icon: 'copy', full: true,
          onClick: () => { navigator.clipboard?.writeText(newCode()).catch(() => {}) },
        }),
        Button({ label: 'Verstanden', variant: 'primary', full: true, onClick: () => setNewCode('') }),
      ),
    ))

  // Der Zugangscode kommt zuerst. Erschienen beide Fenster gleichzeitig, läge
  // die Landeauswahl über dem Code und verdeckte den Knopf, mit dem man ihn
  // bestätigt – der Code ist die Identität, den darf niemand übersehen.
  const spawnOverlay = h('div', { class: { 'hud-overlay': true, 'is-passthrough': true, 'is-hidden': () => phase() !== 'spawn' || !!newCode() } },
    h('div', { class: 'hud-dialog is-wide' },
      h('h2', { class: 'hud-title' }, 'Wo willst du beginnen?'),
      h('p', { class: 'rc-muted' },
        'Wähle eine Fraktion und klicke dann auf einen Punkt an Land. Abstand zu fremden Basen: mindestens 60 km – wo die sind, weißt du nur, wenn du sie aufgeklärt hast. ',
        'Bei der ersten Landung bringt ein Flugzeug die Starttruppe. Nach einer Niederlage wird stattdessen dein letzter Gebäudeplan wieder aufgebaut – ohne Einheiten, Vorräte und Bargeld. Bankeinlagen bleiben erhalten. Du erhältst 15 Minuten Spielzeit Landeschutz.'),
      factionsHost,
      h('div', { class: 'hud-spawnstatus' }, text(spawnStatus)),
      h('div', { class: 'hud-row is-end' },
        Button({ label: 'Platz vorschlagen', icon: 'search', variant: 'quiet', onClick: () => cb.suggest() }),
        Button({ label: 'Hier landen', icon: 'aircraft', variant: 'primary', disabled: () => !spawnReady(), onClick: () => cb.spawn() })),
    ))

  const apiOverlay = h('div', { class: { 'hud-overlay': true, 'is-hidden': () => !apiOpen() } },
    h('div', { class: 'hud-dialog is-wide is-scroll' },
      h('h2', { class: 'hud-title' }, 'API & KI'),
      h('p', { class: 'rc-muted' },
        'Real Command ist API-first: alles, was du hier klickst, geht über dieselbe Schnittstelle. ',
        'Dein Token ist deine Identität – wer ihn hat, spielt als du. ',
        'Oberfläche, Agenten und API-Beschreibung liegen offen – die Befehle unten laufen in der geklonten Ablage.'),
      h('label', { class: 'rc-caps' }, 'Dein Token'),
      h('div', { class: 'hud-row' },
        h('input', { class: 'hud-token rc-mono', readonly: true, value: () => apiFields().token }),
        Button({ label: 'Kopieren', icon: 'copy', size: 'sm', onClick: () => cb.copyToken() })),
      h('label', { class: 'rc-caps' }, 'REST'),
      h('pre', { class: 'hud-code' }, text(() => apiFields().rest)),
      h('label', { class: 'rc-caps' }, 'Oberfläche, API und Agenten holen'),
      h('pre', { class: 'hud-code' }, text(() => apiFields().source)),
      h('label', { class: 'rc-caps' }, 'MCP-Server für Claude Code'),
      h('pre', { class: 'hud-code' }, text(() => apiFields().mcp)),
      h('label', { class: 'rc-caps' }, 'Agenten'),
      h('pre', { class: 'hud-code' }, text(() => apiFields().agents)),
      h('div', { class: { 'hud-debug': true, 'is-hidden': () => !debugVisible() } },
        h('label', { class: 'rc-caps' }, 'Zeitfaktor der Simulation (nur Entwicklung, nur localhost)'),
        h('div', { class: 'hud-row is-wrap' },
          h('span', { class: 'rc-num' }, text(debugLabel)),
          ...[1, 20, 120, 1000, 10000].map(v => Button({
            label: '×' + v, size: 'sm',
            variant: () => (speed() === v ? 'primary' : 'default'),
            onClick: () => cb.timeScale(v),
          })))),
      h('div', { class: 'hud-row is-end' },
        h('a', { class: 'hud-link', href: COMMUNITY_REPO_URL, target: '_blank', rel: 'noopener' }, 'Quellcode auf GitHub'),
        h('a', { class: 'hud-link', href: '/api.html', target: '_blank' }, 'API-Dokumentation'),
        Button({ label: 'Schließen', variant: 'primary', onClick: () => setApiOpen(false) })),
    ))

  const helpOverlay = h('div', { class: { 'hud-overlay': true, 'is-hidden': () => !helpOpen() } },
    h('div', { class: 'hud-dialog is-wide is-scroll' },
      h('h2', { class: 'hud-title' }, 'Bedienung'),
      h('div', { class: 'hud-helpcols' },
        helpBlock('Karte bewegen', [
          ['Zwei Finger', 'in alle Richtungen schieben'],
          ['Rand berühren', 'Karte wandert mit'],
          ['WASD, Pfeile', 'in alle Richtungen'],
          ['Mittlere Taste ziehen', 'frei schieben'],
          ['Umschalt + Rad', 'nach links und rechts'],
        ]),
        helpBlock('Zoom', [
          ['Aufziehen', 'zwei Finger auseinander'],
          ['Mausrad', 'von der Welt bis zur Basis'],
          ['Strg + Rad', 'dasselbe am Trackpad'],
          ['+ und −', 'stufenlos'],
          ['Radar anklicken', 'dorthin springen'],
          ['H', 'zur Basis'],
        ]),
        helpBlock('Auswahl', [
          ['Linksklick', 'auswählen; mit Auswahl wird er zum Befehl'],
          ['Ziehen', 'Rahmen'],
          ['Umschalt', 'hinzufügen'],
          ['Doppelklick', 'alle eigenen Einheiten im Sichtfeld'],
          ['Strg+1…9 / 1…9', 'Gruppe speichern / wählen'],
          ['Rechtsklick', 'Auswahl aufheben'],
        ]),
        helpBlock('Befehle (Linksklick mit Auswahl oder ⌘-Klick)', [
          ['Boden', 'bewegen'],
          ['Feind', 'angreifen'],
          ['Lagerstätte', 'abbauen'],
          ['A + Klick', 'Angriffsmarsch'],
          ['Umschalt + Rechtsklick', 'Wegpunkt anhängen (bis 16 Ziele)'],
          ['Einmalige Route / Wachroute', 'Ziele anklicken, dann Fertig; Wache wiederholt'],
          ['Feuerdisziplin', 'Feuer frei / nur erwidern / Feuer halten'],
          ['S / G', 'Stopp / Wache'],
          ['D / U / R', 'entfalten / entladen / zurück'],
          ['Escape / Rechtsklick', 'Auswahl aufheben'],
        ]),
        helpBlock('Bauen und Produktion', [
          ['Klick auf den Bauplan', 'in Auftrag geben'],
          ['Warteschlangenzeile', 'zeigt, was wirklich läuft – auch aus einer anderen Kategorie'],
          ['Klick auf den laufenden Bau', 'abbrechen, volle Kosten zurück'],
          ['Klick auf einen Auftrag', 'streichen, Kosten zurück'],
          ['„Stornieren“ an der Karte', 'fertigen Bau zurückgeben'],
          ['Rechtsklick auf die Baukarte', 'zuletzt eingereihten Auftrag zurücknehmen'],
        ]),
        helpBlock('Ton, Funk und Musik', [
          ['Knopf „Ton“', 'ein- und ausschalten (aus beim ersten Besuch)'],
          ['Grafik & Ton', 'Regler für Effekte, Funk und Musik getrennt'],
          ['Antippen', 'die Einheit meldet sich; Befehle werden quittiert'],
          ['Funk', 'Sprache, Kürzel oder aus – Wortlaut steht im Funkkanal'],
          ['Titelmusik', '„Kestrel Run“, eigener Schalter neben den Effekten'],
          ['Entfernung', 'leiser, dumpfer und später; ab großer Höhe still'],
          ['Alarm', 'meldet eigene Verluste, nicht jeden Treffer'],
        ]),
        helpBlock('Aufklärung', [
          ['Sicht', 'zeigt ein Objekt vollständig, reicht kurz'],
          ['Flugzeuge', 'werden 2,6× weiter gesehen'],
          ['Radar', 'deckt Standorte auf; Details brauchen Sichtkontakt'],
          ['Fremde Basen', 'erst nach Sicht- oder Radaraufklärung; Kamera verschieben reicht nicht'],
          ['Graue Basen', 'zuletzt erfasst; Sensoren müssen Veränderungen erneut bestätigen'],
          ['Raute', 'Radarkontakt, noch nicht erkannt'],
          ['Funkturm', '25 km Grundreichweite'],
        ]),
      ),
      h('div', { class: 'hud-row is-end' },
        Button({ label: 'Schließen', variant: 'primary', onClick: () => setHelpOpen(false) })),
    ))

  function helpBlock(title: string, rows: [string, string][]): HTMLElement {
    return h('section', null,
      h('h3', { class: 'rc-caps' }, title),
      ...rows.map(([k, v]) => h('div', { class: 'hud-helprow' }, Kbd(k), h('span', { class: 'rc-muted' }, v))))
  }

  // --- Zusammensetzen ------------------------------------------------------
  // Auswahlleiste und Funkverkehr teilen sich die untere linke Ecke. Als
  // getrennt positionierte Kästen wuchsen sie ineinander; gestapelt können sie
  // sich nicht mehr überlagern, egal wie lang der Verlauf wird.
  const bottomLeft = h('div', { class: 'hud-bottom' }, command, chat)
  const shell = h('div', { id: 'hud', class: 'hud', 'data-mobile-panel': mobilePanel }, topbar.element, sidebar, bottomLeft, mobileDock, loginOverlay, codeOverlay, spawnOverlay, apiOverlay, helpOverlay)
  insert(root, shell)

  // Ein fertiges Gebäude öffnet die Platzierung auf der freien Karte.
  itemsHost.addEventListener('click', event => {
    if (matchMedia(MOBILE_QUERY).matches && event.target instanceof Element && event.target.closest('.hud-item.is-ready')) mobileNavigation.set('map')
  })
  const mobileEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && matchMedia(MOBILE_QUERY).matches && mobilePanel() !== 'map') {
      event.preventDefault(); event.stopPropagation(); closeMobile()
    }
  }
  sidebar.addEventListener('keydown', event => { mobileEscape(event); event.stopPropagation() })
  bottomLeft.addEventListener('keydown', event => { mobileEscape(event); event.stopPropagation() })

  // Escape schließt das oberste Overlay.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (apiOpen()) { setApiOpen(false); e.preventDefault() }
    else if (helpOpen()) { setHelpOpen(false); e.preventDefault() }
  })

  return {
    root, canvas, minimap, portrait,
    setCoords, setScale, setClock,
    setPing: (v, ok) => { setPing(v); setConnected(ok) },
    setOnline, setSound, setMusic, setVoice: setVoiceSignal, setVolumes,
    setProduction: ({ progress, ready, blocked }) => {
      const done = Math.round(Math.max(0, Math.min(1, progress)) * 100)
      buildDock.style.setProperty('--prod', done + '%')
      const mark = ready > 0 ? 'ready' : blocked ? 'blocked' : progress > 0 ? 'busy' : ''
      if (mark) buildDock.dataset.prod = mark
      else delete buildDock.dataset.prod
      buildDock.title = ready > 0 ? `${ready} fertig – antippen und platzieren`
        : blocked ? 'Produktion steht – Grund steht in der Warteschlange'
        : progress > 0 ? `Produktion läuft (${done} %)` : 'Bauen'
    },
    setFunds,
    setPower: (prod, cons) => { setPowerProd(prod); setPowerCons(cons) },
    setCounts: (u, b) => { setUnits(u); setBuildings(b) },
    radarMode,
    toggleRadarMode: () => selectRadarMode(radarMode() === 'local' ? 'world' : 'local'),
    setRadarScale,
    tabsHost, itemsHost, queueHost, unitsHost, actionsHost, chatLog, chatInput, factionsHost,
    closeUnitPanel: () => { if (matchMedia(MOBILE_QUERY).matches) mobileNavigation.set('map') },
    showSelection: setSelVisible,
    setSelection: (o) => setSel(o),
    setPhase: setPhaseSignal,
    setLoginHint,
    loginName,
    loginCode,
    setStoredName,
    showAccessCode: (code: string) => setNewCode(code),
    setSpawnStatus: (v, ready) => { setSpawnStatus(v); setSpawnReady(ready) },
    openApi: (fill) => {
      const fields: ApiPanelFields = { token: '', rest: '', source: '', mcp: '', agents: '' }
      fill(fields)
      setApiFields({ ...fields })
      setApiOpen(true)
    },
    closeApi: () => setApiOpen(false),
    openHelp: () => setHelpOpen(v => !v),
    setDebug: (visible, label) => { setDebugVisible(visible); setDebugLabel(label) },
    setSpeed,
    setProtection,
    onLogin: (fn) => { cb.login = fn },
    onLoginWithCode: (fn) => { cb.loginCode = fn },
    onContinue: (fn) => { cb.weiter = fn },
    onSpawn: (fn) => { cb.spawn = fn },
    onSuggestSpot: (fn) => { cb.suggest = fn },
    onHome: (fn) => { cb.home = fn },
    onSound: (fn) => { cb.sound = fn },
    onMusic: (fn) => { cb.music = fn },
    onVoice: (fn) => { cb.voice = fn },
    onVolume: (fn) => { cb.volume = fn },
    onApi: (fn) => { cb.api = fn },
    onCivic: (fn) => { cb.civic = fn },
    onWorld: (fn) => { cb.world = fn },
    onHelp: (fn) => { cb.help = fn },
    onChat: (fn) => { cb.chat = fn },
    onTimeScale: (fn) => { cb.timeScale = fn },
    onCopyToken: (fn) => { cb.copyToken = fn },
    onRadarZoom: (fn) => { cb.radarZoom = fn },
    onRadarCenter: (fn) => { cb.radarCenter = fn },
    onRadarReset: (fn) => { cb.radarReset = fn },
  }
}

/** Meldung oben rechts – dieselbe Mechanik wie in der Engine, nur benannt. */
export function hudToast(text: string, kind: 'info' | 'error' = 'info') {
  engineToast(text, { kind: kind === 'error' ? 'crit' : 'info' })
}

export { attachTooltip, Show, For, computed, EmptyState, Tag, Panel, type View, type IconName }

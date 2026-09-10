import { h, Show, text } from '../engine/render.ts'
import { signal, effect, onCleanup, type Accessor } from '../engine/signal.ts'
import { Icon, StatusDot } from '../engine/icons.ts'
import { Button } from '../engine/widgets.ts'
import { graphicsControls } from '../poly/controls.ts'
import { audioControls, type Volumes, type VolumeKey } from './audio-controls.ts'
import { headerNavigation, type HeaderPanel } from './header-navigation.ts'
import { MOBILE_QUERY } from '../responsive.ts'

interface HeaderProps {
  host: HTMLElement
  coords: Accessor<string>
  scale: Accessor<string>
  clock: Accessor<string>
  ping: Accessor<string>
  online: Accessor<string>
  connected: Accessor<boolean>
  speed: Accessor<number>
  protection: Accessor<number>
  sound: Accessor<boolean>
  music: Accessor<boolean>
  volumes: Accessor<Volumes>
  mobileMenuHost: HTMLElement
  onMenuOpen(): void
  onCivic(): void
  onWorld(): void
  onUnits(): void
  onHome(): void
  onApi(): void
  onSound(): void
  onMusic(): void
  onVolume(which: VolumeKey, value: number): void
  onHelp(): void
}

/** Ein Satz Bedienelemente für Desktop und das kompakte, URL-gesteuerte Menü. */
export function Header(p: HeaderProps) {
  const [panel, setPanel] = signal<HeaderPanel>('closed')
  const navigation = headerNavigation(window, value => {
    setPanel(value)
    if (value !== 'closed') p.onMenuOpen()
  })
  setPanel(navigation.current())
  if (panel() !== 'closed') p.onMenuOpen()
  const compact = matchMedia('(width < 80rem)')
  const mobile = matchMedia(MOBILE_QUERY)
  const menuOpen = () => panel() !== 'closed'
  const run = (action: () => void) => () => {
    navigation.set('closed')
    // Fokus zuerst zurückgeben; ein danach geöffneter Dialog übernimmt ihn selbst.
    if (compact.matches) toggle.focus({ preventScroll: true })
    action()
  }
  const readout = (label: string, value: Accessor<string>) => h('div', { class: 'hud-readout' },
    h('span', { class: 'rc-caps' }, label), h('span', { class: 'rc-num' }, text(value)))
  const toggle = Button({ label: 'Menü', icon: 'menu', onClick: () => {
    const opening = !menuOpen()
    navigation.set(opening ? 'menu' : 'closed')
    if (opening) requestAnimationFrame(() => {
      if (menuOpen()) topbar.querySelector<HTMLButtonElement>('.hud-tools button')?.focus({ preventScroll: true })
    })
  } })
  toggle.classList.add('hud-menu-toggle')
  toggle.setAttribute('aria-controls', 'hud-header-panel')
  toggle.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Escape') dismiss(event)
  })
  const graphicsSummary = h('summary', { 'aria-controls': 'hud-graphics-panel', onClick: (event: Event) => {
    event.preventDefault()
    navigation.set(panel() === 'graphics' ? (compact.matches ? 'menu' : 'closed') : 'graphics')
  } }, Icon('settings', { size: 16 }), h('span', 'Grafik & Ton'), Icon('chevronDown', { size: 12 }))
  const graphics = h('details', { class: 'hud-graphics', open: () => panel() === 'graphics' },
    graphicsSummary,
    h('div', { class: 'hud-graphics-panel', id: 'hud-graphics-panel' },
      h('b', '3D-Einstellungen'), graphicsControls(),
      h('b', 'Ton'), audioControls({
        on: p.sound, music: p.music, volumes: p.volumes,
        onToggle: p.onSound, onToggleMusic: p.onMusic, onVolume: p.onVolume,
      }),
      h('a', { href: '/engine.html' + location.search, onClick: (event: Event) => {
        (event.currentTarget as HTMLAnchorElement).href = '/engine.html' + location.search
      } }, 'Szenenvorschau öffnen ↗')))
  const topbar = h('header', {
    class: 'hud-top',
    'aria-label': 'Spielübersicht und Werkzeuge',
    onKeyDown: (event: Event) => {
      // Enter, Pfeiltasten und Buchstaben in den Werkzeugen bedienen kein Spiel.
      event.stopPropagation()
      if ((event as KeyboardEvent).key === 'Escape') dismiss(event)
    },
  },
    h('div', { class: 'hud-brand' }, Icon('radar', { size: 20 }), h('b', 'Real Command')),
    h('div', { class: 'hud-live' },
      readout('Weltzeit', p.clock),
      Show(() => p.speed() > 1, () => h('button', {
        type: 'button', class: 'hud-speed', title: 'Zeitfaktor der Simulation – klicken für die Regler',
        onClick: run(p.onApi),
      }, Icon('fastForward', { size: 14 }), h('span', { class: 'rc-num' }, text(() => '×' + p.speed())))),
      Show(() => p.protection() > 0, () => h('div', {
        class: 'hud-shield',
        title: 'Landeschutz: kein Gegner kann dir schaden. Er endet sofort, wenn du selbst feuerst.',
      }, Icon('shield', { size: 14 }), h('span', { class: 'rc-num' }, text(() => formatShield(p.protection()))))),
    ),
    h('div', { class: 'hud-conn', title: () => `${p.connected() ? 'Verbunden' : 'Getrennt'} · ${p.ping()} · ${p.online()}` },
      () => StatusDot(p.connected() ? 'ok' : 'crit', !p.connected()),
      h('span', { class: 'rc-num' }, text(p.ping)),
    ),
    toggle,
    h('div', { class: 'hud-header-panel', id: 'hud-header-panel', 'data-open': () => String(menuOpen()) },
      h('div', { class: 'hud-telemetry' }, readout('Position', p.coords), readout('Maßstab', p.scale),
        h('div', { class: 'hud-readout hud-online' }, h('span', { class: 'rc-caps' }, 'Spieler'), h('span', text(p.online)))),
      h('nav', { class: 'hud-tools', 'aria-label': 'Werkzeuge' },
        Button({ label: 'Stadt & Handel', icon: 'base', onClick: run(p.onCivic) }),
        Button({ label: 'Welt & Bank', icon: 'map', onClick: run(p.onWorld) }),
        Button({ label: 'Einheiten', icon: 'aircraft', title: 'Alle eigenen Einheiten anzeigen und auswählen', onClick: run(p.onUnits) }),
        Button({ label: 'Basis', icon: 'target', title: 'Zur eigenen Basis springen (H)', onClick: run(p.onHome) }),
        Button({ label: 'API & KI', icon: 'robot', title: 'Zugang für Skripte und KI-Agenten', onClick: run(p.onApi) }),
        Button({ label: () => p.sound() ? 'Ton an' : 'Ton aus', icon: 'bell', pressed: p.sound, onClick: p.onSound }),
        Button({ label: 'Hilfe', icon: 'help', title: 'Hilfe (F1)', onClick: run(p.onHelp) }),
        graphics,
      ),
    ),
  )

  // Attribute und CSS folgen demselben Zustand; ausgeblendete Controls sind nicht fokussierbar.
  const update = () => {
    toggle.setAttribute('aria-expanded', String(menuOpen()))
    graphicsSummary.setAttribute('aria-expanded', String(panel() === 'graphics'))
  }
  effect(update)

  function dismiss(event: Event) {
    if (!menuOpen()) return
    event.preventDefault()
    event.stopPropagation()
    if (panel() === 'graphics') {
      navigation.set(compact.matches ? 'menu' : 'closed')
      graphicsSummary.focus({ preventScroll: true })
    } else {
      navigation.set('closed')
      toggle.focus({ preventScroll: true })
    }
  }
  const outside = (event: Event) => {
    if (menuOpen() && event.target instanceof Node && !topbar.contains(event.target) && !toggle.contains(event.target)) navigation.set('closed')
  }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(event) }
  const resize = () => {
    if (panel() === 'menu' && !compact.matches) navigation.set('closed')
    if (compact.matches && !menuOpen() && topbar.contains(document.activeElement) && !toggle.contains(document.activeElement)) toggle.focus()
  }
  const dockMenu = () => {
    const focused = document.activeElement === toggle
    if (mobile.matches) p.mobileMenuHost.append(toggle)
    else topbar.insertBefore(toggle, topbar.lastElementChild)
    if (focused) toggle.focus({ preventScroll: true })
  }
  mobile.addEventListener('change', dockMenu)
  dockMenu()
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
  document.addEventListener('keydown', escape)
  compact.addEventListener('change', resize)
  const size = new ResizeObserver(() => p.host.style.setProperty('--hud-top-height', `${topbar.getBoundingClientRect().height}px`))
  size.observe(topbar)
  onCleanup(() => {
    navigation.dispose()
    size.disconnect()
    document.removeEventListener('pointerdown', outside)
    document.removeEventListener('focusin', outside)
    document.removeEventListener('keydown', escape)
    compact.removeEventListener('change', resize)
    mobile.removeEventListener('change', dockMenu)
  })
  return { element: topbar, close: () => navigation.set('closed') }
}

function formatShield(seconds: number): string {
  const minutes = Math.floor(seconds / 60), rest = Math.floor(seconds % 60)
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}s`
}

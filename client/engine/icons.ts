// Real Command UI-Engine · Ikonen
// =============================================================================
// Strichzeichnungen auf einem 24er-Raster, Strichstärke 1,5, runde Enden.
// Sie sind bewusst nüchtern: eine Leitstandsoberfläche wird stundenlang
// angesehen, da stört jedes überflüssige Detail. Die Farbe kommt immer von
// `currentColor`, damit eine Ikone im Knopf, im Menü und in der Statuszeile
// automatisch richtig aussieht.

import { h } from './render.ts'

export type IconName = keyof typeof PATHS

/** Pfaddaten. Mehrere Teilpfade werden durch | getrennt. */
const PATHS = {
  // Navigation und Fenster
  menu: 'M4 7h16|M4 12h16|M4 17h16',
  close: 'M6 6l12 12|M18 6L6 18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronUp: 'M6 15l6-6 6 6',
  more: 'M5 12h.01|M12 12h.01|M19 12h.01',
  expand: 'M4 9V4h5|M20 15v5h-5|M4 4l6 6|M20 20l-6-6',
  collapse: 'M9 4v5H4|M15 20v-5h5|M4 9l5-5|M20 15l-5 5',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14z|M16 16l4 4',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6z|M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007.5 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 009 4.6V4a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1A1.6 1.6 0 0021 11h.1a2 2 0 110 4H21',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M9.5 9a2.5 2.5 0 015 .3c0 1.7-2.5 2.2-2.5 3.7|M12 17h.01',

  // Zustand
  check: 'M4 12.5l5 5L20 7',
  alert: 'M12 4l9 16H3z|M12 10v4|M12 17h.01',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M12 11v6|M12 8h.01',
  error: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M9 9l6 6|M15 9l-6 6',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M12 7v5l3.5 2',
  lock: 'M6 11h12v9H6z|M9 11V8a3 3 0 016 0v3',
  unlock: 'M6 11h12v9H6z|M9 11V8a3 3 0 015.7-1.3',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z|M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  eyeOff: 'M4 4l16 16|M9.9 5.2A9.6 9.6 0 0112 5c6.5 0 10 6 10 6a17 17 0 01-3.3 3.9|M6.3 7.9A16.6 16.6 0 002 11s3.5 6 10 6c1.4 0 2.6-.2 3.7-.6',

  // Simulation und Zeit
  play: 'M8 5l11 7-11 7z',
  pause: 'M9 5v14|M15 5v14',
  fastForward: 'M4 5l8 7-8 7z|M13 5l8 7-8 7z',
  step: 'M5 5l9 7-9 7z|M18 5v14',
  refresh: 'M20 12a8 8 0 11-2.3-5.7|M20 4v5h-5',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7.4 3.9|M4 4v4h4|M12 8v4.5l3 1.8',

  // Militär und Basis
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M12 8a4 4 0 100 8 4 4 0 000-8z|M12 3v3|M12 18v3|M3 12h3|M18 12h3',
  crosshair: 'M12 4v6|M12 14v6|M4 12h6|M14 12h6|M12 11.4a.6.6 0 100 1.2.6.6 0 000-1.2z',
  shield: 'M12 3l8 3v6c0 5-3.4 8.2-8 9.5-4.6-1.3-8-4.5-8-9.5V6z',
  unit: 'M12 4a3 3 0 100 6 3 3 0 000-6z|M5 20v-1.5A4.5 4.5 0 019.5 14h5a4.5 4.5 0 014.5 4.5V20',
  vehicle: 'M4 15h16v3H4z|M6 15V9h8l4 6|M7 18a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z|M14 18a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z',
  aircraft: 'M12 3l1.5 7L22 13v2l-8.5-2-1 5 2.5 2v1l-3-1-3 1v-1l2.5-2-1-5L2 15v-2l8.5-3z',
  ship: 'M4 17h16l-2 4H6z|M6 17V9h12v8|M12 5v4',
  factory: 'M3 21V11l5 3V11l5 3V8l8 5v8z|M6 21v-3|M11 21v-3|M16 21v-3',
  power: 'M13 3L5 14h6l-1 7 8-11h-6z',
  radar: 'M12 3a9 9 0 109 9|M12 7a5 5 0 105 5|M12 12l6-6',
  base: 'M4 20V9l8-5 8 5v11z|M9 20v-6h6v6',
  build: 'M14 3l7 7-3 3-7-7z|M11 6L4 13v7h7l7-7',
  wrench: 'M14.5 4a5 5 0 00-5 6.5L4 16v4h4l5.5-5.5A5 5 0 0020 9.5L17 12l-3-1-1-3z',

  // Wirtschaft
  resource: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z|M12 3v18|M4 7.5l8 4.5 8-4.5',
  credits: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M15 9a3.5 3.5 0 00-6 2.5v1A3.5 3.5 0 0015 15',
  supply: 'M3 8l9-4 9 4v8l-9 4-9-4z|M3 8l9 4 9-4|M12 12v8',
  trade: 'M4 8h13l-3-3|M20 16H7l3 3',
  chart: 'M4 20V4|M4 20h16|M8 16l3.5-4.5 3 2.5L20 8',

  // Daten und Werkzeuge
  table: 'M3 5h18v14H3z|M3 10h18|M9 10v9|M15 10v9',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3.5 6h.01|M3.5 12h.01|M3.5 18h.01',
  layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5|M3 17l9 5 9-5',
  map: 'M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z|M9 4v13|M15 6.5v13',
  terminal: 'M5 5h14v14H5z|M8.5 10l2.5 2-2.5 2|M13 14h3',
  api: 'M8 6l-5 6 5 6|M16 6l5 6-5 6|M13.5 4l-3 16',
  robot: 'M6 9h12v9H6z|M12 5v4|M12 4a1 1 0 100 2 1 1 0 000-2z|M9.5 13h.01|M14.5 13h.01|M3 12v3|M21 12v3',
  link: 'M10 13a4 4 0 006 .5l2-2a4 4 0 00-5.7-5.7L11 7|M14 11a4 4 0 00-6-.5l-2 2a4 4 0 005.7 5.7L13 17',
  download: 'M12 4v11|M8 12l4 4 4-4|M4 20h16',
  upload: 'M12 20V9|M8 12l4-4 4 4|M4 4h16',
  copy: 'M9 9h11v11H9z|M5 15V4h11',
  trash: 'M4 7h16|M9 7V5h6v2|M6 7l1 13h10l1-13',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  drag: 'M9 6h.01|M9 12h.01|M9 18h.01|M15 6h.01|M15 12h.01|M15 18h.01',
  pin: 'M12 3l3 3-1 5 4 3H6l4-3-1-5z|M12 14v7',
  bell: 'M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6z|M10 19a2 2 0 004 0',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8z|M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  users: 'M9 4a3.5 3.5 0 100 7 3.5 3.5 0 000-7z|M2 20v-1a5 5 0 015-5h4a5 5 0 015 5v1|M16 4.5a3.5 3.5 0 010 6.9|M18 14a5 5 0 014 4.9V20',
} as const

export interface IconProps {
  size?: number
  stroke?: number
  class?: string
  title?: string
  /** Für rein dekorative Ikonen neben Text. */
  decorative?: boolean
}

/** Liefert ein SVG-Element. Farbe folgt currentColor, Größe dem Schriftkontext. */
export function Icon(name: IconName, p: IconProps = {}): SVGElement {
  const size = p.size ?? 16
  const svg = h('svg', {
    class: 'rc-icon' + (p.class ? ' ' + p.class : ''),
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': p.stroke ?? 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': p.decorative === false ? undefined : 'true',
    role: p.title ? 'img' : undefined,
  }) as unknown as SVGElement
  if (p.title) svg.appendChild(h('title', p.title))
  const data = PATHS[name]
  if (!data) {
    svg.appendChild(h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }))
  } else {
    for (const d of data.split('|')) svg.appendChild(h('path', { d }))
  }
  return svg
}

export const iconNames = Object.keys(PATHS) as IconName[]

/**
 * Statusleuchte: ein gefüllter Punkt mit Ring. Bewusst kein Icon, weil sie in
 * Tabellen zu Hunderten vorkommt und deshalb so billig wie möglich sein muss.
 */
export function StatusDot(kind: 'ok' | 'warn' | 'crit' | 'info' | 'idle' = 'idle', pulse = false): HTMLElement {
  return h('span', { class: `rc-dot rc-dot-${kind}${pulse ? ' is-pulse' : ''}`, 'aria-hidden': 'true' })
}

// Real Command UI-Engine · Themensystem
// =============================================================================
// Eine Leitstand-Oberfläche, kein Spielzeug. Der Maßstab ist ein professionelles
// Kontrollsystem: ruhige, entsättigte Flächen, harte Haarlinien statt weicher
// Schatten, sparsame Auszeichnungsfarbe, dichte aber luftige Typografie und
// Ziffern, die in Spalten stehen.
//
// Aufbau in drei Schichten:
//   1. Skala      – rohe Werte (Graustufen, Abstände, Radien, Schriftgrößen)
//   2. Semantik   – wofür ein Wert steht (Fläche, Rand, Text, Status)
//   3. Ausgabe    – CSS-Custom-Properties, umschaltbar zur Laufzeit
//
// Nur die semantische Schicht wird in Komponenten benutzt. Wer `--grey-700`
// direkt verwendet, hat das System umgangen.

import { signal, effect, type Accessor } from './signal.ts'

// ---------------------------------------------------------------------------
// 1. Skala
// ---------------------------------------------------------------------------

/** Neutralton mit leichtem Blaugrün-Stich – wirkt technisch, nicht kalt-blau. */
const N = {
  0: '#05070a', 50: '#0a0e13', 100: '#0f141a', 150: '#141a21', 200: '#1a2129',
  250: '#212a33', 300: '#2a343e', 400: '#3a4753', 500: '#546471', 600: '#75858f',
  700: '#9aa7b0', 800: '#c2cbd2', 900: '#e3e9ed', 950: '#f4f7f9', 1000: '#ffffff',
} as const

const ACCENT = { 300: '#7fd4ff', 400: '#3fbdf5', 500: '#12a5e8', 600: '#0b82ba', 700: '#08608a' } as const
const OK = { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' } as const
const WARN = { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' } as const
const CRIT = { 400: '#f87171', 500: '#ef4444', 600: '#dc2626' } as const
const INFO = { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed' } as const

/** 4-px-Raster. Enge Werte für Datenflächen, weite für Dialoge. */
export const SPACE = { 0: '0', 1: '2px', 2: '4px', 3: '6px', 4: '8px', 5: '12px', 6: '16px', 7: '24px', 8: '32px', 9: '48px' } as const
export const RADIUS = { none: '0', sm: '2px', md: '4px', lg: '6px', xl: '10px', full: '999px' } as const
export const SIZE = { control: '28px', controlSm: '22px', controlLg: '34px', row: '26px', icon: '16px' } as const

export const TYPE = {
  ui: '"Inter", "Segoe UI", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  size: { xs: '10px', sm: '11px', md: '12px', lg: '14px', xl: '17px', xxl: '22px' },
  weight: { normal: '400', medium: '500', semi: '600', bold: '700' },
  line: { tight: '1.15', normal: '1.4', loose: '1.6' },
  tracking: { tight: '-0.01em', normal: '0', wide: '0.04em', caps: '0.09em' },
} as const

export const MOTION = {
  instant: '80ms',
  fast: '120ms',
  base: '180ms',
  slow: '260ms',
  ease: 'cubic-bezier(.2,.6,.3,1)',
  easeOut: 'cubic-bezier(.16,1,.3,1)',
} as const

export const Z = { base: 0, sticky: 100, docked: 200, overlay: 900, popover: 1000, dialog: 1100, toast: 1200, tooltip: 1300 } as const

// ---------------------------------------------------------------------------
// 2. Semantik
// ---------------------------------------------------------------------------

export type ThemeName = 'dark' | 'light' | 'contrast'

type Semantic = Record<string, string>

const darkSemantic: Semantic = {
  // Flächen, von tief nach hoch
  'bg-app': N[50],
  'bg-sunken': N[0],
  'bg-surface': N[100],
  'bg-raised': N[150],
  'bg-overlay': N[200],
  'bg-input': N[50],
  'bg-hover': 'rgba(255,255,255,.045)',
  'bg-active': 'rgba(255,255,255,.08)',
  'bg-selected': 'rgba(18,165,232,.16)',
  'bg-scrim': 'rgba(3,5,8,.72)',

  // Ränder: Haarlinien, drei Stufen
  'line-subtle': N[200],
  'line': N[300],
  'line-strong': N[400],

  // Text
  'text': N[900],
  'text-muted': N[700],
  'text-faint': N[500],
  'text-inverse': N[50],
  'text-accent': ACCENT[400],

  // Auszeichnung und Status
  'accent': ACCENT[500],
  'accent-hover': ACCENT[400],
  'accent-press': ACCENT[600],
  'accent-quiet': 'rgba(18,165,232,.14)',
  'ok': OK[500], 'ok-quiet': 'rgba(34,197,94,.14)',
  'warn': WARN[500], 'warn-quiet': 'rgba(245,158,11,.14)',
  'crit': CRIT[500], 'crit-quiet': 'rgba(239,68,68,.14)',
  'info': INFO[500], 'info-quiet': 'rgba(139,92,246,.14)',

  'focus': ACCENT[400],
  'shadow-1': '0 1px 2px rgba(0,0,0,.5)',
  'shadow-2': '0 4px 12px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.4)',
  'shadow-3': '0 16px 48px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)',
  'grid-line': 'rgba(255,255,255,.035)',
}

const lightSemantic: Semantic = {
  'bg-app': '#eef1f4',
  'bg-sunken': '#e2e7eb',
  'bg-surface': '#f8fafb',
  'bg-raised': '#ffffff',
  'bg-overlay': '#ffffff',
  'bg-input': '#ffffff',
  'bg-hover': 'rgba(10,14,19,.045)',
  'bg-active': 'rgba(10,14,19,.08)',
  'bg-selected': 'rgba(11,130,186,.14)',
  'bg-scrim': 'rgba(20,26,33,.42)',

  'line-subtle': '#dde3e8',
  'line': '#c6d0d8',
  'line-strong': '#a2b0bb',

  'text': '#111820',
  'text-muted': '#4b5a66',
  'text-faint': '#7b8a95',
  'text-inverse': '#f8fafb',
  'text-accent': ACCENT[700],

  'accent': ACCENT[600],
  'accent-hover': ACCENT[500],
  'accent-press': ACCENT[700],
  'accent-quiet': 'rgba(11,130,186,.12)',
  'ok': OK[600], 'ok-quiet': 'rgba(22,163,74,.12)',
  'warn': WARN[600], 'warn-quiet': 'rgba(217,119,6,.14)',
  'crit': CRIT[600], 'crit-quiet': 'rgba(220,38,38,.12)',
  'info': INFO[600], 'info-quiet': 'rgba(124,58,237,.12)',

  'focus': ACCENT[600],
  'shadow-1': '0 1px 2px rgba(16,24,32,.10)',
  'shadow-2': '0 4px 12px rgba(16,24,32,.12), 0 1px 3px rgba(16,24,32,.08)',
  'shadow-3': '0 16px 48px rgba(16,24,32,.18), 0 2px 8px rgba(16,24,32,.10)',
  'grid-line': 'rgba(16,24,32,.05)',
}

/** Hoher Kontrast: reine Ränder, kein Grau-in-Grau, für schlechte Sicht und Beamer. */
const contrastSemantic: Semantic = {
  ...darkSemantic,
  'bg-app': '#000000',
  'bg-surface': '#000000',
  'bg-raised': '#0b0b0b',
  'bg-overlay': '#0b0b0b',
  'bg-input': '#000000',
  'line-subtle': '#5a5a5a',
  'line': '#8a8a8a',
  'line-strong': '#e0e0e0',
  'text': '#ffffff',
  'text-muted': '#d6d6d6',
  'text-faint': '#a8a8a8',
  'accent': '#40c4ff',
  'accent-hover': '#82d8ff',
  'focus': '#ffd400',
  'shadow-1': 'none', 'shadow-2': 'none', 'shadow-3': 'none',
}

const THEMES: Record<ThemeName, Semantic> = { dark: darkSemantic, light: lightSemantic, contrast: contrastSemantic }

// ---------------------------------------------------------------------------
// 3. Ausgabe
// ---------------------------------------------------------------------------

function flatten(prefix: string, obj: Record<string, unknown>, out: string[]) {
  for (const k in obj) {
    const v = obj[k]
    if (v && typeof v === 'object') flatten(`${prefix}-${k}`, v as Record<string, unknown>, out)
    else out.push(`${prefix}-${k}:${String(v)}`)
  }
}

/** Werte, die in jedem Thema gleich sind. */
export function staticVars(): string {
  const out: string[] = []
  flatten('--space', SPACE as unknown as Record<string, unknown>, out)
  flatten('--radius', RADIUS as unknown as Record<string, unknown>, out)
  flatten('--size', SIZE as unknown as Record<string, unknown>, out)
  flatten('--type', TYPE as unknown as Record<string, unknown>, out)
  flatten('--motion', MOTION as unknown as Record<string, unknown>, out)
  for (const k in Z) out.push(`--z-${k}:${Z[k as keyof typeof Z]}`)
  return out.join(';')
}

export function themeVars(name: ThemeName): string {
  const s = THEMES[name]
  return Object.keys(s).map(k => `--${k}:${s[k]}`).join(';')
}

const [theme, setThemeSignal] = signal<ThemeName>('dark')
export const currentTheme: Accessor<ThemeName> = theme

/** Farbwert eines semantischen Tokens auslesen – für Canvas, das keine CSS-Variablen kennt. */
export function token(name: keyof typeof darkSemantic | string): string {
  return THEMES[theme()][name] ?? ''
}

let styleEl: HTMLStyleElement | null = null

/**
 * Hängt die Variablen ins Dokument und hält sie beim Themenwechsel aktuell.
 * Muss einmal vor dem ersten Rendern laufen.
 */
export function installTheme(initial: ThemeName = 'dark', doc: Document = document) {
  if (!styleEl) {
    styleEl = doc.createElement('style')
    styleEl.id = 'rc-theme'
    doc.head.insertBefore(styleEl, doc.head.firstChild)
  }
  setThemeSignal(initial)
  effect(() => {
    const name = theme()
    styleEl!.textContent = `:root{${staticVars()};${themeVars(name)};color-scheme:${name === 'light' ? 'light' : 'dark'}}`
    doc.documentElement.dataset.theme = name
  })
}

export function setTheme(name: ThemeName) { setThemeSignal(name) }

/** Folgt der Systemeinstellung, bis der Nutzer selbst wählt. */
export function followSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const apply = () => setThemeSignal(mq.matches ? 'light' : 'dark')
  apply()
  mq.addEventListener('change', apply)
  return () => mq.removeEventListener('change', apply)
}

// ---------------------------------------------------------------------------
// Farbhilfen für Canvas-Anteile, die dieselbe Palette brauchen
// ---------------------------------------------------------------------------

export function withAlpha(color: string, a: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, a + ')')
  if (color.startsWith('#')) {
    const hex = color.length === 4
      ? color.slice(1).split('').map(c => c + c).join('')
      : color.slice(1, 7)
    const n = parseInt(hex, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }
  return color
}

/**
 * Farbskala für Spieler und Fraktionen. Bewusst entsättigt gegenüber üblichen
 * Spielfarben, damit sie auf dem dunklen Grund nicht flimmern, und paarweise
 * unterscheidbar auch bei Rot-Grün-Schwäche.
 */
export const ENTITY_COLORS = [
  '#3fbdf5', // Azur
  '#f59e0b', // Bernstein
  '#22c55e', // Grün
  '#e879a8', // Magenta
  '#a78bfa', // Violett
  '#eab308', // Gold
  '#2dd4bf', // Türkis
  '#fb7185', // Koralle
] as const

export function entityColor(id: string | number): string {
  const s = String(id)
  let hash = 2166136261
  for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return ENTITY_COLORS[Math.abs(hash) % ENTITY_COLORS.length]
}

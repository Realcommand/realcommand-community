// Real Command · Ton
// =============================================================================
// Jeder Klang entsteht im Browser: Rauschen, Schwingungen, Filter, Hüllkurven.
// Es gibt keine Klangdateien und damit keine fremden Rechte im Auslieferungs-
// stand – dieselbe Regel wie bei Modellen, Karten und Symbolen.
//
// Aufbau: eine Tabelle von Rezepten (CUES), ein Abspieler, der daraus einen
// Knotengraphen baut, eine Ortung über die Kamera (Panorama, Entfernung,
// Laufzeit, Luftdämpfung) und ein Umgebungsbett (Wind, Brandung, Blätter).
// Der Dienst hört selbst auf Spielereignisse; die Oberfläche meldet nur ihre
// eigenen Signale über `cue()`.

import { Context, Service } from 'cordis'
import { DEFS } from '../shared/data.ts'
import { biomeAt } from '../shared/biome.ts'
import { Music } from './music.ts'
import { Voice, type VoiceMode } from './voice.ts'
import type { VoiceEvent, VoiceRole } from './voice-lines.ts'
import type { GameEvent } from '../shared/protocol.ts'

declare module 'cordis' {
  interface Context {
    audio: Audio
  }
  interface Events {
    /** Wortlaut einer Funkansage – die Oberfläche schreibt ihn in den Funkkanal. */
    'audio/radio'(text: string): void
  }
}

type NoiseColor = 'white' | 'pink' | 'brown'
export type Bus = 'world' | 'ui' | 'ambient' | 'music' | 'radio' | 'machines'

/**
 * Eine Schicht eines Klangs. Ein Schuss besteht aus Knall (Rauschen) und Körper
 * (Schwingung), eine Explosion aus Druckwelle, Grollen und Trümmern.
 */
interface Layer {
  /** `noise` rauscht durch einen Filter, alles andere schwingt. */
  wave: 'noise' | 'sine' | 'square' | 'sawtooth' | 'triangle'
  /** Länge der Hüllkurve in Sekunden. */
  dur: number
  /** Spitzenpegel 0..1 vor Bus-, Entfernungs- und Lautstärkedämpfung. */
  gain: number
  /** Frequenz der Schwingung bzw. Mitte des Rauschfilters, in Hz. */
  f0: number
  /** Zielfrequenz am Ende der Hüllkurve; erzeugt Auf- und Abschwünge. */
  f1?: number
  /** Anstiegszeit; ohne Angabe schlägt der Klang sofort an (Knall statt Anblasen). */
  attack?: number
  filter?: BiquadFilterType
  q?: number
  /** Weiß zischt, rosa raschelt, braun grollt. */
  color?: NoiseColor
  /** Versatz innerhalb des Klangs, für Nachhall und Trümmer. */
  at?: number
  /** Wiederholungen (Salve, Sirene, Dreiklang). */
  times?: number
  /** Abstand der Wiederholungen in Sekunden. */
  gap?: number
  /** Tonschritt je Wiederholung in Halbtönen. */
  step?: number
}

// ---------------------------------------------------------------------------
// Klangtabelle
// ---------------------------------------------------------------------------

/**
 * Alle Klänge des Spiels. Die Werte sind Klanggestaltung, keine Physik: tiefe
 * Frequenzen tragen weit und wirken schwer, hohe wirken nah und leicht.
 */
const CUES = {
  // --- Waffen -------------------------------------------------------------
  'shot.bullet': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 2200, f1: 900, dur: 0.05, gain: 0.5, q: 0.7 },
    { wave: 'square', f0: 220, f1: 90, dur: 0.05, gain: 0.18 },
  ],
  'shot.cannon': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1100, f1: 420, dur: 0.09, gain: 0.55, q: 0.9 },
    { wave: 'square', f0: 160, f1: 70, dur: 0.1, gain: 0.28 },
  ],
  'shot.shell': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 5000, f1: 1800, dur: 0.03, gain: 0.7 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 1100, f1: 120, dur: 0.55, gain: 0.9 },
    { wave: 'sine', f0: 95, f1: 34, dur: 0.6, gain: 0.75 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 320, f1: 110, dur: 0.9, gain: 0.3, at: 0.09, attack: 0.06 },
  ],
  'shot.rocket': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 4000, f1: 2000, dur: 0.03, gain: 0.4 },
    { wave: 'sine', f0: 130, f1: 55, dur: 0.25, gain: 0.5 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 380, f1: 2600, dur: 0.8, gain: 0.6, q: 0.5, attack: 0.05 },
  ],
  'shot.missile': [
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 320, f1: 1600, dur: 1.1, gain: 0.6, attack: 0.12 },
    { wave: 'sine', f0: 120, f1: 55, dur: 0.9, gain: 0.35, attack: 0.05 },
  ],
  'shot.flak': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 1500, f1: 700, dur: 0.05, gain: 0.42, q: 1.2, times: 3, gap: 0.075 },
    { wave: 'square', f0: 190, f1: 95, dur: 0.05, gain: 0.14, times: 3, gap: 0.075 },
  ],
  'shot.bomb': [
    { wave: 'sine', f0: 2100, f1: 320, dur: 0.9, gain: 0.3, attack: 0.08 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1800, f1: 500, dur: 0.9, gain: 0.18, q: 0.6, attack: 0.1 },
  ],
  'shot.torpedo': [
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 300, f1: 170, dur: 0.8, gain: 0.5, attack: 0.15 },
    { wave: 'sine', f0: 260, f1: 150, dur: 0.7, gain: 0.25, attack: 0.1 },
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 900, dur: 0.04, gain: 0.12, q: 4, times: 5, gap: 0.13 },
  ],
  'shot.melee': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 800, f1: 260, dur: 0.14, gain: 0.3, q: 0.8, attack: 0.03 },
  ],
  'shot.arrow': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 2600, f1: 1400, dur: 0.06, gain: 0.22 },
    { wave: 'triangle', f0: 900, f1: 380, dur: 0.1, gain: 0.16 },
  ],
  'shot.nuke': [
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 260, f1: 1200, dur: 2.4, gain: 0.7, attack: 0.5 },
    { wave: 'sine', f0: 70, f1: 34, dur: 2.4, gain: 0.5, attack: 0.4 },
  ],

  // --- Treffer und Zerstörung ---------------------------------------------
  'hit.small': [
    { wave: 'triangle', f0: 1500, f1: 620, dur: 0.09, gain: 0.28 },
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 3200, dur: 0.05, gain: 0.2 },
  ],
  'hit.heavy': [
    { wave: 'sine', f0: 170, f1: 48, dur: 0.3, gain: 0.6 },
    { wave: 'noise', color: 'pink', filter: 'lowpass', f0: 900, f1: 180, dur: 0.28, gain: 0.45 },
    { wave: 'triangle', f0: 1900, f1: 1200, dur: 0.35, gain: 0.14, attack: 0.004 },
  ],
  'hit.water': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 400, f1: 2000, dur: 0.22, gain: 0.4, q: 0.6 },
    { wave: 'noise', color: 'pink', filter: 'lowpass', f0: 1200, f1: 300, dur: 0.5, gain: 0.28, attack: 0.05 },
  ],
  'explosion.small': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 6000, f1: 1400, dur: 0.04, gain: 0.75 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 1600, f1: 80, dur: 0.8, gain: 0.95 },
    { wave: 'sine', f0: 110, f1: 30, dur: 0.9, gain: 0.7 },
    { wave: 'sine', f0: 62, f1: 22, dur: 1.1, gain: 0.5, attack: 0.02 },
  ],
  'explosion.large': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 7000, f1: 900, dur: 0.05, gain: 0.85 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 1900, f1: 55, dur: 1.7, gain: 1 },
    { wave: 'sine', f0: 85, f1: 22, dur: 1.9, gain: 0.85 },
    { wave: 'sine', f0: 48, f1: 18, dur: 2.4, gain: 0.6, attack: 0.03 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1300, dur: 0.09, gain: 0.2, q: 2, times: 7, gap: 0.13, at: 0.3 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 260, f1: 90, dur: 1.6, gain: 0.35, at: 0.5, attack: 0.25 },
  ],
  'collapse': [
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 1200, f1: 60, dur: 1.4, gain: 0.9 },
    { wave: 'sine', f0: 95, f1: 26, dur: 1.5, gain: 0.7 },
    { wave: 'sine', f0: 52, f1: 20, dur: 2, gain: 0.45, attack: 0.05 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1100, f1: 500, dur: 0.14, gain: 0.28, q: 1.6, times: 10, gap: 0.1, at: 0.18 },
  ],
  'die.person': [
    { wave: 'sine', f0: 140, f1: 55, dur: 0.24, gain: 0.32 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1400, f1: 800, dur: 0.07, gain: 0.14, q: 1.4, times: 2, gap: 0.09 },
  ],
  'nuke': [
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 6000, f1: 700, dur: 0.15, gain: 0.6 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 1800, f1: 40, dur: 3.5, gain: 1 },
    { wave: 'sine', f0: 60, f1: 18, dur: 4, gain: 0.8 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 300, f1: 60, dur: 2.5, gain: 0.45, at: 1.2, attack: 0.6 },
  ],

  // --- Aufbau und Wirtschaft ----------------------------------------------
  'place': [
    { wave: 'square', f0: 300, f1: 130, dur: 0.12, gain: 0.3 },
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 1800, f1: 600, dur: 0.45, gain: 0.22, attack: 0.02 },
  ],
  'build.done': [
    { wave: 'sine', f0: 660, dur: 0.2, gain: 0.3, attack: 0.01 },
    { wave: 'sine', f0: 990, dur: 0.5, gain: 0.28, attack: 0.01, at: 0.16 },
    { wave: 'noise', color: 'pink', filter: 'lowpass', f0: 900, dur: 0.5, gain: 0.1, attack: 0.12 },
  ],
  'capture': [
    { wave: 'triangle', f0: 440, dur: 0.28, gain: 0.26, attack: 0.01, times: 3, gap: 0.13, step: 4 },
  ],
  'gather.wood': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1300, f1: 420, dur: 0.11, gain: 0.34, q: 1.1 },
    { wave: 'triangle', f0: 230, f1: 110, dur: 0.14, gain: 0.22 },
  ],
  'gather.stone': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 2800, f1: 1200, dur: 0.08, gain: 0.32, q: 1.8 },
    { wave: 'triangle', f0: 420, f1: 210, dur: 0.09, gain: 0.16 },
  ],
  'gather.ore': [
    { wave: 'triangle', f0: 1900, f1: 900, dur: 0.14, gain: 0.24 },
    { wave: 'noise', color: 'white', filter: 'highpass', f0: 3400, dur: 0.06, gain: 0.18 },
  ],
  'gather.soft': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 3000, f1: 2200, dur: 0.3, gain: 0.2, q: 0.7, attack: 0.06 },
  ],
  'work': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 1600, f1: 700, dur: 0.07, gain: 0.3, q: 1.6 },
    { wave: 'triangle', f0: 380, f1: 190, dur: 0.09, gain: 0.16 },
  ],
  // Das Landungsflugzeug ist das erste, was ein Spieler hört: vier Triebwerke,
  // die aus der Ferne anschwellen, darüber das Pfeifen der Turbinen.
  'air.arrive': [
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 200, f1: 900, dur: 3.4, gain: 0.85, attack: 1.4 },
    { wave: 'sawtooth', f0: 62, f1: 96, dur: 3.4, gain: 0.4, attack: 1.2 },
    { wave: 'sawtooth', f0: 240, f1: 420, dur: 3.2, gain: 0.22, attack: 1.6 },
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 1800, f1: 3200, dur: 2.6, gain: 0.16, q: 0.8, attack: 1.4, at: 0.6 },
    // Der Aufsetzer: kurzes Quietschen und ein satter Schlag.
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 2600, f1: 1200, dur: 0.35, gain: 0.3, q: 2.2, at: 2.9 },
    { wave: 'sine', f0: 90, f1: 38, dur: 0.5, gain: 0.5, at: 2.95 },
  ],
  'unit.ready': [
    { wave: 'square', f0: 523, dur: 0.12, gain: 0.18, attack: 0.01 },
    { wave: 'square', f0: 784, dur: 0.28, gain: 0.18, attack: 0.01, at: 0.1 },
  ],
  'arrive': [
    { wave: 'sine', f0: 523, dur: 0.22, gain: 0.22, attack: 0.02, times: 3, gap: 0.14, step: 3 },
  ],
  'knowledge': [
    { wave: 'sine', f0: 880, dur: 1.1, gain: 0.24, attack: 0.01 },
    { wave: 'sine', f0: 1320, dur: 0.9, gain: 0.12, attack: 0.02, at: 0.05 },
  ],

  // --- Meldungen ----------------------------------------------------------
  'alarm': [
    { wave: 'square', f0: 660, dur: 0.22, gain: 0.2, attack: 0.02, times: 2, gap: 0.34 },
    { wave: 'square', f0: 440, dur: 0.22, gain: 0.2, attack: 0.02, at: 0.17, times: 2, gap: 0.34 },
  ],
  'missile.launch': [
    { wave: 'sine', f0: 180, f1: 900, dur: 1.2, gain: 0.3, attack: 0.2 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 400, f1: 1800, dur: 1.4, gain: 0.45, attack: 0.25 },
  ],
  'missile.inbound': [
    { wave: 'sawtooth', f0: 900, f1: 300, dur: 0.7, gain: 0.22, attack: 0.03, times: 2, gap: 0.8 },
  ],
  'power.low': [
    { wave: 'square', f0: 96, dur: 0.35, gain: 0.2, attack: 0.02, times: 2, gap: 0.45 },
  ],
  'milestone': [
    { wave: 'triangle', f0: 523, dur: 0.3, gain: 0.22, attack: 0.01, times: 3, gap: 0.16, step: 4 },
    { wave: 'sine', f0: 1046, dur: 0.9, gain: 0.16, attack: 0.03, at: 0.32 },
  ],
  'avatar.down': [
    { wave: 'sine', f0: 300, f1: 55, dur: 1.4, gain: 0.45, attack: 0.05 },
    { wave: 'noise', color: 'brown', filter: 'lowpass', f0: 600, f1: 90, dur: 1.2, gain: 0.35 },
  ],
  'spawn': [
    { wave: 'sine', f0: 392, dur: 0.35, gain: 0.2, attack: 0.02, times: 3, gap: 0.18, step: 5 },
    { wave: 'noise', color: 'pink', filter: 'lowpass', f0: 700, dur: 1.2, gain: 0.12, attack: 0.4 },
  ],

  // --- Funk ---------------------------------------------------------------
  // Squelch auf, Ansage, Squelch zu. Die Kürzel sagen dasselbe ohne Worte.
  'radio.open': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 2400, f1: 1600, dur: 0.05, gain: 0.16, q: 3 },
    { wave: 'square', f0: 1200, dur: 0.02, gain: 0.06 },
  ],
  'radio.close': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 1600, f1: 2600, dur: 0.06, gain: 0.12, q: 3 },
  ],
  'radio.deny': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 900, f1: 500, dur: 0.09, gain: 0.2, q: 2 },
    { wave: 'square', f0: 220, f1: 150, dur: 0.12, gain: 0.12 },
  ],
  'code.report': [
    { wave: 'square', f0: 880, dur: 0.05, gain: 0.12, times: 2, gap: 0.09 },
  ],
  'code.move': [
    { wave: 'square', f0: 700, dur: 0.05, gain: 0.12 },
    { wave: 'square', f0: 990, dur: 0.07, gain: 0.12, at: 0.08 },
  ],
  'code.attack': [
    { wave: 'square', f0: 1180, dur: 0.05, gain: 0.13, times: 3, gap: 0.07 },
  ],
  'code.work': [
    { wave: 'triangle', f0: 560, f1: 780, dur: 0.12, gain: 0.13 },
  ],
  'code.deny': [
    { wave: 'square', f0: 300, f1: 180, dur: 0.14, gain: 0.14, times: 2, gap: 0.16 },
  ],
  'code.alert': [
    { wave: 'square', f0: 1320, dur: 0.07, gain: 0.15, times: 3, gap: 0.11 },
  ],

  // --- Bedienung ----------------------------------------------------------
  'ui.click': [
    { wave: 'triangle', f0: 1800, f1: 1200, dur: 0.03, gain: 0.12 },
  ],
  'ui.select': [
    { wave: 'sine', f0: 920, dur: 0.06, gain: 0.13, attack: 0.005 },
  ],
  // Antippen heißt: das Ding wacht auf. Jede Gattung startet anders.
  'start.infantry': [
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 2400, f1: 1400, dur: 0.04, gain: 0.16, q: 2, times: 2, gap: 0.06 },
    { wave: 'square', f0: 620, f1: 880, dur: 0.09, gain: 0.12, attack: 0.01, at: 0.05 },
  ],
  'start.vehicle': [
    { wave: 'square', f0: 240, f1: 120, dur: 0.05, gain: 0.16 },
    { wave: 'sawtooth', f0: 55, f1: 165, dur: 0.4, gain: 0.26, attack: 0.03 },
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 600, f1: 1700, dur: 0.34, gain: 0.16, q: 0.9, attack: 0.02 },
    { wave: 'sawtooth', f0: 110, f1: 90, dur: 0.3, gain: 0.12, at: 0.34, attack: 0.04 },
  ],
  'start.aircraft': [
    { wave: 'sawtooth', f0: 320, f1: 1250, dur: 0.55, gain: 0.14, attack: 0.12 },
    { wave: 'noise', color: 'white', filter: 'bandpass', f0: 1800, f1: 4200, dur: 0.55, gain: 0.1, q: 1.2, attack: 0.15 },
  ],
  'start.ship': [
    { wave: 'sine', f0: 150, f1: 110, dur: 0.45, gain: 0.2, attack: 0.05 },
    { wave: 'triangle', f0: 226, f1: 165, dur: 0.45, gain: 0.12, attack: 0.05 },
  ],
  'start.building': [
    { wave: 'triangle', f0: 440, f1: 660, dur: 0.22, gain: 0.16, attack: 0.02 },
    { wave: 'sine', f0: 110, dur: 0.35, gain: 0.14, attack: 0.03 },
  ],
  'ui.order': [
    { wave: 'sine', f0: 700, dur: 0.07, gain: 0.14, attack: 0.005 },
    { wave: 'sine', f0: 940, dur: 0.1, gain: 0.14, attack: 0.005, at: 0.06 },
  ],
  'ui.open': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 700, f1: 2200, dur: 0.14, gain: 0.14, q: 0.8, attack: 0.02 },
  ],
  'ui.close': [
    { wave: 'noise', color: 'pink', filter: 'bandpass', f0: 2200, f1: 700, dur: 0.14, gain: 0.14, q: 0.8, attack: 0.02 },
  ],
  'ui.notice': [
    { wave: 'sine', f0: 1180, dur: 0.16, gain: 0.16, attack: 0.005 },
  ],
  'ui.error': [
    { wave: 'square', f0: 165, dur: 0.14, gain: 0.18, attack: 0.005, times: 2, gap: 0.17 },
  ],
} satisfies Record<string, Layer[]>

export type Cue = keyof typeof CUES

/** Mindestabstand gleicher Klänge in Sekunden – ohne ihn wird eine Schlacht zu Lärm. */
const THROTTLE: Partial<Record<Cue, number>> = {
  'shot.bullet': 0.05, 'shot.cannon': 0.06, 'shot.shell': 0.09, 'shot.flak': 0.12, 'shot.arrow': 0.06,
  'shot.rocket': 0.12, 'shot.missile': 0.2, 'shot.bomb': 0.2, 'shot.torpedo': 0.3, 'shot.melee': 0.1, 'shot.nuke': 2,
  'hit.small': 0.05, 'hit.heavy': 0.07, 'hit.water': 0.12,
  'explosion.small': 0.07, 'explosion.large': 0.12, 'collapse': 0.25, 'die.person': 0.12, 'nuke': 3,
  'gather.wood': 0.12, 'gather.stone': 0.12, 'gather.ore': 0.12, 'gather.soft': 0.2,
  'place': 0.15, 'build.done': 0.3, 'work': 0.35, 'air.arrive': 4, 'capture': 0.5, 'unit.ready': 0.4, 'arrive': 0.6, 'knowledge': 0.5,
  'alarm': 12, 'missile.launch': 2, 'missile.inbound': 4, 'power.low': 20, 'milestone': 2, 'avatar.down': 2, 'spawn': 5,
  'start.infantry': 0.08, 'start.vehicle': 0.12, 'start.aircraft': 0.12, 'start.ship': 0.12, 'start.building': 0.12,
  'radio.open': 0.25, 'radio.close': 0.05, 'radio.deny': 0.5,
  'code.report': 0.3, 'code.move': 0.3, 'code.attack': 0.3, 'code.work': 0.3, 'code.deny': 0.5, 'code.alert': 0.5,
  'ui.click': 0.03, 'ui.select': 0.05, 'ui.order': 0.06, 'ui.open': 0.08, 'ui.close': 0.08, 'ui.notice': 0.15, 'ui.error': 0.2,
}

const SHOT: Record<string, Cue> = {
  bullet: 'shot.bullet', cannon: 'shot.cannon', shell: 'shot.shell', rocket: 'shot.rocket', missile: 'shot.missile',
  flak: 'shot.flak', bomb: 'shot.bomb', torpedo: 'shot.torpedo', melee: 'shot.melee', arrow: 'shot.arrow', nuke: 'shot.nuke',
}
/** Welche Ansage zu welcher Befehlsart gehört. */
const ORDER_VOICE: Record<string, VoiceEvent> = {
  move: 'move', attackmove: 'move', attack: 'attack', fire: 'attack',
  harvest: 'work', capture: 'capture', load: 'load', unload: 'unload',
  rally: 'rally', stop: 'hold', guard: 'hold', hold: 'hold', return: 'move',
}

/** Leichte Waffen ticken, schwere schlagen ein. */
const LIGHT_WARHEAD = new Set(['bullet', 'cannon', 'flak', 'arrow', 'melee'])
/** Sammelklang nach Werkstoffgruppe; alles Weiche raschelt. */
const GATHER: Record<string, Cue> = {
  wood: 'gather.wood', planks: 'gather.wood', charcoal: 'gather.wood',
  stone: 'gather.stone', clay: 'gather.stone', sand: 'gather.stone', brick: 'gather.stone', cement: 'gather.stone', concrete: 'gather.stone',
  iron_ore: 'gather.ore', copper_ore: 'gather.ore', coal: 'gather.ore', uranium_ore: 'gather.ore',
  iron: 'gather.ore', copper: 'gather.ore', steel: 'gather.ore', gold: 'gather.ore',
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export interface AudioSettings {
  on: boolean
  master: number
  world: number
  ui: number
  ambient: number
  /** Die Titelmusik hat einen eigenen Schalter: Effekte will man oft ohne sie. */
  musicOn: boolean
  music: number
  /** Funk: gesprochen, als Kürzel oder aus. */
  voice: VoiceMode
  radio: number
  /** Motoren, Turbinen, Anlagensummen – getrennt von der stillen Umgebung. */
  machines: number
}

// Musik läuft im Hintergrund mit: laut genug, um sie zu bemerken, leise genug,
// um sie beim Spielen zu vergessen. Wer mehr will, zieht den Regler auf.
const DEFAULTS: AudioSettings = { on: false, master: 0.7, world: 1, ui: 0.75, ambient: 0.05, musicOn: true, music: 0.05, voice: 'speech', radio: 0.9, machines: 0.6 }
/** Erhöht, wenn ein gespeicherter Stand nicht mehr zum Klangbild passt. */
const SETTINGS_VERSION = 4
export const AUDIO_KEY = 'rc.audio'

const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v
const level = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : fallback

/**
 * Ton bleibt aus, bis der Spieler ihn einschaltet: Browser lassen Klang ohnehin
 * erst nach einer Eingabe zu, und niemand mag ungefragten Lärm. `?sound=on` und
 * `?volume=0..100` überschreiben den gespeicherten Stand für geteilte Links.
 */
export function audioSettings(search: string, stored: string | null): AudioSettings {
  const s = { ...DEFAULTS }
  if (stored) try {
    const saved = JSON.parse(stored) as Partial<AudioSettings>
    s.on = !!saved.on
    s.master = level(saved.master, s.master)
    s.world = level(saved.world, s.world)
    s.ui = level(saved.ui, s.ui)
    s.ambient = level(saved.ambient, s.ambient)
    s.musicOn = saved.musicOn === undefined ? s.musicOn : !!saved.musicOn
    s.music = level(saved.music, s.music)
    if (saved.voice === 'speech' || saved.voice === 'codes' || saved.voice === 'off') s.voice = saved.voice
    s.radio = level(saved.radio, s.radio)
    s.machines = level(saved.machines, s.machines)
    // Ältere Stände hatten eine viel zu laute Umgebung. Einmalig herunterziehen,
    // sonst bliebe das alte Klangbild in jedem Browser stehen, der schon da war.
    if (((saved as { v?: number }).v ?? 1) < 2) s.ambient = Math.min(s.ambient, DEFAULTS.ambient)
  } catch {}
  const q = new URLSearchParams(search)
  if (q.has('sound')) s.on = q.get('sound') !== 'off'
  if (q.has('music')) s.musicOn = q.get('music') !== 'off'
  if (q.has('voice')) { const v = q.get('voice'); s.voice = v === 'off' ? 'off' : v === 'codes' ? 'codes' : 'speech' }
  if (q.has('volume')) s.master = level(Number(q.get('volume')) / 100, s.master)
  return s
}

// ---------------------------------------------------------------------------
// Dienst
// ---------------------------------------------------------------------------

export interface PlayOptions {
  /** Weltkoordinaten. Ohne sie klingt der Ton mittig und ungedämpft. */
  x?: number
  y?: number
  /** Zusätzlicher Faktor, etwa nach Gebäudegröße. */
  gain?: number
  /** Eigener Drosselschlüssel, wenn mehrere Anlässe denselben Klang teilen. */
  key?: string
  bus?: Bus
}

/**
 * Die Klangrolle folgt zuerst der Art des Objekts und erst dann dem Bauplan:
 * Bewohner und Bauplan-Gebäude stehen nicht in DEFS und hätten sonst keine Stimme.
 */
function voiceRole(e: { kind?: string, def?: { category?: string } }): VoiceRole {
  if (e.kind === 'b' || e.kind === 'n') return 'plant'
  const category = e.def?.category
  if (category === 'vehicle') return 'vehicle'
  if (category === 'aircraft') return 'air'
  if (category === 'ship') return 'sea'
  if (category === 'structure' || category === 'defense') return 'plant'
  return 'infantry'
}

/** Gleichzeitige Klänge. Darüber hinaus fällt Neues weg, statt zu übersteuern. */
const MAX_VOICES = 24
const NOISE_SECONDS = 2.5
/** Bis 8 m/px ist alles zu hören, ab 40 m/px sieht man die Lage nur noch. */
const AUDIBLE_NEAR = 8, AUDIBLE_FAR = 40
/** Verkürzte Schallgeschwindigkeit: ein ferner Einschlag kommt spürbar später an, ohne zu stören. */
const SOUND_SPEED = 1500
const MAX_DELAY = 0.45

interface Bed { gain: GainNode, level: number, swell: GainNode }

export class Audio extends Service {
  // Kamera für die Ortung, Zustand für Ereignisse und Zählung, Gelände für Wasser.
  static inject = ['camera', 'state', 'terrain']
  settings: AudioSettings
  private ac?: AudioContext
  private master?: GainNode
  private buses?: Record<Bus, GainNode>
  private noise = new Map<NoiseColor, AudioBuffer>()
  private beds?: Record<'wind' | 'surf' | 'leaves' | 'traffic' | 'air' | 'plant', Bed>
  private song?: Music
  voice?: Voice
  private voices = 0
  private lastAt = new Map<string, number>()
  private ready = new Set<string>()
  private sceneAt = 0
  private nextWave = 0
  private lastOrderKind = ''
  private lastOrderAt = -Infinity

  constructor(ctx: Context) {
    super(ctx, 'audio')
    let stored: string | null = null
    try { stored = localStorage.getItem(AUDIO_KEY) } catch {}
    this.settings = audioSettings(typeof location === 'undefined' ? '' : location.search, stored)
  }

  [Service.init]() {
    this.ctx.on('state/event', (ev) => this.onEvent(ev))
    this.ctx.on('state/notice', (_text, kind) => {
      this.cue(kind === 'error' ? 'ui.error' : 'ui.notice')
      // Eine Ablehnung erklärt sich besser mit drei Worten als mit einem Summer.
      if (kind === 'error') this.voice?.say('deny', { urgent: true })
    })
    this.ctx.on('state/phase', (phase) => { if (phase === 'play') this.cue('spawn') })
    this.ctx.on('state/selection', () => this.onSelection())
    this.ctx.on('input/order', (ids, kind) => this.onOrder(ids, kind))
    this.ctx.on('state/me', () => this.onProduction())
    this.ctx.on('state/chat', () => this.cue('ui.notice'))
    this.ctx.on('render/frame', (dt) => this.frame(dt))
    const visibility = () => {
      if (!this.ac) return
      if (typeof document !== 'undefined' && document.hidden) void this.ac.suspend()
      else if (this.settings.on) { void this.ac.resume(); if (this.settings.musicOn) this.song?.start() }
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility)
    // War der Ton aus einer früheren Sitzung an, darf der Kontext erst nach der
    // ersten Eingabe laufen; das verlangt jeder Browser.
    const wake = () => { const ac = this.context(); if (ac) void ac.resume() }
    if (typeof addEventListener !== 'undefined') {
      for (const gesture of ['pointerdown', 'keydown', 'click']) addEventListener(gesture, wake, { once: true })
    }
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility)
      if (typeof removeEventListener !== 'undefined') {
        for (const gesture of ['pointerdown', 'keydown', 'click']) removeEventListener(gesture, wake)
      }
      this.song?.stop()
      this.voice?.cancel()
      void this.ac?.close()
      this.ac = undefined
    }
  }

  // ------------------------------------------------------------- Bedienung

  get on() { return this.settings.on }

  /** Gerade klingende Stimmen – Grundlage des Budgets und der Prüfung. */
  get playing() { return this.voices }

  /** Schaltet den Ton um und liefert den neuen Stand für die Beschriftung. */
  toggle(on = !this.settings.on) {
    this.settings.on = on
    this.save()
    if (!on) {
      this.silence()
      this.song?.stop()
      this.voice?.cancel()
      void this.ac?.suspend()
      return false
    }
    const ac = this.context()
    if (ac) {
      void ac.resume()
      if (this.settings.musicOn) this.song?.start()
      this.cue('ui.notice')
    }
    return true
  }

  /** Funk: gesprochen, als Kürzel oder aus. */
  setVoice(mode: VoiceMode) {
    this.settings.voice = mode
    this.save()
    if (this.voice) { this.voice.mode = mode; if (mode === 'off') this.voice.cancel() }
    return mode
  }

  /** Musik getrennt vom Rest: Effekte bleiben, der Ohrwurm geht. */
  toggleMusic(on = !this.settings.musicOn) {
    this.settings.musicOn = on
    this.save()
    if (!on) { this.song?.stop(); return false }
    if (this.settings.on) { this.song?.rewind(); this.song?.start() }
    return true
  }

  get music() { return this.settings.musicOn }

  /** Lautstärke eines Reglers (0..1). */
  setVolume(which: 'master' | Bus, value: number) {
    this.settings[which] = clamp(value, 0, 1)
    this.save()
    if (!this.ac) return
    if (which === 'master') this.master!.gain.setTargetAtTime(this.settings.master, this.ac.currentTime, 0.02)
    else this.buses![which].gain.setTargetAtTime(this.settings[which], this.ac.currentTime, 0.02)
  }

  /** Bedienklang ohne Ort. */
  cue(name: Cue, opts: PlayOptions = {}) {
    return this.play(name, { bus: 'ui', ...opts })
  }

  /**
   * Spielt ein Rezept. Liefert `false`, wenn der Klang bewusst entfällt: Ton aus,
   * zu weit weg, zu schnell wiederholt oder zu viele Stimmen gleichzeitig.
   */
  play(name: Cue, opts: PlayOptions = {}): boolean {
    const recipe = CUES[name]
    if (!recipe || !this.settings.on) return false
    const ac = this.context()
    if (!ac) return false
    const bus = opts.bus ?? (opts.x === undefined ? 'ui' : 'world')
    const now = ac.currentTime
    const key = opts.key ?? name
    const gap = THROTTLE[name] ?? 0.04
    if (now - (this.lastAt.get(key) ?? -Infinity) < gap) return false
    let gain = opts.gain ?? 1, pan = 0, delay = 0, cutoff = 20000
    if (opts.x !== undefined && opts.y !== undefined) {
      const heard = this.place(opts.x, opts.y)
      if (!heard) return false
      gain *= heard.gain
      pan = heard.pan
      delay = heard.delay
      cutoff = heard.cutoff
    }
    if (gain < 0.02) return false
    if (this.voices >= MAX_VOICES) return false
    this.lastAt.set(key, now)
    if (this.lastAt.size > 400) this.lastAt.clear()
    this.spawn(recipe, this.buses![bus], gain, pan, delay, cutoff)
    return true
  }

  // ------------------------------------------------------------- Ortung

  /**
   * Wo ist das Ereignis im Bild? Entfernung dämpft, die Seite gibt das Panorama,
   * ferne Klänge kommen später und dumpfer an. Jenseits des Bildausschnitts und
   * aus der strategischen Höhe hört man nichts mehr.
   */
  private place(x: number, y: number) {
    const cam = this.ctx.camera
    if (!cam) return { gain: 1, pan: 0, delay: 0, cutoff: 20000 }
    const zoom = 1 - clamp((cam.mpp - AUDIBLE_NEAR) / (AUDIBLE_FAR - AUDIBLE_NEAR), 0, 1)
    if (zoom <= 0) return null
    const half = Math.max(1, cam.width * cam.mpp / 2)
    const dx = x - cam.x, dy = y - cam.y
    const distance = Math.hypot(dx, dy)
    const screens = distance / half
    if (screens > 3) return null
    return {
      gain: zoom / (1 + screens * screens * 1.6),
      pan: clamp(dx / half, -1, 1) * 0.75,
      delay: Math.min(MAX_DELAY, distance / SOUND_SPEED),
      cutoff: clamp(20000 / (1 + screens * 3), 700, 20000),
    }
  }

  // ------------------------------------------------------------- Abspieler

  private spawn(recipe: Layer[], bus: GainNode, level: number, pan: number, delay: number, cutoff: number) {
    const ac = this.ac!
    const start = ac.currentTime + delay
    const out = ac.createGain()
    out.gain.value = level * (0.92 + Math.random() * 0.16)
    let tail: AudioNode = out
    if (cutoff < 19000) {
      const lp = ac.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cutoff
      tail = tail.connect(lp)
    }
    if (pan) {
      const panner = ac.createStereoPanner()
      panner.pan.value = pan
      tail = tail.connect(panner)
    }
    tail.connect(bus)
    // Alle Schichten eines Klangs teilen dieselbe kleine Verstimmung, sonst
    // klingt derselbe Schuss jedes Mal wie aus derselben Konserve.
    const tune = 1 + (Math.random() - 0.5) * 0.1
    const sources: AudioScheduledSourceNode[] = []
    for (const layer of recipe) {
      for (let i = 0; i < (layer.times ?? 1); i++) {
        const at = start + (layer.at ?? 0) + i * (layer.gap ?? 0)
        const shift = tune * Math.pow(2, (layer.step ?? 0) * i / 12)
        const env = ac.createGain()
        const peak = Math.max(1e-4, layer.gain)
        const attack = Math.max(0.001, layer.attack ?? 0.002)
        env.gain.setValueAtTime(0, at)
        env.gain.linearRampToValueAtTime(peak, at + attack)
        env.gain.exponentialRampToValueAtTime(peak * 1e-3, at + layer.dur)
        env.gain.setValueAtTime(0, at + layer.dur)
        env.connect(out)
        let source: AudioScheduledSourceNode
        if (layer.wave === 'noise') {
          const buffer = ac.createBufferSource()
          buffer.buffer = this.noiseBuffer(layer.color ?? 'white')
          buffer.loop = true
          buffer.playbackRate.value = 0.85 + Math.random() * 0.3
          const filter = ac.createBiquadFilter()
          filter.type = layer.filter ?? 'lowpass'
          filter.Q.value = layer.q ?? 1
          sweep(filter.frequency, layer.f0 * shift, layer.f1 === undefined ? undefined : layer.f1 * shift, at, layer.dur)
          buffer.connect(filter).connect(env)
          source = buffer
        } else {
          const osc = ac.createOscillator()
          osc.type = layer.wave
          sweep(osc.frequency, layer.f0 * shift, layer.f1 === undefined ? undefined : layer.f1 * shift, at, layer.dur)
          osc.connect(env)
          source = osc
        }
        source.start(at)
        source.stop(at + layer.dur)
        sources.push(source)
      }
    }
    this.voices++
    let open = sources.length
    for (const source of sources) source.onended = () => {
      source.disconnect()
      if (--open > 0) return
      out.disconnect()
      this.voices--
    }
  }

  /** Rauschvorrat: einmal erzeugt, danach für jeden Knall wiederverwendet. */
  private noiseBuffer(color: NoiseColor) {
    const cached = this.noise.get(color)
    if (cached) return cached
    const ac = this.ac!
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * NOISE_SECONDS), ac.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0, b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1
      if (color === 'white') data[i] = w
      else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5 }
      else {
        b0 = 0.99765 * b0 + w * 0.0990460
        b1 = 0.96300 * b1 + w * 0.2965164
        b2 = 0.57000 * b2 + w * 1.0526913
        data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.4
      }
    }
    // Auf Vollaussteuerung normieren: sonst wäre braunes Rauschen um ein
    // Vielfaches lauter als jede Schwingung und der Begrenzer bügelte alles platt.
    let peak = 1e-6
    for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > peak) peak = v }
    for (let i = 0; i < data.length; i++) data[i] /= peak
    this.noise.set(color, buffer)
    return buffer
  }

  // ------------------------------------------------------------- Umgebung

  /**
   * Wind, Brandung und Blätter laufen als Dauerklang. Zwei Regeln halten das Bett
   * unauffällig: die Klangfarbe bleibt fest – ein wandernder Filter klingt nach
   * Geisterhaus, nicht nach Wetter –, und die Schwelle liegt vor dem Szenenpegel,
   * damit im Binnenland wirklich Ruhe ist statt eines leisen Meeres.
   */
  private ambience() {
    if (this.beds || !this.ac) return
    const ac = this.ac, bus = this.buses!.ambient
    const bed = (spec: { color: NoiseColor, type: BiquadFilterType, frequency: number, q: number, sway: number, depth: number }) => {
      const source = ac.createBufferSource()
      source.buffer = this.noiseBuffer(spec.color)
      source.loop = true
      const filter = ac.createBiquadFilter()
      filter.type = spec.type
      filter.frequency.value = spec.frequency
      filter.Q.value = spec.q
      // Flache, eher zügige Schwankung: Bewegung ja, Wabern nein.
      const swell = ac.createGain()
      swell.gain.value = 1 - spec.depth
      if (spec.depth > 0) {
        const lfo = ac.createOscillator()
        lfo.frequency.value = spec.sway
        const amount = ac.createGain()
        amount.gain.value = spec.depth
        lfo.connect(amount).connect(swell.gain)
        lfo.start()
      }
      const gain = ac.createGain()
      gain.gain.value = 0
      source.connect(filter).connect(swell).connect(gain).connect(bus)
      source.start()
      return { gain, level: 0, swell }
    }
    const machine = (spec: { wave: OscillatorType, frequency: number, spread: number, cutoff: number, q: number, sway: number, sweep: number }) => {
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = spec.cutoff
      filter.Q.value = spec.q
      const swell = ac.createGain()
      const gain = ac.createGain()
      gain.gain.value = 0
      // Motoren hängen am Maschinenbus: die Umgebung steht ab Werk auf 5 %, und
      // ein landendes Flugzeug darf davon nicht abhängen.
      filter.connect(swell).connect(gain).connect(this.buses!.machines)
      const lfo = ac.createOscillator()
      lfo.frequency.value = spec.sway
      const colour = ac.createGain()
      colour.gain.value = spec.sweep
      lfo.connect(colour).connect(filter.frequency)
      lfo.start()
      for (const detune of [-9, 9]) {
        const osc = ac.createOscillator()
        osc.type = spec.wave
        osc.frequency.value = spec.frequency
        osc.detune.value = detune * spec.spread
        osc.connect(filter)
        osc.start()
      }
      return { gain, level: 0, swell }
    }
    this.beds = {
      // Wind ist ein gleichmäßiges, weiches Rauschen; erst Blätter geben ihm Höhen.
      wind: bed({ color: 'pink', type: 'lowpass', frequency: 520, q: 0.3, sway: 0, depth: 0 }),
      // Die Brandung schwankt nicht, sie bricht – die Wellen kommen aus `wave()`.
      surf: bed({ color: 'pink', type: 'lowpass', frequency: 780, q: 0.3, sway: 0, depth: 0 }),
      leaves: bed({ color: 'pink', type: 'bandpass', frequency: 1700, q: 0.8, sway: 0, depth: 0 }),
      traffic: machine({ wave: 'sawtooth', frequency: 47, spread: 6, cutoff: 260, q: 2.5, sway: 0.9, sweep: 90 }),
      air: machine({ wave: 'sawtooth', frequency: 290, spread: 4, cutoff: 1500, q: 1.4, sway: 0.35, sweep: 700 }),
      plant: machine({ wave: 'triangle', frequency: 100, spread: 2, cutoff: 380, q: 1, sway: 0.14, sweep: 60 }),
    }
  }

  /**
   * Eine Welle: sie bricht schnell und läuft langsam aus. Eine gleichmäßige
   * Schwingung darüber klänge nach Atmen; erst der schiefe Verlauf klingt nach Meer.
   */
  private wave(at: number) {
    const surf = this.beds!.surf
    const gain = surf.swell.gain
    gain.cancelScheduledValues(at)
    gain.setValueAtTime(0.25, at)
    gain.linearRampToValueAtTime(1, at + 0.6 + Math.random() * 0.5)
    gain.exponentialRampToValueAtTime(0.25, at + 3.5 + Math.random() * 2)
    this.nextWave = at + 8 + Math.random() * 6
  }

  /** Vier Messungen je Sekunde genügen; das Bett folgt in halben Sekunden. */
  private frame(dt: number) {
    if (!this.settings.on || !this.ac || !this.beds) return
    this.sceneAt += dt
    if (this.sceneAt < 0.25) return
    this.sceneAt = 0
    const cam = this.ctx.camera
    if (!cam) return
    const near = 1 - clamp((cam.mpp - AUDIBLE_NEAR) / (AUDIBLE_FAR - AUDIBLE_NEAR), 0, 1)
    let water = 0, forest = 0
    if (near > 0) {
      const step = cam.width * cam.mpp * 0.3
      const isWater = this.ctx.terrain?.isWater
      for (const [ox, oy] of [[0, 0], [-step, -step], [step, -step], [-step, step], [step, step]] as const) {
        const x = cam.x + ox, y = cam.y + oy
        if (isWater && isWater(x, y)) water += 0.2
        else forest += biomeAt(x, y).forestDensity * 0.2
      }
    }
    // Was im Bild ist, hört man auch: Fahrzeuge brummen, Flugzeuge pfeifen,
    // Anlagen summen. Gezählt wird viermal je Sekunde, nicht je Bild.
    let traffic = 0, air = 0, plant = 0, working = false
    const state = this.ctx.state
    if (near > 0 && state) {
      const view = cam.viewRect()
      for (const e of state.entities.values()) {
        if (e.ghost || !e.def || e.x < view.x0 || e.x > view.x1 || e.y < view.y0 || e.y > view.y1) continue
        if (e.kind === 'b') { if (!e.off) plant++ }
        else if (e.kind === 'u') {
          const domain = (e.def as { domain?: string }).domain
          if (domain === 'air') air++
          else if (e.speed > 0.5 && (e.def.category === 'vehicle' || e.def.category === 'ship')) traffic++
        }
      }
      // Läuft ein Bauauftrag, hört man die Baustelle in der eigenen Siedlung.
      working = Object.values(state.me?.prod ?? {}).some(slot => !!slot?.type)
    }
    const share = (count: number, full: number) => Math.min(1, count / full)
    this.ramp(this.beds.wind, near * (0.1 + 0.08 * (1 - forest)))
    const surf = near * water * 0.35
    this.ramp(this.beds.surf, surf)
    if (surf > 0 && this.ac.currentTime >= this.nextWave) this.wave(this.ac.currentTime)
    this.ramp(this.beds.leaves, near * forest * 0.22)
    this.ramp(this.beds.traffic, near * share(traffic, 8) * 0.45)
    this.ramp(this.beds.air, near * share(air, 3) * 0.4)
    this.ramp(this.beds.plant, near * share(plant, 10) * 0.25)
    if (working) {
      const home = state?.homePosition?.()
      if (home) this.play('work', { x: home.x, y: home.y, gain: 0.7 + Math.random() * 0.5 })
    }
  }

  private ramp(bed: Bed, target: number) {
    if (Math.abs(bed.level - target) < 0.01) return
    bed.level = target
    bed.gain.gain.setTargetAtTime(target, this.ac!.currentTime, 0.5)
  }

  // ------------------------------------------------------------- Ereignisse

  private onEvent(ev: GameEvent) {
    switch (ev.e) {
      case 'shot':
        this.play(SHOT[ev.w] ?? 'shot.bullet', { x: ev.x, y: ev.y })
        break
      case 'hit': {
        if (ev.r > 0) { this.play(ev.r >= 60 ? 'explosion.large' : 'explosion.small', { x: ev.x, y: ev.y }); break }
        if (this.ctx.terrain?.isWater(ev.x, ev.y)) { this.play('hit.water', { x: ev.x, y: ev.y }); break }
        this.play(LIGHT_WARHEAD.has(ev.w) ? 'hit.small' : 'hit.heavy', { x: ev.x, y: ev.y })
        break
      }
      case 'die': {
        const size = DEFS[ev.ty]?.size ?? 5
        const cue: Cue = ev.k === 'b' ? 'collapse' : ev.k === 'p' || ev.k === 'a' ? 'die.person' : size >= 6 ? 'explosion.large' : 'explosion.small'
        this.play(cue, { x: ev.x, y: ev.y, gain: clamp(0.6 + size / 30, 0.6, 1.3) })
        // Eigene Verluste melden sich einmal je Angriffswelle, nicht je Treffer.
        if (ev.owner !== undefined && ev.owner === this.ctx.state?.myId) {
          this.cue('alarm')
          this.voice?.say(ev.k === 'b' ? 'position_lost' : 'losses', { urgent: true, faction: this.ctx.state?.me?.faction })
        }
        break
      }
      case 'placed': {
        // Ein Landungsflugzeug setzt nicht auf wie eine Baustelle gesetzt wird.
        const def = DEFS[ev.ty]
        if (def?.category === 'aircraft') { this.play('air.arrive', { x: ev.x, y: ev.y, gain: 1.2 }); break }
        this.play('place', { x: ev.x, y: ev.y })
        break
      }
      case 'capture': {
        const e = this.ctx.state?.entities.get(ev.id)
        this.play('capture', e ? { x: e.x, y: e.y } : {})
        break
      }
      case 'gather':
        this.play(GATHER[ev.rs] ?? 'gather.soft', { x: ev.x, y: ev.y })
        break
      case 'site_done': {
        const e = this.ctx.state?.entities.get(ev.id)
        this.play('build.done', e ? { x: e.x, y: e.y } : { bus: 'ui' })
        break
      }
      case 'avatar_died':
        this.play('avatar.down', { x: ev.x, y: ev.y })
        this.voice?.say('avatar_down', { urgent: true })
        break
      case 'knowledge':
        this.cue('knowledge')
        break
      case 'arrive':
        this.cue('arrive')
        break
    }
  }

  /**
   * Angetippt heißt: das Ding wacht auf. Infanterie klickt, Fahrzeuge starten den
   * Motor, Flugzeuge fahren die Turbine hoch, Schiffe tuten, Anlagen fahren an.
   * Gespielt wird der Klang des zuerst gewählten Objekts, an dessen Ort.
   */
  private onSelection() {
    const state = this.ctx.state
    const chosen = state?.selectedEntities?.() ?? []
    const first = chosen[0]
    if (!first) { this.cue('ui.select'); return }
    const role = voiceRole(first)
    const cue: Cue = role === 'vehicle' ? 'start.vehicle'
      : role === 'air' ? 'start.aircraft'
      : role === 'sea' ? 'start.ship'
      : role === 'plant' ? 'start.building'
      : 'start.infantry'
    // Ohne Ort: eine Rückmeldung auf den eigenen Klick darf nie an der
    // Entfernung scheitern, auch nicht bei herausgezoomter Karte.
    this.play(cue, { key: 'start', bus: 'ui' })
    // Gesprochen wird nur für Eigenes. Der Avatar meldet sich nicht bei sich
    // selbst, und ein ganzer Verband spricht mit einer Stimme.
    const mine = chosen.filter(e => e.owner === state?.myId)
    if (!mine.length || mine[0].kind === 'a') return
    const faction = state?.me?.faction
    if (mine.length >= 40) this.voice?.say('group', { faction })
    else this.voice?.say('select', { role: voiceRole(mine[0]), id: mine[0].id, faction })
  }

  /**
   * Quittung auf einen Befehl. Dieselbe Befehlsart hintereinander bekommt nur
   * den kurzen Klang – erst der Wechsel ist eine Ansage wert.
   */
  private onOrder(ids: number[], kind: string) {
    this.cue('ui.order')
    const event = ORDER_VOICE[kind]
    if (!event) return
    const state = this.ctx.state
    const now = this.ac?.currentTime ?? 0
    const repeated = kind === this.lastOrderKind && now - this.lastOrderAt < 8
    this.lastOrderKind = kind
    this.lastOrderAt = now
    if (repeated) return
    const first = ids.map(id => state?.entities.get(id)).find(Boolean)
    this.voice?.say(event, {
      role: first ? voiceRole(first) : undefined,
      faction: state?.me?.faction,
      id: ids.length === 1 ? ids[0] : undefined,
    })
  }

  /** Fertige Bauaufträge melden sich einmal, sobald sie in der Liste erscheinen. */
  private onProduction() {
    const me = this.ctx.state?.me
    // Stromnot ist die Meldung, die man am ehesten überhört – sie bekommt einen Brummer.
    if (me && me.powerCons > me.powerProd) {
      this.cue('power.low')
      this.voice?.say('power_low', { role: 'plant', faction: me.faction })
    }
    if (!me?.prod) { this.ready.clear(); return }
    const seen = new Set<string>()
    let fresh = false
    for (const [category, slot] of Object.entries(me.prod)) {
      for (const type of slot?.ready ?? []) {
        const key = `${category}:${type}`
        seen.add(key)
        if (!this.ready.has(key)) fresh = true
      }
    }
    this.ready = seen
    if (fresh) {
      this.cue('unit.ready')
      this.voice?.say('unit_ready', { role: 'plant', faction: me.faction })
    }
  }

  // ------------------------------------------------------------- Technik

  /** Der Klangkontext entsteht erst beim Einschalten – vorher lässt ihn kein Browser laufen. */
  private context() {
    if (this.ac) return this.ac
    if (!this.settings.on || typeof AudioContext === 'undefined') return undefined
    const ac = new AudioContext()
    const master = ac.createGain()
    master.gain.value = this.settings.master
    // Begrenzer: eine Salve aus zwanzig Stimmen darf nicht übersteuern.
    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 12
    limiter.ratio.value = 8
    limiter.attack.value = 0.004
    limiter.release.value = 0.18
    master.connect(limiter).connect(ac.destination)
    const bus = (volume: number) => { const g = ac.createGain(); g.gain.value = volume; g.connect(master); return g }
    this.ac = ac
    this.master = master
    this.buses = {
      world: bus(this.settings.world), ui: bus(this.settings.ui), ambient: bus(this.settings.ambient),
      music: bus(this.settings.music), radio: bus(this.settings.radio), machines: bus(this.settings.machines),
    }
    // Der Funk spricht über die Sprachausgabe des Geräts; Squelch und Kürzel
    // laufen durch den eigenen Bus, damit ein Regler beides zugleich fasst.
    this.voice = new Voice({
      speech: typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis,
      utterance: typeof SpeechSynthesisUtterance === 'undefined' ? undefined : (text) => new SpeechSynthesisUtterance(text),
      now: () => ac.currentTime,
      cue: (name, opts) => this.play(name as Cue, { ...opts, bus: 'radio' }),
      log: (text) => this.ctx.emit('audio/radio', text),
    })
    this.voice.mode = this.settings.voice
    this.ambience()
    this.song = new Music({ ac, out: this.buses.music, noise: (color) => this.noiseBuffer(color) })
    if (this.settings.musicOn) this.song.start()
    return ac
  }

  private silence() {
    if (!this.beds || !this.ac) return
    for (const bed of Object.values(this.beds)) { bed.level = 0; bed.gain.gain.setTargetAtTime(0, this.ac.currentTime, 0.1) }
  }

  private save() {
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ ...this.settings, v: SETTINGS_VERSION })) } catch {}
  }
}

/** Frequenzverlauf einer Schicht; Web Audio kann nicht auf 0 laufen. */
function sweep(param: AudioParam, from: number, to: number | undefined, at: number, dur: number) {
  param.setValueAtTime(Math.max(1, from), at)
  if (to !== undefined && to !== from) param.exponentialRampToValueAtTime(Math.max(1, to), at + dur)
}

export { CUES }

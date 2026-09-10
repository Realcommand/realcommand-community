// Real Command · Titelmusik
// =============================================================================
// „Kestrel Run“ – ein eigenes Stück im Stil der Amiga-Action-Musik der späten
// Achtziger: Sechzehntel-Raster, pentatonischer Hook, gehämmerter Bass,
// Arpeggien statt echter Akkorde und Schlagzeug aus Rauschen. Nichts davon ist
// abgehört oder nachgebaut; es ist dieselbe Machart, nicht dieselbe Melodie.
//
// Gespielt wird wie in einem Tracker: eine Tabelle aus Takten zu je 16 Schritten,
// die ein Zeitgeber mit Vorlauf in den Klangkontext schreibt. Der Browser-Takt
// ist zu ungenau für Musik, die Uhr des Klangkontexts nicht.

type NoiseColor = 'white' | 'pink' | 'brown'

export interface MusicHost {
  ac: AudioContext
  out: AudioNode
  noise(color: NoiseColor): AudioBuffer
}

const SEMITONES: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }

/** „A4“ → 440. Unbekannte Zeichen ergeben 0 und werden nicht gespielt. */
export function noteFrequency(name: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(name)
  if (!match) return 0
  const midi = SEMITONES[match[1]] + (Number(match[2]) + 1) * 12
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Ein Takt: 16 Schritte, durch Leerzeichen getrennt. „.“ ist Pause. */
const bar = (row: string) => row.trim().split(/\s+/)

// --- Der Satz ---------------------------------------------------------------
// Grundtonart e-moll, Folge Em – C – G – D. Der Hook bleibt in der Molltonleiter
// ohne Halbtöne (E G A B D); daher klingt er auch nach dem zehnten Durchlauf
// noch nach Melodie und nicht nach Übung.

const HOOK = [
  bar('E4 .  E4 .  G4 .  A4 .  B4 .  .  A4 .  G4 .  . '),
  bar('E5 .  .  D5 .  B4 .  .  A4 .  G4 .  E4 .  .  . '),
  bar('D4 .  G4 .  B4 .  D5 .  B4 .  A4 .  G4 .  .  . '),
  bar('A4 .  .  B4 .  A4 .  F#4 . E4 .  .  .  .  .  . '),
]
const ANSWER = [
  bar('E4 .  E4 .  G4 .  A4 .  B4 .  D5 .  B4 .  A4 . '),
  bar('G4 .  .  A4 .  G4 .  E4 .  .  D4 .  E4 .  .  . '),
  bar('D5 .  B4 .  G4 .  B4 .  D5 .  E5 .  D5 .  B4 . '),
  bar('E5 .  .  .  .  .  .  .  B4 .  D5 .  E5 .  .  . '),
]
/** Zweiter Durchgang eine Oktave höher, mit schnellerem Lauf am Ende. */
const HIGH = [
  bar('E5 .  E5 .  G5 .  A5 .  B5 .  .  A5 .  G5 .  . '),
  bar('E6 .  .  D6 .  B5 .  .  A5 .  G5 .  E5 .  .  . '),
  bar('D5 .  G5 .  B5 .  D6 .  B5 .  A5 .  G5 .  .  . '),
  bar('A5 G5 E5 D5 B4 A4 G4 E4 .  .  .  .  .  .  .  . '),
]

const CHORDS = ['E', 'C', 'G', 'D']
/** Dreiklänge als Arpeggio – der Trick, mit einer Stimme einen Akkord zu hören. */
const TRIADS: Record<string, string[]> = {
  E: ['E4', 'G4', 'B4'],
  C: ['C4', 'E4', 'G4'],
  G: ['G3', 'B3', 'D4'],
  D: ['D4', 'F#4', 'A4'],
}
/** Basslage je Akkord: Grundton unten, Oktave als Antwort. */
const ROOTS: Record<string, [string, string]> = {
  E: ['E1', 'E2'], C: ['C2', 'C3'], G: ['G1', 'G2'], D: ['D2', 'D3'],
}

/** Gehämmerte Achtel mit Synkope – der Antrieb des Stücks. */
const BASS_RHYTHM = bar('r  .  r  .  r  .  o  .  r  .  r  o  .  r  .  o ')
const BASS_DRIVE = bar('r  r  .  r  r  .  r  o  r  r  .  r  o  .  r  . ')
const DRUM_BEAT = bar('K  h  h  S  h  h  K  h  K  h  h  S  h  h  h  h ')
const DRUM_FILL = bar('K  h  S  S  K  h  S  S  K  S  S  S  K  S  S  S ')
const DRUM_HALF = bar('K  .  .  .  .  .  S  .  .  .  K  .  .  .  S  . ')

interface Section {
  /** Wie oft dieser Abschnitt am Stück läuft. */
  bars: number
  lead?: string[][]
  arp: boolean
  bass: 'rhythm' | 'drive' | 'none'
  drums: 'beat' | 'fill' | 'half' | 'none'
}

/**
 * Aufbau: Vorspann, Hook, Antwort, hohe Wiederholung, Bruch – dann von vorn.
 * 28 Takte, bei 140 Schlägen je Minute knapp 48 Sekunden bis zur Wiederholung.
 */
const SONG: Section[] = [
  { bars: 2, arp: false, bass: 'rhythm', drums: 'beat' },
  { bars: 2, arp: true, bass: 'rhythm', drums: 'beat' },
  { bars: 4, lead: HOOK, arp: false, bass: 'rhythm', drums: 'beat' },
  { bars: 4, lead: ANSWER, arp: true, bass: 'drive', drums: 'beat' },
  { bars: 4, lead: HOOK, arp: true, bass: 'drive', drums: 'beat' },
  { bars: 4, lead: HIGH, arp: true, bass: 'drive', drums: 'fill' },
  { bars: 4, arp: true, bass: 'none', drums: 'half' },
  { bars: 4, lead: ANSWER, arp: true, bass: 'drive', drums: 'fill' },
]

export const BPM = 140
export const STEPS_PER_BAR = 16
/** Länge des Stücks in Takten. */
export const SONG_BARS = SONG.reduce((sum, section) => sum + section.bars, 0)

/** Welcher Abschnitt und welcher Takt darin – daraus ergibt sich jede Stimme. */
function locate(barIndex: number) {
  let at = barIndex % SONG_BARS
  for (const section of SONG) {
    if (at < section.bars) return { section, bar: at }
    at -= section.bars
  }
  return { section: SONG[0], bar: 0 }
}

const LOOKAHEAD = 0.6
const TICK_MS = 120

export class Music {
  playing = false
  private step = 0
  private next = 0
  private timer?: ReturnType<typeof setInterval>
  private host: MusicHost
  readonly stepDuration = 60 / BPM / 4

  constructor(host: MusicHost) { this.host = host }

  start() {
    if (this.playing) return
    this.playing = true
    this.next = this.host.ac.currentTime + 0.08
    this.schedule()
    this.timer = setInterval(() => this.schedule(), TICK_MS)
  }

  stop() {
    this.playing = false
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** Beginnt beim nächsten Start wieder am Anfang des Stücks. */
  rewind() { this.step = 0 }

  /**
   * Schreibt alle Schritte, die im Vorlauf liegen, in die Zukunft des
   * Klangkontexts. Wird vom Zeitgeber gerufen – und in der Prüfung direkt.
   */
  schedule() {
    if (!this.playing) return
    const ac = this.host.ac
    if (ac.state === 'suspended') return
    // Nach einer Pause (Fenster im Hintergrund) nicht alles Versäumte nachholen.
    if (this.next < ac.currentTime - 0.2) this.next = ac.currentTime + 0.05
    let guard = 0
    while (this.next < ac.currentTime + LOOKAHEAD && guard++ < 200) {
      this.play(this.step, this.next)
      this.step++
      this.next += this.stepDuration
    }
  }

  private play(step: number, at: number) {
    const barIndex = Math.floor(step / STEPS_PER_BAR)
    const inBar = step % STEPS_PER_BAR
    const { section, bar: barInSection } = locate(barIndex)
    const chord = CHORDS[barIndex % CHORDS.length]

    const leadRow = section.lead?.[barInSection % section.lead.length]
    const note = leadRow?.[inBar]
    if (note && note !== '.') this.voice('lead', noteFrequency(note), at, this.stepDuration * 3.2)

    if (section.arp && inBar % 2 === 0) {
      const triad = TRIADS[chord]
      this.voice('arp', noteFrequency(triad[(inBar / 2) % triad.length]), at, this.stepDuration * 1.6)
    }

    if (section.bass !== 'none') {
      const row = section.bass === 'drive' ? BASS_DRIVE : BASS_RHYTHM
      const slot = row[inBar]
      if (slot === 'r' || slot === 'o') {
        const [root, octave] = ROOTS[chord]
        this.voice('bass', noteFrequency(slot === 'o' ? octave : root), at, this.stepDuration * 1.8)
      }
    }

    if (section.drums !== 'none') {
      const row = section.drums === 'fill' ? DRUM_FILL : section.drums === 'half' ? DRUM_HALF : DRUM_BEAT
      const hit = row[inBar]
      if (hit === 'K') this.drum('kick', at)
      else if (hit === 'S') this.drum('snare', at)
      else if (hit === 'h') this.drum('hat', at, inBar % 4 === 0 ? 1 : 0.55)
    }
  }

  // --- Stimmen --------------------------------------------------------------

  private voice(kind: 'lead' | 'bass' | 'arp', frequency: number, at: number, dur: number) {
    if (!frequency) return
    const ac = this.host.ac
    const gain = ac.createGain()
    const peak = kind === 'lead' ? 0.2 : kind === 'bass' ? 0.22 : 0.085
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(peak * 1e-3, at + dur)
    gain.gain.setValueAtTime(0, at + dur)

    let tail: AudioNode = gain
    if (kind === 'bass') {
      // Ein Tiefpass mit eigener Hüllkurve gibt dem Bass den Anschlag.
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.Q.value = 6
      filter.frequency.setValueAtTime(Math.min(4000, frequency * 14), at)
      filter.frequency.exponentialRampToValueAtTime(Math.max(90, frequency * 2.2), at + dur)
      tail = gain.connect(filter)
    }
    tail.connect(this.host.out)

    // Zwei leicht verstimmte Rechtecke: der breite Klang der Trackerlieder.
    const voices = kind === 'arp' ? [0] : [-6, 6]
    const sources: OscillatorNode[] = []
    for (const detune of voices) {
      const osc = ac.createOscillator()
      osc.type = kind === 'bass' ? 'sawtooth' : kind === 'arp' ? 'triangle' : 'square'
      osc.frequency.setValueAtTime(frequency, at)
      osc.detune.value = detune
      osc.connect(gain)
      osc.start(at)
      osc.stop(at + dur)
      sources.push(osc)
    }
    if (kind === 'lead') {
      // Vibrato erst nach dem Anschlag – gehaltene Töne leben, kurze bleiben trocken.
      const lfo = ac.createOscillator()
      lfo.frequency.value = 5.5
      const depth = ac.createGain()
      depth.gain.setValueAtTime(0, at)
      depth.gain.linearRampToValueAtTime(7, at + dur * 0.6)
      for (const osc of sources) lfo.connect(depth).connect(osc.detune)
      lfo.start(at)
      lfo.stop(at + dur)
      sources.push(lfo)
    }
    let open = sources.length
    for (const osc of sources) osc.onended = () => {
      osc.disconnect()
      if (--open === 0) gain.disconnect()
    }
  }

  private drum(kind: 'kick' | 'snare' | 'hat', at: number, level = 1) {
    const ac = this.host.ac
    const gain = ac.createGain()
    // Schlagzeug bleibt unter dem Begrenzer: sonst duckt jeder Kick das Gefecht weg.
    const peak = (kind === 'kick' ? 0.34 : kind === 'snare' ? 0.2 : 0.07) * level
    const dur = kind === 'kick' ? 0.22 : kind === 'snare' ? 0.16 : 0.045
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.002)
    gain.gain.exponentialRampToValueAtTime(peak * 1e-3, at + dur)
    gain.gain.setValueAtTime(0, at + dur)
    gain.connect(this.host.out)
    const sources: AudioScheduledSourceNode[] = []
    if (kind === 'kick') {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(130, at)
      osc.frequency.exponentialRampToValueAtTime(42, at + dur)
      osc.connect(gain)
      sources.push(osc)
    } else {
      const noise = ac.createBufferSource()
      noise.buffer = this.host.noise(kind === 'snare' ? 'white' : 'pink')
      noise.loop = true
      const filter = ac.createBiquadFilter()
      filter.type = kind === 'snare' ? 'bandpass' : 'highpass'
      filter.frequency.value = kind === 'snare' ? 1900 : 7000
      filter.Q.value = kind === 'snare' ? 0.8 : 0.7
      noise.connect(filter).connect(gain)
      sources.push(noise)
      if (kind === 'snare') {
        const body = ac.createOscillator()
        body.type = 'triangle'
        body.frequency.setValueAtTime(210, at)
        body.frequency.exponentialRampToValueAtTime(140, at + dur)
        body.connect(gain)
        sources.push(body)
      }
    }
    let open = sources.length
    for (const source of sources) {
      source.start(at)
      source.stop(at + dur)
      source.onended = () => {
        source.disconnect()
        if (--open === 0) gain.disconnect()
      }
    }
  }
}

export { SONG, HOOK, ANSWER, HIGH, TRIADS, ROOTS, BASS_RHYTHM, BASS_DRIVE, DRUM_BEAT, DRUM_FILL, DRUM_HALF }

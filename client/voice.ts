// Real Command · Funkstimme
// =============================================================================
// Angetippte Objekte melden sich, Befehle werden quittiert, Verluste gemeldet.
// Gesprochen wird über die Sprachausgabe des Betriebssystems (Web Speech), die
// nichts herunterlädt und nichts mitliefert. Fehlt eine deutsche Stimme, sagt
// dasselbe Ereignis ein Funkkürzel – gleiche Bedeutung, gleiche Dosierung.
//
// Zwei Regeln tragen alles: es spricht immer nur EINER, und gesprochen wird nur,
// was in client/voice-lines.ts steht. Die Warteschlange des Browsers wird nicht
// benutzt; sie verschluckt beim Abbrechen Rückmeldungen und bleibt dann hängen.

import {
  ACK_EVENTS, EVENT_CODE, FACTION_LINES, FACTION_VOICE, PLAIN_LINES, ROLE_LINES, ROLE_VOICE,
  type VoiceEvent, type VoiceRole,
} from './voice-lines.ts'

export type VoiceMode = 'speech' | 'codes' | 'off'

export interface VoiceHost {
  /** Sprachausgabe des Browsers; fehlt sie, bleiben die Kürzel. */
  speech?: SpeechSynthesis
  /** Erzeugt eine Äußerung – hereingereicht, damit die Prüfung ohne Browser läuft. */
  utterance?: (text: string) => SpeechSynthesisUtterance
  /** Uhr in Sekunden; im Spiel die Uhr des Klangkontexts. */
  now(): number
  /** Spielt einen Klang aus der Rezepttabelle (Squelch, Kürzel). */
  cue(name: string, opts?: { gain?: number, rate?: number, key?: string }): void
  /** Schreibt die Ansage in den Funkkanal der Oberfläche. */
  log?(text: string): void
}

export interface SayOptions {
  role?: VoiceRole
  faction?: string
  /** Objekt, das spricht – begrenzt Wiederholungen derselben Einheit. */
  id?: number
  /** Meldungen dürfen eine laufende Quittung verdrängen. */
  urgent?: boolean
}

/** Dosierung in Sekunden. Ohne sie wird aus Rückmeldung Geplapper. */
const GAP_LINE = 0.6
const GAP_ACK = 0.8
const GAP_OBJECT = 3
const GAP_PLANT = 6
const GAP_UNSOLICITED = 12
/** Auch eine dringende Meldung wiederholt sich nicht im Sekundentakt. */
const GAP_URGENT = 6
/** Sicherheitsnetz: bleibt `end` aus, gibt der Wachhund den Sprechplatz frei. */
const WATCHDOG_EXTRA = 0.5
/** Grobe Sprechdauer: gemessen etwa 0,45 s für zwei Wörter, 1,0 s für vier. */
const SECONDS_PER_WORD = 0.26

/** Zieht ohne Zurücklegen und mischt neu, ohne die letzte Zeile zu wiederholen. */
export class Bag {
  private rest: string[] = []
  private last?: string
  private lines: string[]
  private random: () => number
  constructor(lines: string[], random: () => number = Math.random) { this.lines = lines; this.random = random }
  draw(): string | undefined {
    if (!this.lines.length) return undefined
    if (!this.rest.length) this.rest = this.lines.slice()
    let index = Math.min(Math.floor(this.random() * this.rest.length), this.rest.length - 1)
    // Über die Mischung hinweg darf sich keine Zeile unmittelbar wiederholen –
    // sonst sagt dieselbe Einheit zweimal hintereinander denselben Satz.
    if (this.rest.length > 1 && this.rest[index] === this.last) index = (index + 1) % this.rest.length
    const [line] = this.rest.splice(index, 1)
    this.last = line
    return line
  }
}

export class Voice {
  mode: VoiceMode = 'speech'
  private host: VoiceHost
  private bags = new Map<string, Bag>()
  private lastLine = -Infinity
  private lastAck = -Infinity
  private lastUnsolicited = -Infinity
  private perObject = new Map<number, number>()
  private current?: SpeechSynthesisUtterance
  private speakingUntil = 0
  /** Wortlaut der letzten Ansage – für Prüfung und Funkkanal. */
  last = ''

  constructor(host: VoiceHost) { this.host = host }

  /** Spricht gerade jemand? Auch ohne Rückmeldung des Browsers zuverlässig. */
  get speaking() {
    if (!this.current) return false
    if (this.host.now() >= this.speakingUntil) { this.current = undefined; return false }
    return true
  }

  /**
   * Eine deutsche Stimme des Geräts, ausgewählt über die Sprachkennung – niemals
   * über den Namen: macOS meldet Anna, Windows Katja, Android schlicht „Deutsch“.
   */
  private german(): SpeechSynthesisVoice[] {
    const voices = this.host.speech?.getVoices?.() ?? []
    const german = voices.filter(v => v.lang?.toLowerCase().startsWith('de'))
    const local = german.filter(v => v.localService)
    return local.length ? local : german
  }

  /** Kann gesprochen werden, oder bleibt nur das Kürzel? */
  get canSpeak() {
    return this.mode === 'speech' && !!this.host.speech && !!this.host.utterance && this.german().length > 0
  }

  private bag(key: string, lines: string[]) {
    let bag = this.bags.get(key)
    if (!bag) { bag = new Bag(lines); this.bags.set(key, bag) }
    return bag
  }

  /** Der Wortlaut für einen Anlass: Gattungsliste, zu 40 % die Fraktionsfarbe. */
  line(event: VoiceEvent, role?: VoiceRole, faction?: string): string | undefined {
    const flavour = faction ? FACTION_LINES[faction] : undefined
    if (flavour && ACK_EVENTS.includes(event) && Math.random() < 0.4) return this.bag(`f:${faction}`, flavour).draw()
    const byRole = role ? ROLE_LINES[event]?.[role] : undefined
    if (byRole?.length) return this.bag(`${event}:${role}`, byRole).draw()
    const plain = PLAIN_LINES[event]
    if (plain?.length) return this.bag(event, plain).draw()
    // Kein eigener Satz für diese Gattung: die Infanterie spricht für alle.
    const fallback = ROLE_LINES[event]?.infantry
    return fallback?.length ? this.bag(`${event}:infantry`, fallback).draw() : undefined
  }

  /**
   * Meldet einen Anlass. Liefert `false`, wenn bewusst geschwiegen wird: zu
   * schnell hintereinander, dasselbe Objekt zu oft, oder es spricht schon jemand.
   */
  say(event: VoiceEvent, opts: SayOptions = {}): boolean {
    if (this.mode === 'off') return false
    const now = this.host.now()
    const ack = ACK_EVENTS.includes(event)
    // Dringendes darf sofort dazwischen: eine Meldung, die auf die nächste
    // Sprechpause wartet, kommt zu spät. Für sich selbst hat sie GAP_URGENT.
    if (!opts.urgent && now - this.lastLine < GAP_LINE) return false
    if (ack && now - this.lastAck < GAP_ACK) return false
    // Dringendes darf eine laufende Ansage verdrängen, aber nicht jede Sekunde
    // wiederkehren: sonst redet der Funk eine ganze Angriffswelle durch.
    if (!ack && now - this.lastUnsolicited < (opts.urgent ? GAP_URGENT : GAP_UNSOLICITED)) return false
    if (opts.id !== undefined) {
      const gap = opts.role === 'plant' ? GAP_PLANT : GAP_OBJECT
      if (now - (this.perObject.get(opts.id) ?? -Infinity) < gap) return false
      this.perObject.set(opts.id, now)
      if (this.perObject.size > 400) this.perObject.clear()
    }
    if (this.speaking && !opts.urgent) return false

    this.lastLine = now
    if (ack) this.lastAck = now
    else this.lastUnsolicited = now

    const text = this.canSpeak ? this.line(event, opts.role, opts.faction) : undefined
    // Squelch auf, Ansage, Squelch zu – auch das Kürzel läuft durch denselben Kanal.
    this.host.cue(opts.urgent ? 'radio.deny' : 'radio.open', { key: 'radio' })
    if (!text) {
      this.host.cue(EVENT_CODE[event] ?? 'code.report', { key: 'radio.code' })
      this.last = ''
      return true
    }
    this.speak(text, opts)
    this.last = text
    this.host.log?.(text)
    return true
  }

  private speak(text: string, opts: SayOptions) {
    const speech = this.host.speech!, make = this.host.utterance!
    if (this.current) { this.current = undefined; speech.cancel() }
    const utterance = make(text)
    const voices = this.german()
    const role = opts.role ?? 'infantry'
    // Mehrere Stimmen: eine je Gattung. Nur eine: über Tonhöhe und Tempo trennen.
    const index = ['infantry', 'vehicle', 'air', 'sea', 'plant'].indexOf(role)
    utterance.voice = voices[index % voices.length] ?? voices[0]
    utterance.lang = utterance.voice?.lang ?? 'de-DE'
    const colour = (opts.faction ? FACTION_VOICE[opts.faction] : undefined) ?? ROLE_VOICE[role]
    const shade = voices.length > 1 ? ROLE_VOICE[role] : { pitch: 1, rate: 1 }
    utterance.pitch = Math.max(0.1, Math.min(2, colour.pitch * (voices.length > 1 ? 1 : shade.pitch)))
    utterance.rate = Math.max(0.5, Math.min(2, colour.rate))
    utterance.volume = 1
    const words = text.split(/\s+/).length
    this.speakingUntil = this.host.now() + words * SECONDS_PER_WORD / utterance.rate + WATCHDOG_EXTRA
    const done = () => {
      if (this.current !== utterance) return
      this.current = undefined
      this.host.cue('radio.close', { key: 'radio' })
    }
    utterance.onend = done
    utterance.onerror = done
    this.current = utterance
    speech.speak(utterance)
  }

  /** Bricht die laufende Ansage ab und gibt den Sprechplatz sofort frei. */
  cancel() {
    if (!this.current) return
    this.current = undefined
    this.speakingUntil = 0
    this.host.speech?.cancel()
  }
}

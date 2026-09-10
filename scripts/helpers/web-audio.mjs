// Prüfstand für Web Audio.
// =============================================================================
// Node kennt keine Klangausgabe. Diese Nachbildung protokolliert stattdessen den
// Knotengraphen, die Hüllkurven und die Startzeiten, damit sich die Klangerzeugung
// ohne Browser prüfen lässt. Sie ahmt nur nach, was client/audio.ts benutzt.

class Param {
  constructor(value = 0) {
    this.value = value
    this.events = []
  }
  setValueAtTime(value, time) { this.events.push({ type: 'set', value, time }); this.value = value; return this }
  linearRampToValueAtTime(value, time) { this.events.push({ type: 'linear', value, time }); this.value = value; return this }
  exponentialRampToValueAtTime(value, time) { this.events.push({ type: 'exp', value, time }); this.value = value; return this }
  setTargetAtTime(value, time, constant) { this.events.push({ type: 'target', value, time, constant }); this.value = value; return this }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); return this }
  /** Höchster geplanter Wert – der Spitzenpegel einer Hüllkurve. */
  get peak() { return this.events.reduce((max, e) => e.value > max ? e.value : max, this.value) }
}

class Node {
  constructor(context, kind) {
    this.context = context
    this.kind = kind
    this.outputs = []
    this.connected = false
    this.disconnected = false
    context.nodes.push(this)
  }
  connect(target) {
    this.outputs.push(target)
    this.connected = true
    if (target instanceof Param) return undefined
    return target
  }
  disconnect() { this.disconnected = true; this.outputs.length = 0 }
}

class Source extends Node {
  constructor(context, kind) {
    super(context, kind)
    this.startedAt = null
    this.stoppedAt = null
    this.ended = false
    this.onended = null
  }
  start(when = this.context.currentTime) { this.startedAt = when; return this }
  stop(when = this.context.currentTime) { this.stoppedAt = when; return this }
}

class AudioContextMock {
  constructor() {
    this.currentTime = 0
    this.sampleRate = 48000
    this.state = 'running'
    this.nodes = []
    this.destination = new Node(this, 'destination')
    this.resumes = 0
    this.suspends = 0
    this.closed = false
  }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n }
  createStereoPanner() { const n = new Node(this, 'panner'); n.pan = new Param(0); return n }
  createBiquadFilter() {
    const n = new Node(this, 'filter')
    n.type = 'lowpass'
    n.frequency = new Param(350)
    n.Q = new Param(1)
    return n
  }
  createDynamicsCompressor() {
    const n = new Node(this, 'compressor')
    for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release', 'reduction']) n[name] = new Param(0)
    return n
  }
  createOscillator() {
    const n = new Source(this, 'oscillator')
    n.type = 'sine'
    n.frequency = new Param(440)
    n.detune = new Param(0)
    return n
  }
  createBufferSource() {
    const n = new Source(this, 'buffer')
    n.buffer = null
    n.loop = false
    n.playbackRate = new Param(1)
    return n
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i] }
  }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve() }
  suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve() }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve() }

  // --- Prüfhilfen ---------------------------------------------------------

  /** Uhr vorstellen und beendete Quellen melden, wie es der Browser tut. */
  advance(seconds) {
    this.currentTime += seconds
    for (const node of this.nodes) {
      if (!(node instanceof Source) || node.ended) continue
      if (node.stoppedAt === null || node.stoppedAt > this.currentTime) continue
      node.ended = true
      node.onended?.()
    }
    return this
  }
  /** Alle Quellen, die noch klingen (Dauerklänge haben kein Ende). */
  get playing() { return this.sources.filter(n => !n.ended && n.startedAt !== null) }
  get sources() { return this.nodes.filter(n => n instanceof Source) }
  get loops() { return this.sources.filter(n => n.loop && n.stoppedAt === null) }
  of(kind) { return this.nodes.filter(n => n.kind === kind) }
}

/** Setzt `AudioContext` und `localStorage` als Globale und liefert Zugriff darauf. */
export function installWebAudio() {
  const created = []
  const store = new Map()
  const globals = {
    AudioContext: class extends AudioContextMock {
      constructor() { super(); created.push(this) }
    },
    localStorage: {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => { store.set(key, String(value)) },
      removeItem: (key) => { store.delete(key) },
    },
  }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true })
  return {
    contexts: created,
    store,
    get context() { return created[created.length - 1] },
    restore() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

export { Param, Node, Source, AudioContextMock }

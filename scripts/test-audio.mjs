import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Context, Service } from 'cordis'
import { installWebAudio } from './helpers/web-audio.mjs'
import { Camera } from '../client/camera.ts'
import { Audio, CUES, audioSettings, AUDIO_KEY } from '../client/audio.ts'
import { SONG, SONG_BARS, STEPS_PER_BAR, HOOK, ANSWER, HIGH, noteFrequency } from '../client/music.ts'
import { DEFS } from '../shared/data.ts'

// ---------------------------------------------------------------- Einstellungen

const off = audioSettings('', null)
assert.equal(off.on, false, 'ohne Zutun bleibt es still')
assert.ok(off.master > 0 && off.master <= 1)
assert.equal(audioSettings('?sound=on', null).on, true, 'geteilte Links können den Ton mitbringen')
assert.equal(audioSettings('?sound=off', JSON.stringify({ on: true })).on, false, 'die Adresse schlägt den gespeicherten Stand')
assert.equal(audioSettings('?volume=50', null).master, 0.5)
assert.equal(audioSettings('?volume=999', null).master, 1, 'Lautstärke bleibt im Bereich')
assert.equal(audioSettings('?volume=abc', null).master, off.master, 'unsinnige Angaben ändern nichts')
assert.deepEqual(audioSettings('', '{kaputt'), off, 'ein beschädigter Speicherstand fällt auf die Voreinstellung zurück')
const gespeichert = { on: true, master: 0.4, world: 0.2, ui: 0.1, ambient: 0, musicOn: false, music: 0.3, voice: 'codes', radio: 0.5, machines: 0.8 }
assert.deepEqual(audioSettings('', JSON.stringify(gespeichert)), gespeichert)
// Ein Stand aus der Zeit vor dem Maschinenbus bekommt dessen Voreinstellung.
assert.equal(audioSettings('', JSON.stringify({ on: true, ambient: 0.5, v: 3 })).machines, 0.6,
  'ältere Stände kennen die Maschinen noch nicht und erben den Wert')
assert.equal(audioSettings('?voice=off', null).voice, 'off', 'der Funk lässt sich über die Adresse stummschalten')
assert.equal(audioSettings('', JSON.stringify({ voice: 'unsinn' })).voice, 'speech', 'unbekannte Angaben fallen auf Sprache zurück')

// ---------------------------------------------------------------- Klangtabelle

const cueNames = Object.keys(CUES)
assert.ok(cueNames.length >= 30, 'die Tabelle deckt Waffen, Wirtschaft, Meldungen und Bedienung ab')
for (const [name, recipe] of Object.entries(CUES)) {
  assert.ok(recipe.length > 0, `${name} hat mindestens eine Schicht`)
  for (const layer of recipe) {
    assert.ok(layer.dur > 0 && layer.dur <= 4, `${name}: Dauer im Rahmen`)
    assert.ok(layer.gain > 0 && layer.gain <= 1, `${name}: Pegel im Rahmen`)
    assert.ok(layer.f0 >= 18 && layer.f0 <= 20000, `${name}: hörbare Frequenz`)
    if (layer.f1 !== undefined) assert.ok(layer.f1 >= 18 && layer.f1 <= 20000, `${name}: hörbares Ziel`)
    if (layer.attack !== undefined) assert.ok(layer.attack < layer.dur, `${name}: Anstieg passt in die Hülle`)
    if (layer.times !== undefined) assert.ok(layer.times >= 2 && layer.gap > 0, `${name}: Wiederholungen brauchen einen Abstand`)
    assert.ok(layer.wave === 'noise' || layer.filter === undefined, `${name}: Filter gehören zum Rauschen`)
  }
}
const source = readFileSync(new URL('../client/audio.ts', import.meta.url), 'utf8')
for (const forbidden of [/fetch\(/, /decodeAudioData/, /XMLHttpRequest/, /\.(mp3|ogg|wav|flac|m4a)\b/]) {
  assert.ok(!forbidden.test(source), `Klänge entstehen im Browser, nicht aus Dateien (${forbidden})`)
}

// ---------------------------------------------------------------- Aufbau

const web = installWebAudio()
const ctx = new Context()
const camera = new Camera(ctx)
ctx.set('camera', camera)
const state = { myId: 7, entities: new Map(), me: undefined }
ctx.provide('state', state)
let water = false
ctx.provide('terrain', { isWater: () => water })
camera.resize(1280, 720)
const HOME_X = 20_000_000, HOME_Y = 10_000_000
camera.moveTo(HOME_X, HOME_Y, 2)
const audio = new Audio(ctx)
const dispose = audio[Service.init]()

const shot = (over = {}) => ({ e: 'shot', from: 1, x: HOME_X, y: HOME_Y, tx: HOME_X + 100, ty: HOME_Y, w: 'bullet', ttl: 0.4, ...over })
const fire = (event) => ctx.emit('state/event', event)
const context = () => web.context
/** Quellen mit Ende gehören zu einer Stimme; die Umgebung läuft ohne Stopp weiter. */
const voices = () => context() ? context().sources.filter(s => s.stoppedAt !== null) : []
const since = (before) => audio.playing - before
let sounded = 0
const plays = (label, run) => {
  const before = audio.playing
  run()
  const made = since(before)
  assert.ok(made > 0, `${label} ist zu hören`)
  sounded++
  return made
}

// Stumm: kein Kontext, kein Klang, keine ungefragte Ausgabe.
fire(shot())
audio.cue('ui.click')
assert.equal(web.contexts.length, 0, 'ohne Einschalten wird kein Klangkontext geöffnet')

assert.equal(audio.toggle(), true, 'der Knopf schaltet den Ton ein')
assert.equal(web.contexts.length, 1)
const ac = context()
assert.equal(JSON.parse(web.store.get(AUDIO_KEY)).on, true, 'der Stand überlebt einen Seitenwechsel')

// Signalweg: Busse → Summe → Begrenzer → Ausgang.
const limiter = ac.of('compressor')[0]
assert.ok(limiter, 'ein Begrenzer schützt vor Übersteuerung bei Salven')
assert.ok(limiter.outputs.includes(ac.destination), 'der Begrenzer sitzt zuletzt im Weg')
const master = ac.of('gain').find(g => g.outputs.includes(limiter))
assert.ok(master, 'alles läuft über eine Summe')
assert.equal(master.gain.value, audio.settings.master)
const busGains = ac.of('gain').filter(g => g.outputs.includes(master))
assert.equal(busGains.length, 6, 'Welt, Bedienung, Umgebung, Musik, Funk und Maschinen sind getrennt regelbar')
assert.equal(ac.loops.length, 3, 'Wind, Brandung und Blätter laufen als Dauerklang')

// ---------------------------------------------------------------- Ereignisse

const WARHEADS = ['bullet', 'cannon', 'shell', 'rocket', 'missile', 'flak', 'bomb', 'torpedo', 'melee', 'arrow', 'nuke']
for (const w of WARHEADS) {
  ac.advance(3)
  plays(`Schuss mit ${w}`, () => fire(shot({ w })))
}
ac.advance(5)
plays('Treffer', () => fire({ e: 'hit', x: HOME_X, y: HOME_Y, w: 'bullet', r: 0 }))
ac.advance(5)
plays('Sprengtreffer', () => fire({ e: 'hit', x: HOME_X, y: HOME_Y, w: 'shell', r: 80 }))
water = true
ac.advance(5)
const splash = audio.playing
fire({ e: 'hit', x: HOME_X, y: HOME_Y, w: 'shell', r: 0 })
assert.ok(since(splash) > 0, 'Einschläge im Wasser klingen nass')
water = false
for (const [kind, type] of [['b', 'power'], ['u', 'mbt'], ['p', 'rifleman'], ['a', 'rifleman']]) {
  ac.advance(5)
  plays(`Verlust (${kind})`, () => fire({ e: 'die', id: 3, x: HOME_X, y: HOME_Y, ty: type, k: kind }))
}
ac.advance(5)
plays('Baustelle gesetzt', () => fire({ e: 'placed', id: 4, x: HOME_X, y: HOME_Y, ty: 'power' }))
// Ein Landungsflugzeug setzt nicht auf wie eine Baustelle: eigener, langer Klang.
ac.advance(5)
const vorLandung = voices().length
fire({ e: 'placed', id: 41, x: HOME_X, y: HOME_Y, ty: 'dropship' })
const landung = voices().slice(vorLandung)
assert.ok(landung.length >= 5, 'die Landung hat mehrere Schichten')
assert.ok(landung.some(q => q.stoppedAt - q.startedAt > 3), 'sie schwillt über Sekunden an, statt zu klicken')
state.entities.set(9, { id: 9, x: HOME_X, y: HOME_Y })
ac.advance(5)
plays('Übernahme', () => fire({ e: 'capture', id: 9, by: 2 }))
ac.advance(5)
plays('Bau fertig', () => fire({ e: 'site_done', id: 9, ty: 'hut' }))
for (const rs of ['wood', 'stone', 'iron_ore', 'berry']) {
  ac.advance(5)
  plays(`Sammeln (${rs})`, () => fire({ e: 'gather', id: 5, x: HOME_X, y: HOME_Y, rs }))
}
ac.advance(5)
plays('Avatar gefallen', () => fire({ e: 'avatar_died', id: 1, x: HOME_X, y: HOME_Y }))
ac.advance(5)
plays('Kenntnis gewonnen', () => fire({ e: 'knowledge', tag: 'firearms' }))
ac.advance(5)
plays('Zuwanderung', () => fire({ e: 'arrive', id: 6 }))
ac.advance(5)
plays('Meldung', () => ctx.emit('state/notice', 'Test', 'info'))
ac.advance(5)
plays('Fehlermeldung', () => ctx.emit('state/notice', 'Test', 'error'))
ac.advance(5)
plays('Auswahl', () => ctx.emit('state/selection'))
// Angetippte Objekte starten hörbar – je nach Gattung anders.
for (const [type, label] of [['rifleman', 'Infanterie'], ['mbt', 'Fahrzeug'], ['jet', 'Flugzeug'], ['destroyer', 'Schiff'], ['power', 'Anlage']]) {
  ac.advance(5)
  state.selectedEntities = () => [{ id: 1, x: HOME_X, y: HOME_Y, def: DEFS[type] }]
  plays(`Antippen (${label})`, () => ctx.emit('state/selection'))
}
// Auch weit draußen bleibt die Rückmeldung auf den eigenen Klick hörbar.
camera.moveTo(HOME_X, HOME_Y, 400)
ac.advance(5)
plays('Antippen bei weiter Sicht', () => ctx.emit('state/selection'))
camera.moveTo(HOME_X, HOME_Y, 2)
state.selectedEntities = () => []
ac.advance(6)
plays('Ankunft in der Welt', () => ctx.emit('state/phase', 'play'))
ac.advance(5)
plays('Bedienung', () => audio.cue('ui.click'))
assert.ok(sounded >= 30, 'jedes Ereignis des Protokolls hat einen eigenen Klang')

// Eigene Verluste schlagen Alarm, fremde nicht.
ac.advance(30)
const own = audio.playing
fire({ e: 'die', owner: 7, id: 11, x: HOME_X, y: HOME_Y, ty: 'power', k: 'b' })
// Einsturz, Alarm und die Funkmeldung (Squelch + Kürzel, weil ohne Browser keine Stimme).
assert.equal(since(own), 4, 'der eigene Verlust bringt Einsturz, Alarm und Funkmeldung')
assert.ok([...audio.lastAt.keys()].includes('radio'), 'die Meldung läuft über den Funkkanal')
ac.advance(1)
const again = audio.playing
fire({ e: 'die', owner: 7, id: 12, x: HOME_X, y: HOME_Y, ty: 'power', k: 'b' })
assert.equal(since(again), 1, 'Alarm und Funkmeldung wiederholen sich nicht bei jedem Treffer')
ac.advance(30)
const foreign = audio.playing
fire({ e: 'die', owner: 3, id: 13, x: HOME_X, y: HOME_Y, ty: 'power', k: 'b' })
assert.equal(since(foreign), 1, 'fremde Verluste lösen keinen Alarm aus')

// Fertige Bauaufträge melden sich einmal.
ac.advance(5)
state.me = { prod: { structure: { ready: ['power'], queue: [] } } }
const ready = audio.playing
ctx.emit('state/me', state.me)
assert.ok(since(ready) > 0, 'ein fertiges Gebäude meldet sich')
ac.advance(5)
const twice = audio.playing
ctx.emit('state/me', state.me)
assert.equal(since(twice), 0, 'derselbe Stand meldet sich nicht erneut')

// ---------------------------------------------------------------- Ortung

/**
 * Der Signalweg einer Stimme, von der Quelle bis zum Ausgang. Er lässt sich nur
 * vor dem Ende ablesen: danach hängt die Stimme nicht mehr im Graphen.
 */
const chain = (voice) => {
  const path = []
  const seen = new Set()
  let node = voice
  while (node && !seen.has(node)) { seen.add(node); path.push(node); node = node.outputs.find(o => o.kind) }
  return path
}
const newest = () => voices().at(-1)
const first = (voice, kind) => chain(voice).find(n => n.kind === kind)
const panOf = (voice) => first(voice, 'panner')?.pan.value ?? 0
/** Die Stimmenlautstärke steht fest im Regler; Hüllkurven haben geplante Werte. */
const levelOf = (voice) => chain(voice).find(n => n.kind === 'gain' && !n.gain.events.length)?.gain.value ?? 1

const span = camera.width * camera.mpp
ac.advance(5)
fire(shot({ x: HOME_X - span * 0.4, y: HOME_Y, w: 'shell' }))
const leftPan = panOf(newest())
ac.advance(5)
fire(shot({ x: HOME_X + span * 0.4, y: HOME_Y, w: 'shell' }))
const rightPan = panOf(newest())
assert.ok(leftPan < -0.1, 'links im Bild klingt links')
assert.ok(rightPan > 0.1, 'rechts im Bild klingt rechts')

ac.advance(5)
fire(shot({ x: HOME_X, y: HOME_Y, w: 'shell' }))
const near = levelOf(newest())
ac.advance(5)
fire(shot({ x: HOME_X + span * 1.2, y: HOME_Y, w: 'shell' }))
const far = newest()
assert.ok(levelOf(far) < near * 0.6, 'Entfernung dämpft')
assert.ok(far.startedAt > ac.currentTime, 'ferner Donner kommt später an')
const muffle = first(far, 'filter')
assert.ok(muffle && muffle.type === 'lowpass' && muffle.frequency.value < 20000, 'die Luft schluckt die Höhen')

ac.advance(5)
const outside = audio.playing
fire(shot({ x: HOME_X + span * 6, y: HOME_Y, w: 'shell' }))
assert.equal(since(outside), 0, 'jenseits des Ausschnitts bleibt es still')

camera.moveTo(HOME_X, HOME_Y, 200)
ac.advance(5)
const strategic = audio.playing
fire(shot({ x: HOME_X, y: HOME_Y, w: 'shell' }))
assert.equal(since(strategic), 0, 'aus strategischer Höhe hört man das Gefecht nicht')
plays('Bedienung bleibt hörbar', () => audio.cue('ui.notice'))
camera.moveTo(HOME_X, HOME_Y, 2)

// ---------------------------------------------------------------- Haushalt

ac.advance(10)
const before = audio.playing
for (let i = 0; i < 200; i++) fire({ e: 'hit', x: HOME_X + i, y: HOME_Y, w: 'shell', r: 40 })
const burst = since(before)
assert.ok(burst > 0 && burst <= 24, `eine Salve bleibt im Stimmenbudget (${burst})`)

ac.advance(10)
plays('erster Schuss', () => fire(shot({ w: 'shell' })))
ac.advance(0.02)
const throttled = audio.playing
fire(shot({ w: 'shell' }))
assert.equal(since(throttled), 0, 'derselbe Klang wiederholt sich nicht im Millisekundentakt')
ac.advance(0.5)
plays('nach der Sperre feuert es wieder', () => fire(shot({ w: 'shell' })))

ac.advance(6)
assert.ok(voices().every(v => v.ended), 'jede Stimme endet von selbst')
assert.ok(voices().every(v => v.disconnected), 'beendete Stimmen hängen nicht mehr im Graphen')
assert.equal(audio.playing, 0, 'danach ist das Budget wieder frei')
plays('nach der Salve ist wieder Platz', () => fire({ e: 'hit', x: HOME_X, y: HOME_Y, w: 'shell', r: 40 }))

// ---------------------------------------------------------------- Umgebung

/** Der Pegel eines Bettes ist die letzte Verstärkung vor dem Bus. */
const bedOf = (index) => {
  let node = ac.loops[index], level = null
  const seen = new Set()
  while (node && !seen.has(node)) {
    seen.add(node)
    const next = node.outputs.find(o => o.kind)
    if (node.kind === 'gain' && busGains.includes(next)) { level = node; break }
    node = next
  }
  assert.ok(level, 'jedes Umgebungsbett hängt am Umgebungsbus')
  return level
}
const [wind, surf, leaves] = [0, 1, 2].map(bedOf)
// Ohne Szene ist wirklich Ruhe: die Schwelle liegt vor dem Pegel, nicht auf ihm.
assert.equal(wind.gain.value, 0, 'ein Bett ohne Pegel bleibt stumm, auch wenn die Wellen schwingen')
water = true
ctx.emit('render/frame', 1)
assert.ok(surf.gain.value > 0, 'über Wasser rauscht die Brandung')
water = false
ctx.emit('render/frame', 1)
assert.ok(wind.gain.value > 0, 'an Land geht Wind')
assert.ok(surf.gain.events.at(-1).value === 0, 'im Binnenland verstummt die Brandung')
assert.ok(leaves.gain.events.length > 0, 'Blätter folgen der Bewaldung')
// Die Brandung bricht in Wellen: schneller Anstieg, langsames Auslaufen.
water = true
ctx.emit('render/frame', 1)
const swell = ac.loops[1].outputs[0].outputs[0]
const shape = swell.gain.events.slice(-3)
assert.equal(shape.length, 3, 'jede Welle wird als eigener Verlauf geplant')
const anstieg = shape[1].time - shape[0].time, auslauf = shape[2].time - shape[1].time
assert.ok(shape[1].value === 1 && anstieg <= 1.2, `sie bricht schnell (${anstieg.toFixed(2)} s)`)
assert.ok(auslauf > anstieg * 2, `und läuft deutlich langsamer aus (${auslauf.toFixed(2)} s)`)
const filterOf = ac.loops[1].outputs[0]
assert.equal(filterOf.frequency.events.length, 0, 'die Klangfarbe wandert nicht – wandernde Filter klingen nach Geisterhaus')
water = false
ctx.emit('render/frame', 1)
camera.moveTo(HOME_X, HOME_Y, 200)
ctx.emit('render/frame', 1)
assert.equal(wind.gain.value, 0, 'aus der Höhe verstummt auch die Umgebung')
camera.moveTo(HOME_X, HOME_Y, 2)

// ---------------------------------------------------------------- Maschinen

// Was im Bild ist, hört man: Fahrzeuge brummen, Flugzeuge pfeifen, Anlagen summen.
/** Der Pegel eines Maschinenbetts, so wie ihn die Szenenanalyse setzt. */
const level = (bed) => bed.gain.gain.value
const [traffic, air, plant] = ['traffic', 'air', 'plant'].map(name => audio.beds[name])
assert.ok(traffic && air && plant, 'Verkehr, Luft und Anlagen haben eigene Dauerklänge')
// Sie hängen am Maschinenbus, nicht an der Umgebung: die steht ab Werk auf 5 %.
const maschinenBus = busGains.find(g => g.gain.value === audio.settings.machines)
assert.ok(maschinenBus, 'es gibt einen eigenen Maschinenbus')
for (const bett of [traffic, air, plant]) {
  assert.ok(bett.gain.outputs.includes(maschinenBus), 'jedes Maschinenbett läuft über ihn')
}
assert.equal(level(traffic), 0, 'ohne Einheiten im Bild bleiben die Maschinen stumm')

const unit = (id, type, over = {}) => ({ id, type, x: HOME_X, y: HOME_Y, kind: 'u', speed: 30, def: DEFS[type], ...over })
for (let i = 0; i < 8; i++) state.entities.set(200 + i, unit(200 + i, 'mbt'))
for (let i = 0; i < 4; i++) state.entities.set(300 + i, unit(300 + i, 'jet'))
for (let i = 0; i < 10; i++) state.entities.set(400 + i, { id: 400 + i, type: 'power', x: HOME_X, y: HOME_Y, kind: 'b', speed: 0, def: DEFS['power'] })
ctx.emit('render/frame', 1)
assert.ok(level(traffic) > 0, 'fahrende Panzer brummen')
assert.ok(level(air) > 0, 'Flugzeuge pfeifen')
assert.ok(level(plant) > 0, 'Anlagen summen')
assert.ok(level(traffic) > level(air), 'die Luft bleibt dezenter als der Boden')

for (const e of state.entities.values()) if (e.kind === 'u') e.speed = 0
ctx.emit('render/frame', 1)
assert.equal(level(traffic), 0, 'stehende Fahrzeuge brummen nicht')
camera.moveTo(HOME_X, HOME_Y, 200)
ctx.emit('render/frame', 1)
assert.equal(level(plant), 0, 'aus der Höhe verstummen auch die Maschinen')
camera.moveTo(HOME_X, HOME_Y, 2)

// Eine laufende Produktion klingt nach Baustelle – am eigenen Ort, nicht überall.
state.homePosition = () => ({ x: HOME_X, y: HOME_Y })
state.me = { prod: { structure: { type: 'power', ready: [], queue: [] } }, powerProd: 100, powerCons: 10 }
ac.advance(5)
plays('Baustelle', () => ctx.emit('render/frame', 1))
state.me = { prod: {}, powerProd: 100, powerCons: 10 }
ac.advance(5)
const idle = audio.playing
ctx.emit('render/frame', 1)
assert.equal(since(idle), 0, 'ohne Bauauftrag ist die Baustelle still')
state.entities.clear()

// Stromnot meldet sich, sobald der Verbrauch die Erzeugung übersteigt.
ac.advance(30)
plays('Stromnot', () => { state.me = { prod: {}, powerProd: 40, powerCons: 90 }; ctx.emit('state/me', state.me) })
ac.advance(1)
const again2 = audio.playing
ctx.emit('state/me', state.me)
assert.equal(since(again2), 0, 'sie wiederholt sich nicht im Sekundentakt')

// ---------------------------------------------------------------- Regler

audio.setVolume('master', 0.3)
assert.equal(master.gain.events.at(-1).value, 0.3, 'der Regler wirkt sofort')
assert.equal(JSON.parse(web.store.get(AUDIO_KEY)).master, 0.3, 'und bleibt gespeichert')
audio.setVolume('ambient', 0)
assert.equal(audio.settings.ambient, 0)

// ---------------------------------------------------------------- Musik

assert.equal(SONG_BARS, SONG.reduce((sum, part) => sum + part.bars, 0))
assert.ok(SONG_BARS >= 24, 'das Stück ist lang genug, um nicht sofort zu wiederholen')
for (const rows of [HOOK, ANSWER, HIGH]) for (const row of rows) {
  assert.equal(row.length, STEPS_PER_BAR, 'jeder Takt hat 16 Schritte')
  for (const token of row) {
    if (token === '.') continue
    const hz = noteFrequency(token)
    assert.ok(hz > 60 && hz < 2200, `${token} liegt im Melodiebereich (${hz.toFixed(1)} Hz)`)
  }
}
assert.equal(noteFrequency('A4'), 440)
assert.ok(Math.abs(noteFrequency('E2') - 82.41) < 0.02, 'die Bassoktave stimmt')
assert.equal(noteFrequency('H4'), 0, 'unbekannte Zeichen werden nicht gespielt')

const song = audio.song
assert.ok(song, 'die Musik hängt am eigenen Bus')
const musicBus = ac.of('gain').find(g => g.gain.value === audio.settings.music && g.outputs.includes(master))
assert.ok(musicBus, 'Musik läuft nicht über den Effektbus')
assert.ok(song.playing, 'sie beginnt mit dem eingeschalteten Ton')

// Der Zeitgeber schreibt immer nur den nächsten Vorlauf; über zwanzig Sekunden
// kommen Vorspann, Hook und Antwort vorbei.
const beforeBar = ac.sources.length
for (let i = 0; i < 45; i++) {
  const mark = ac.sources.length
  ac.advance(0.5)
  song.schedule()
  assert.ok(ac.sources.slice(mark).every(s => s.startedAt >= ac.currentTime), 'jeder Ton wird im Voraus gelegt, nie in die Vergangenheit')
}
const scheduled = ac.sources.slice(beforeBar)
assert.ok(scheduled.length > 100, `zwanzig Sekunden bringen viele Stimmen (${scheduled.length})`)
const pitches = scheduled.filter(s => s.kind === 'oscillator').map(s => s.frequency.value)
assert.ok(pitches.some(f => f > 40 && f < 120), 'der Bass liegt unten')
assert.ok(pitches.some(f => f > 300), 'die Melodie liegt darüber')
assert.ok(new Set(pitches.filter(f => f > 300).map(f => f.toFixed(1))).size >= 5, 'sie besteht aus mehreren Tönen, nicht aus einem Signal')
assert.ok(scheduled.some(s => s.kind === 'buffer' && s.stoppedAt - s.startedAt < 0.2), 'das Schlagzeug kommt aus Rauschen')

// Nach einer Pause im Hintergrund wird nichts nachgeholt.
ac.advance(120)
const resumed = ac.sources.length
song.schedule()
const caughtUp = ac.sources.length - resumed
assert.ok(caughtUp > 0 && caughtUp < 60, `nach langer Pause setzt die Musik neu an statt alles nachzuholen (${caughtUp})`)

assert.equal(audio.toggleMusic(false), false, 'Musik lässt sich einzeln abschalten')
assert.equal(song.playing, false)
const quiet = ac.sources.length
ac.advance(2)
song.schedule()
assert.equal(ac.sources.length, quiet, 'danach wird nichts mehr geplant')
plays('Effekte spielen ohne Musik weiter', () => fire({ e: 'hit', x: HOME_X, y: HOME_Y, w: 'shell', r: 40 }))
assert.equal(audio.toggleMusic(true), true)
assert.ok(song.playing, 'und sie kommt auf denselben Weg zurück')
assert.equal(JSON.parse(web.store.get(AUDIO_KEY)).musicOn, true, 'der Musikschalter wird gespeichert')
assert.equal(audioSettings('?music=off', null).musicOn, false, 'die Adresse kann sie stumm halten')

audio.setVolume('music', 0.2)
assert.equal(musicBus.gain.events.at(-1).value, 0.2, 'der Musikregler betrifft nur die Musik')

assert.equal(audio.toggle(), false, 'derselbe Knopf schaltet wieder aus')
assert.equal(ac.suspends, 1, 'der Klangkontext ruht danach')
const silent = audio.playing
fire(shot({ w: 'shell' }))
assert.equal(since(silent), 0, 'ausgeschaltet bleibt ausgeschaltet')

dispose()
assert.ok(ac.closed, 'beim Abräumen wird der Klangkontext geschlossen')
web.restore()
console.log(`Ton bestanden: ${cueNames.length} synthetische Klänge, Titelmusik über ${SONG_BARS} Takte, Ortung mit Panorama, Entfernung, Laufzeit und Luftdämpfung, Stimmenbudget, Drosselung, Umgebungsbett, Regler und Speicherstand.`)

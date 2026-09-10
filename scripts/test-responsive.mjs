import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { headerNavigation, urlPanelNavigation } from '../client/ui/header-navigation.ts'
import { responsiveView, syncResponsiveView } from '../client/responsive.ts'
import { bindTouchMap } from '../client/touch-map.ts'

// Navigation behält den tatsächlichen Spielzustand und bestehende History-Daten.
const browser = Object.assign(new EventTarget(), {
  location: { href: 'http://localhost:8091/?worldTab=bank&tab=structure&view=perspective&quality=low#karte' },
  history: { state: { session: 'existing' }, replaceState(state, _title, url) {
    assert.deepEqual(state, { session: 'existing' })
    browser.location.href = String(url)
  } },
})
let header, mobile
const navigation = headerNavigation(browser, value => { header = value })
const dock = urlPanelNavigation(browser, 'mobilePanel', ['map', 'build', 'units', 'radar', 'chat'], 'map', value => { mobile = value })
assert.equal(navigation.current(), 'closed')
navigation.set('graphics')
dock.set('build')
assert.equal(navigation.current(), 'graphics')
assert.equal(dock.current(), 'build')
assert.equal(syncResponsiveView(browser, true), 'tactical')
const url = new URL(browser.location.href)
assert.equal(url.searchParams.get('view'), 'tactical')
for (const [key, value] of Object.entries({ worldTab: 'bank', tab: 'structure', quality: 'low', header: 'graphics', mobilePanel: 'build' })) assert.equal(url.searchParams.get(key), value)
assert.equal(url.hash, '#karte')
navigation.set('closed')
assert.equal(new URL(browser.location.href).searchParams.has('header'), false)
assert.equal(dock.current(), 'build')
browser.location.href = 'http://localhost:8091/?header=menu&mobilePanel=chat'
browser.dispatchEvent(new Event('popstate'))
assert.equal(header, 'menu')
assert.equal(mobile, 'chat')
browser.location.href = 'http://localhost:8091/?mobilePanel=units'
browser.dispatchEvent(new Event('popstate'))
assert.equal(mobile, 'units')
browser.location.href = 'http://localhost:8091/?header=invalid&mobilePanel=invalid'
browser.dispatchEvent(new Event('popstate'))
assert.equal(header, 'closed')
assert.equal(mobile, 'map')
navigation.dispose(); dock.dispose()
browser.location.href = 'http://localhost:8091/?header=graphics&mobilePanel=radar'
browser.dispatchEvent(new Event('popstate'))
assert.equal(header, 'closed', 'Entsorgte Navigation reagiert nicht mehr')
assert.equal(mobile, 'map')
for (const search of ['', '?view=perspective', '?view=tactical', '?view=unknown']) assert.equal(responsiveView(search, true), 'tactical')
assert.equal(responsiveView('?view=perspective', false), 'perspective')
assert.equal(responsiveView('?view=tactical', false), 'tactical')

// Echte Pointer-Handler: Tippen darf weder Ziehen noch Pinch als Spielbefehl werten.
const captured = new Set()
const canvas = Object.assign(new EventTarget(), {
  setPointerCapture: id => captured.add(id),
  hasPointerCapture: id => captured.has(id),
  releasePointerCapture: id => captured.delete(id),
})
const taps = [], pans = [], zooms = []
const dispose = bindTouchMap(canvas, {
  tap: (...args) => taps.push(args), pan: (...args) => pans.push(args), zoom: (...args) => zooms.push(args),
})
const pointer = (type, pointerId, x, y, pointerType = 'touch') => {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, { pointerId, clientX: x, clientY: y, pointerType })
  canvas.dispatchEvent(event)
  return event
}
assert.equal(pointer('pointerdown', 1, 100, 100).defaultPrevented, true)
pointer('pointerup', 1, 100, 100)
assert.deepEqual(taps, [[100, 100]])
pointer('pointerdown', 1, 100, 100)
pointer('pointermove', 1, 140, 120)
pointer('pointerup', 1, 140, 120)
assert.deepEqual(pans, [[-40, -20]])
assert.equal(taps.length, 1)
pointer('pointerdown', 1, 100, 100)
pointer('pointerdown', 2, 200, 100)
pointer('pointermove', 2, 250, 100)
assert.deepEqual(zooms, [[2 / 3, 175, 100]])
pointer('pointerup', 2, 250, 100)
pointer('pointerup', 1, 100, 100)
assert.equal(taps.length, 1, 'Pinch-Ende löst keine Auswahl oder Platzierung aus')
pointer('pointerdown', 1, 100, 100)
pointer('pointercancel', 1, 100, 100)
assert.equal(taps.length, 1, 'Abgebrochene Geste löst keinen Tap aus')
pointer('pointerdown', 1, 100, 100)
pointer('lostpointercapture', 1, 100, 100)
assert.equal(taps.length, 1, 'Verlorener Pointer-Capture löst keinen Tap aus')
pointer('pointerdown', 1, 100, 100)
pointer('pointerup', 1, 180, 100)
assert.equal(taps.length, 1, 'Fehlende Move-Ereignisse machen eine Wischgeste nicht zum Tap')
assert.equal(captured.size, 0)
assert.equal(pointer('pointerdown', 1, 100, 100, 'mouse').defaultPrevented, false)
pointer('pointerup', 1, 100, 100, 'mouse')
assert.equal(taps.length, 1, 'Maus bleibt beim bestehenden Eingabesystem')
dispose()
pointer('pointerdown', 1, 100, 100)
pointer('pointerup', 1, 100, 100)
assert.equal(taps.length, 1)
console.log('Responsive UI: URL-Zustände, History, taktische Draufsicht, Touch-Pan, Pinch, Tap und Cleanup erfolgreich.')

// --- Stilblatt ---------------------------------------------------------------
// Eine Sammelersetzung hat die Regel, die die Warteschlange im mobilen Bauen-Blatt
// einblendet, schon einmal zerstört: der Selektor endete plötzlich auf „>“ und die
// Stile standen dreimal in der Datei. Das prüft die Datei auf genau solche Schäden.

const css = readFileSync(new URL('../public/hud.css', import.meta.url), 'utf8')
let tiefe = 0, zeile = 1, ausbruch = 0
for (const zeichen of css) {
  if (zeichen === '\n') zeile++
  if (zeichen === '{') tiefe++
  if (zeichen === '}') { tiefe--; if (tiefe < 0 && !ausbruch) ausbruch = zeile }
}
assert.equal(tiefe, 0, 'Klammern in hud.css sind ausgeglichen')
assert.equal(ausbruch, 0, `keine schließende Klammer zu viel (Zeile ${ausbruch})`)

for (const [nummer, text] of css.split('\n').entries()) {
  const selektor = text.split('{')[0]
  if (!text.includes('{') || selektor.trim().startsWith('@') || selektor.trim().startsWith('/*')) continue
  assert.ok(!/[>+~,]\s*$/.test(selektor.replace(/\/\*.*?\*\//g, '')),
    `Zeile ${nummer + 1}: Selektor endet auf einem Kombinator, da fehlt ein Ziel: ${text.trim().slice(0, 90)}`)
}

const einmal = (selektor) => {
  const treffer = css.split('\n').filter(z => z.trimStart().startsWith(selektor + ' {') || z.trimStart().startsWith(selektor + '{'))
  assert.equal(treffer.length, 1, `${selektor} steht ${treffer.length}× in hud.css statt genau einmal`)
}
// Nur die Stile, die es genau einmal geben darf: Layoutregeln wie .hud-side oder
// .hud-radar werden in Media Queries absichtlich überschrieben.
for (const selektor of ['.hud-qcat', '.hud-qnow', '.hud-qtime', '.hud-qblock', '.hud-qready']) einmal(selektor)

// Die Warteschlange muss in jeder Ansicht erreichbar bleiben.
assert.ok(css.includes('.hud[data-mobile-panel="build"] .hud-side > .hud-queue { display: flex; }'),
  'das mobile Bauen-Blatt blendet die Warteschlange wieder ein')
assert.ok(/\.hud-radar \{[^}]*flex: 0 1 auto/s.test(css),
  'der Radarkasten gibt bei niedrigen Fenstern Höhe ab, statt die Warteschlange hinauszuschieben')
assert.ok(/\.rc-toasts \{[^}]*bottom: auto/s.test(css),
  'Meldungen liegen nicht mehr auf der Warteschlangenzeile')

console.log('Stilblatt bestanden: Klammern, vollständige Selektoren, keine doppelten Regeln, Warteschlange in jeder Ansicht erreichbar.')

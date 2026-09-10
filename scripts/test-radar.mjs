import assert from 'node:assert/strict'
import { radarBounds, radarWorldPoint, paintRadarCoverage, paintRadarOverlay, RADAR_COLORS } from '../client/ui/radar.ts'
import { urlPanelNavigation } from '../client/ui/header-navigation.ts'
import { WORLD_W, WORLD_H } from '../shared/constants.ts'
import { radarNavigation, bindRadarControls, RADAR_MIN_WIDTH } from '../client/ui/radar-navigation.ts'

for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 720], [2560, 1440]]) {
  for (const mpp of [.01, .5, 2, 50, 20000]) {
    for (const [x, y] of [[WORLD_W / 2, WORLD_H / 2], [0, 0], [WORLD_W, WORLD_H]]) {
      const rect = radarBounds({ x, y, width, height, mpp }, false)
      assert.equal(rect.w / rect.h, 2, 'Unverzerrtes Seitenverhältnis')
      assert.ok(rect.x0 >= 0 && rect.y0 >= 0 && rect.x0 + rect.w <= WORLD_W && rect.y0 + rect.h <= WORLD_H)
      assert.ok(x >= rect.x0 && x <= rect.x0 + rect.w && y >= rect.y0 && y <= rect.y0 + rect.h)
      assert.deepEqual(radarWorldPoint(rect, -1, -1), [rect.x0, rect.y0])
      assert.deepEqual(radarWorldPoint(rect, 2, 2), [rect.x0 + rect.w, rect.y0 + rect.h])
    }
  }
}
const near = radarBounds({ x: WORLD_W / 2, y: WORLD_H / 2, width: 390, height: 844, mpp: .01 }, false)
assert.equal(near.w, 1000, 'Nahansicht verschwindet nicht in einem festen 12-km-Ausschnitt')
const portrait = radarBounds({ x: WORLD_W / 2, y: WORLD_H / 2, width: 390, height: 844, mpp: 1 }, false)
assert.ok(portrait.h >= 844 * 3, 'Hochformat-Kamera bleibt vollständig im Radar')
assert.deepEqual(radarBounds({ x: 0, y: 0, width: 320, height: 568, mpp: .01 }, true), { x0: 0, y0: 0, w: WORLD_W, h: WORLD_H })

const rect = { x0: 0, y0: 0, w: 1000, h: 500 }
const fills = [], strokes = [], ellipses = []
const g = {
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, arc() {}, fillText() {},
  ellipse: (...args) => ellipses.push(args),
  fill() { fills.push({ mode: this.globalCompositeOperation, color: this.fillStyle }) },
  fillRect() { fills.push({ mode: this.globalCompositeOperation, color: this.fillStyle }) },
  stroke() { strokes.push(this.strokeStyle) }, strokeRect() { strokes.push(this.strokeStyle) },
}
const station = { x: 500, y: 250, r: 3000 }
paintRadarCoverage(g, Array.from({ length: 200 }, () => station), rect, 400, 200)
assert.equal(fills.length, 1, '200 überlappende Sensoren werden genau einmal eingefärbt')
assert.equal(fills[0].mode, 'source-over', 'Keine additive Aufhellung')
assert.equal(fills[0].color, 'rgba(80,180,190,0.07)')
assert.equal(ellipses.length, 200)
assert.equal(ellipses[0][2], ellipses[0][3], 'Reichweite ist bei unverzerrtem Radar kreisförmig')

fills.length = 0; strokes.length = 0
const base = { id: 1, kind: 'b', owner: 1, x: 500, y: 250, visible: true, ghost: false }
paintRadarOverlay(g, {
  rect, width: 400, height: 200, world: false, viewport: { x0: 400, y0: 200, x1: 600, y1: 300 },
  myId: 1, selected: new Set([1]), bases: [], contacts: [{ x: 800, y: 200, c: 'g' }],
  entities: [base, { ...base, id: 2, owner: 2, x: 600 }, { ...base, id: 3, owner: 3, x: 700, ghost: true, visible: false }],
})
assert.ok(fills.some(f => f.color === RADAR_COLORS.own))
assert.ok(fills.some(f => f.color === RADAR_COLORS.foreign))
assert.ok(strokes.includes(RADAR_COLORS.stale), 'Veraltete Gebäude sind hohl und grau')
assert.ok(strokes.includes(RADAR_COLORS.contact), 'Unbekannte Kontakte bleiben hohle Rauten')
assert.ok(strokes.includes('#f2f6f8'), 'Kameraausschnitt hat eine kontrastreiche Kontur')
fills.length = 0
paintRadarOverlay(g, { rect, width: 400, height: 200, world: false, viewport: { x0: 0, y0: 0, x1: 100, y1: 100 }, myId: 1, selected: new Set(), bases: [], contacts: [], entities: [{ ...base, owner: 2, visible: false }] })
assert.equal(fills.some(f => f.color === RADAR_COLORS.foreign), false, 'Nicht aufgeklärte Objekte werden nicht gezeichnet')

const browser = Object.assign(new EventTarget(), {
  location: { href: 'http://localhost:8091/?view=tactical&mobilePanel=radar&radar=world' },
  history: { state: null, replaceState(_state, _title, url) { browser.location.href = String(url) } },
})
let mode
const navigation = urlPanelNavigation(browser, 'radar', ['local', 'world'], 'local', value => { mode = value })
assert.equal(navigation.current(), 'world', 'Weltmodus ist direkt verlinkbar')
navigation.set('local')
assert.equal(mode, 'local')
assert.equal(new URL(browser.location.href).searchParams.get('mobilePanel'), 'radar')
assert.equal(new URL(browser.location.href).searchParams.get('view'), 'tactical')
navigation.dispose()

let changes = 0
const world = { x0: 0, y0: 0, w: WORLD_W, h: WORLD_H }
const nav = radarNavigation(browser, () => world, () => changes++)
const anchor = radarWorldPoint(nav.rect(), .25, .75)
nav.zoom(.5, .25, .75)
radarWorldPoint(nav.rect(), .25, .75).forEach((v, i) => assert.ok(Math.abs(v - anchor[i]) < 1e-8, 'Zoom erhält den Punkt unter dem Cursor'))
assert.equal(nav.rect().w, WORLD_W / 2)
nav.pan(.1, -.1)
const saved = { ...nav.rect() }
const restored = radarNavigation(browser, () => world, () => {})
for (const key of ['x0', 'y0', 'w', 'h']) assert.ok(Math.abs(restored.rect()[key] - saved[key]) < .02, 'URL stellt den Radarausschnitt wieder her')
restored.dispose()
assert.equal(new URL(browser.location.href).searchParams.get('view'), 'tactical')
assert.equal(new URL(browser.location.href).searchParams.get('mobilePanel'), 'radar')
nav.zoom(1e-20)
assert.equal(nav.rect().w, RADAR_MIN_WIDTH)
nav.pan(-1e20, 1e20)
assert.equal(nav.rect().x0, 0)
assert.equal(nav.rect().y0 + nav.rect().h, WORLD_H)
nav.center(WORLD_W / 2, WORLD_H / 2)
assert.equal(nav.rect().x0 + nav.rect().w / 2, WORLD_W / 2)
nav.zoom(Infinity); nav.zoom(-1)
assert.equal(nav.rect().w, RADAR_MIN_WIDTH, 'Ungültiger Zoom wird verworfen')
nav.zoom(1e20)
assert.deepEqual(nav.rect(), world)
const restoredWorld = radarNavigation(browser, () => near, () => {})
assert.deepEqual(restoredWorld.rect(), world, 'Weltansicht bleibt beim Wiederherstellen exakt vollständig')
restoredWorld.dispose()
nav.reset()
assert.equal(new URL(browser.location.href).searchParams.has('radarWidth'), false)
for (const query of ['radarX=NaN&radarY=1&radarWidth=100', 'radarX=1&radarY=1&radarWidth=-1', 'radarX=&radarY=1&radarWidth=100', 'radarX=1']) {
  browser.location.href = 'http://localhost:8091/?' + query
  browser.dispatchEvent(new Event('popstate'))
  assert.deepEqual(nav.rect(), world, 'Ungültige URL-Koordinaten verwenden die gewählte Standardansicht')
}
browser.location.href = 'http://localhost:8091/?radarX=500&radarY=500&radarWidth=400'
browser.dispatchEvent(new Event('popstate'))
assert.deepEqual(nav.rect(), { x0: 300, y0: 400, w: 400, h: 200 })

const captured = new Set(), jumps = []
let centers = 0
const canvas = Object.assign(new EventTarget(), {
  dataset: {}, focus() {}, clientHeight: 200,
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 200 }),
  setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id),
})
const controls = bindRadarControls(canvas, nav, (...point) => jumps.push(point), () => centers++)
const send = (type, values) => { const e = Object.assign(new Event(type, { cancelable: true }), values); canvas.dispatchEvent(e); return e }
const pointer = (type, x, y, pointerId = 1, pointerType = 'mouse', button = 0) => send(type, { clientX: x, clientY: y, pointerId, pointerType, button })
pointer('pointerdown', 210, 120); pointer('pointerup', 210, 120)
assert.deepEqual(jumps, [[500, 500]], 'Nur ein ruhiger Klick bewegt die Hauptkarte')
pointer('pointerdown', 210, 120); pointer('pointermove', 250, 140); pointer('pointerup', 250, 140)
assert.deepEqual(nav.rect(), { x0: 260, y0: 380, w: 400, h: 200 }, 'Ziehen verschiebt ausschließlich den Radarausschnitt')
assert.equal(jumps.length, 1)
const beforeWheel = radarWorldPoint(nav.rect(), .25, .25)
assert.equal(send('wheel', { clientX: 110, clientY: 70, deltaY: -100, deltaMode: 0 }).defaultPrevented, true)
const afterWheel = radarWorldPoint(nav.rect(), .25, .25)
afterWheel.forEach((v, i) => assert.ok(Math.abs(v - beforeWheel[i]) < 1e-8))
assert.ok(nav.rect().w < 400)
const beforePinch = nav.rect().w
pointer('pointerdown', 110, 120, 1, 'touch'); pointer('pointerdown', 210, 120, 2, 'touch')
pointer('pointermove', 310, 120, 2, 'touch')
assert.equal(nav.rect().w, beforePinch / 2)
pointer('pointerup', 310, 120, 2, 'touch'); pointer('pointerup', 110, 120, 1, 'touch')
pointer('pointerdown', 210, 120); pointer('pointercancel', 210, 120)
assert.equal(jumps.length, 1, 'Pinch und Abbruch bewegen die Hauptkarte nicht')
assert.equal(pointer('pointerdown', 210, 120, 1, 'mouse', 2).defaultPrevented, false)
assert.equal(captured.size, 0)
assert.equal(canvas.dataset.dragging, undefined)
assert.equal(send('keydown', { key: 'ArrowRight' }).defaultPrevented, true)
send('keydown', { key: '-' }); send('keydown', { key: 'Home' })
assert.equal(centers, 1)
assert.equal(jumps.length, 1)
controls(); nav.dispose()
const oldChanges = changes
send('wheel', { clientX: 110, clientY: 70, deltaY: 100, deltaMode: 1 })
browser.dispatchEvent(new Event('popstate'))
assert.equal(changes, oldChanges, 'Cleanup entfernt sämtliche Listener')
console.log('Radar: Darstellung, URL-Wiederherstellung, Maus-/Touch-Pan, Zoomanker, Pinch, Tastatur, Weltränder und unabhängige Kamerasteuerung bestanden.')

import { civicPanel } from '../ui/civic.ts'
import { createCivic, emptyCivicCounts, isCivic, advanceCivic, civicReport, tradeCivic } from '../../shared/civic.ts'
import { Context } from 'cordis'
import { Camera } from '../camera.ts'
import { h } from '../engine/render.ts'
import { PolyScene } from './scene.ts'
import { graphicsSettings } from './settings.ts'
import { graphicsControls } from './controls.ts'
import { SCENES, DEMO_X, DEMO_Y, demoEntities, demoLand, animateDemo } from './demo.ts'

const params = new URLSearchParams(location.search)
const current = SCENES.find(s => s.id === params.get('scene')) ?? SCENES[0]
const cinematic=params.get('hud')==='off'||(current.id==='concept'&&!params.has('hud')&&!params.has('model'))
document.body.classList.toggle('poly-cinematic',cinematic)
const settings = graphicsSettings(location.search, matchMedia('(prefers-reduced-motion: reduce)').matches)
const scene = new PolyScene(settings)
scene.canvas.style.pointerEvents = 'auto'
document.body.append(scene.canvas)
const cam = new Camera(new Context())
cam.minMpp = .005
const entities = demoEntities(current.id)
const selected = new Set<number>()
const colors = ['#78816b', '#be9f45', '#99816a', '#7f999f']
const stats = h('output', { id: 'scene-stats', 'aria-label': 'Gemessene Grafikleistung' }, 'Szene wird aufgebaut …')
const selection = h('div', { class: 'poly-selection', 'aria-live': 'polite' }, 'Modell anklicken, um es auszuwählen')
const settingsPanel = graphicsControls()
const link = (id: string) => {
  const url = new URL(location.href); url.searchParams.set('scene', id)
  for (const key of ['model', 'zoom', 'x', 'y']) url.searchParams.delete(key)
  return url.pathname + url.search
}
const models = [...new Map(entities.map(e => [e.type, e])).values()]
const focus = entities.find(e => String(e.id) === params.get('model'))
const modelControl = h('label', { class: 'poly-field poly-model' }, h('span', 'Modell ansehen'), h('select', {
  'aria-label': 'Modell ansehen', onChange: (event: Event) => {
    const url = new URL(location.href), id = (event.target as HTMLSelectElement).value
    if (id) url.searchParams.set('model', id); else url.searchParams.delete('model')
    for (const key of ['zoom', 'x', 'y']) url.searchParams.delete(key)
    location.assign(url)
  },
}, h('option', { value: '', selected: !focus }, 'Gesamte Szene'), ...models.map(e => h('option', { value: String(e.id), selected: e.id === focus?.id }, e.def!.name))))
const hud = h('div', { class: 'poly-hud' },
  h('header', { class: 'poly-header' }, h('a', { href: '/engine.html', class: 'poly-brand' }, h('span', { class: 'poly-mark', 'aria-hidden': 'true' }, 'R'), 'Real Command'),
    h('span', { class: 'poly-eyebrow' }, 'WORLD ENGINE / 01'), h('a', { href: '/' + location.search, class: 'poly-play' }, 'Zum Spiel ↗')),
  h('aside', { class: 'poly-sidebar' }, h('p', { class: 'poly-eyebrow' }, 'REAL COMMAND · ECHTZEIT · 3D'),
    h('h1', 'Eine Welt.\nDein Kommando.'), h('p', { class: 'poly-intro' }, 'Perspektiven auf die neue Spielwelt.'),
    h('nav', { 'aria-label': 'Szenen' }, ...SCENES.map((s, i) => h('a', { href: link(s.id), 'aria-current': s.id === current.id ? 'page' : undefined, class: 'poly-scene-link' }, h('span', '0' + (i + 1)), s.title))),
    h('div', { class: 'poly-description' }, h('h2', current.title), h('p', current.description)),
    modelControl, settingsPanel, h('a', { href: '/debug.html?bots=9999&view=world', class: 'poly-debug-link' }, 'Debug: 9.999 Welt-Bots ↗')),
  h('div', { class: 'poly-scene-label' }, h('span', { class: 'poly-live' }, '● LOKALE SZENENVORSCHAU'), h('span', 'Keine Verbindung zum Spielserver')),
  selection,
  h('footer', { class: 'poly-footer' }, h('span', 'Ziehen: Kamera · Scrollen: Zoom · Klick: Auswahl'), stats),
)
document.body.append(hud)
const controlsURL=new URL(location.href);controlsURL.searchParams.set('hud',cinematic?'on':'off')
hud.append(h('a',{class:'poly-view-toggle',href:controlsURL.pathname+controlsURL.search},cinematic?'Steuerung anzeigen':'Welt ohne Menü ansehen'))
const cityState = createCivic(), cityCounts = emptyCivicCounts()
let cityFunds = 4000, cityElapsed = 0
for (const entity of entities) if (isCivic(entity.type)) cityCounts[entity.type]++
cityState.residents = 120; cityState.qualified = 35; cityState.stock = { food: 240, goods: 90 }
const cityReport = () => civicReport(cityState, cityCounts, true, cityFunds)
const city = current.id === 'city' ? civicPanel({
  trade: async (side, good, quantity) => { cityFunds = tradeCivic(cityState, cityCounts, cityFunds, side, good, quantity); return cityReport() },
  education: async enabled => { cityState.education = enabled; return cityReport() },
}, true) : undefined
if (city) {
  hud.append(h('button', { class: 'poly-economy', type: 'button', onClick: () => city.open() }, 'Stadt & Handel erkunden ↗'))
  city.update(cityReport())
  if (params.get('panel') === 'civic') city.open()
}
let fitOnResize: (() => void) | undefined
const resize = () => { cam.resize(innerWidth, innerHeight); scene.resize(innerWidth, innerHeight); fitOnResize?.() }
resize()
// Offset the world centre so the scene occupies the area beside the controls.
const sidebarWidth = cinematic?0:innerWidth <= 900 ? 230 : 328
const worldSpan = { concept: 760, robotics: 24, city: 650, buildings: 1560, outpost: 620, characters: 82, vehicles: 235, coast: 560, crowd: 1030 }[current.id]
const initialMpp = Math.max(current.mpp, worldSpan / Math.max(180, innerWidth - sidebarWidth - 70))
const readNumber = (key: string, fallback: number, min: number, max: number) => {
  const n = params.has(key) ? Number(params.get(key)) : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}
const zoom = readNumber('zoom', focus ? Math.max(cam.minMpp, focus.def!.size / 70) : initialMpp, cam.minMpp, 80)
cam.moveTo(readNumber('x', (focus?.x ?? DEMO_X) - sidebarWidth * zoom / 2, 0, 4e7), readNumber('y', focus?.y ?? DEMO_Y, 0, 2e7), zoom)
let userCamera = ['zoom', 'x', 'y'].some(key => params.has(key))
fitOnResize = () => {
  if (userCamera) return
  const sidebar = cinematic?0:innerWidth <= 900 ? 230 : 328
  const mpp = focus ? Math.max(cam.minMpp, focus.def!.size / 70) : Math.max(current.mpp, worldSpan / Math.max(180, innerWidth - sidebar - 70))
  cam.moveTo((focus?.x ?? DEMO_X) - sidebar * mpp / 2, focus?.y ?? DEMO_Y, mpp)
}
requestAnimationFrame(() => fitOnResize?.())
if (focus) { selected.add(focus.id); selection.textContent = focus.def!.name + ' · ' + focus.hp + ' HP' }
const syncCamera = () => {
  userCamera = true
  const url = new URL(location.href)
  url.searchParams.set('x', cam.x.toFixed(2)); url.searchParams.set('y', cam.y.toFixed(2)); url.searchParams.set('zoom', cam.mpp.toFixed(4))
  history.replaceState(null, '', url)
}
addEventListener('resize', resize)
let drag: { x: number, y: number, startX: number, startY: number } | undefined
scene.canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }; scene.canvas.setPointerCapture(e.pointerId) })
scene.canvas.addEventListener('pointermove', e => {
  if (!drag) return
  cam.panPixels(drag.x - e.clientX, drag.y - e.clientY)
  drag.x = e.clientX; drag.y = e.clientY
})
scene.canvas.addEventListener('pointerup', e => {
  if (drag && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) {
    const [x, y] = cam.screenToWorld(e.clientX, e.clientY)
    const found = entities.filter(a => Math.hypot(a.x - x, a.y - y) < Math.max(a.def!.size * 1.5, cam.mpp * 18))
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    selected.clear()
    const url = new URL(location.href)
    if (found) { selected.add(found.id); selection.textContent = found.def!.name + ' · ' + found.hp + ' HP'; url.searchParams.set('model', String(found.id)) }
    else selection.textContent = 'Modell anklicken, um es auszuwählen'
    if (!found) url.searchParams.delete('model')
    history.replaceState(null, '', url)
  }
  drag = undefined
  syncCamera()
})
scene.canvas.addEventListener('pointercancel', () => { drag = undefined })
let zoomChanged = false
scene.canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoomBy(Math.exp(e.deltaY * .001), e.clientX, e.clientY); zoomChanged = true }, { passive: false })
let time = 0, previous = performance.now(), reportAt = previous, frames = 0, raf = 0
const loop = (now: number) => {
  const dt = Math.min(.1, (now - previous) / 1000); previous = now
  if (!document.hidden) {
    time += dt
    if (city && (cityElapsed += dt) >= 5) { cityFunds = advanceCivic(cityState, cityCounts, true, cityFunds, cityElapsed); cityElapsed = 0; city.update(cityReport()) }
    cam.update(dt); animateDemo(entities, time, settings.motion)
    if (zoomChanged && !cam.busy) { syncCamera(); zoomChanged = false }
    scene.render(cam, entities, { ready: true, isLand: (x, y) => demoLand(current.id, x, y),graphicsSnapshot:()=>({kind:'demo',scene:current.id}) }, id => colors[id], time, selected)
    frames++
    if (now - reportAt > 700) {
      const s = scene.stats
      stats.textContent = Math.round(frames * 1000 / (now - reportAt)) + ' FPS · ' + s.entities + ' Modelle · ' + s.detailed + ' detailliert · ' + s.calls + ' Draw Calls · ' + s.triangles.toLocaleString('de-DE') + ' Dreiecke'
      stats.dataset.entities = String(s.entities); stats.dataset.calls = String(s.calls); stats.dataset.detailed = String(s.detailed)
      frames = 0; reportAt = now
    }
  }
  raf = requestAnimationFrame(loop)
}
raf = requestAnimationFrame(loop)
addEventListener('pagehide', () => { cancelAnimationFrame(raf); scene.dispose(); removeEventListener('resize', resize) }, { once: true })

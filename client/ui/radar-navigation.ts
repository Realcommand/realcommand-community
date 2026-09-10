import { WORLD_W, WORLD_H } from '../../shared/constants.ts'
import { bindMapGestures } from '../touch-map.ts'
import { radarWorldPoint, type RadarRect } from './radar.ts'

export const RADAR_MIN_WIDTH = 100
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function fitRadarRect(x: number, y: number, width: number): RadarRect {
  const w = clamp(width, RADAR_MIN_WIDTH, WORLD_W), h = w / 2
  return { x0: clamp(x - w / 2, 0, WORLD_W - w), y0: clamp(y - h / 2, 0, WORLD_H - h), w, h }
}

/** Freier Radarausschnitt. Ohne URL-Koordinaten folgt die Umgebung der Kamera. */
export function radarNavigation(browser: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>, preset: () => RadarRect, changed: () => void) {
  const keys = ['radarX', 'radarY', 'radarWidth'] as const
  const read = () => {
    const p = new URL(browser.location.href).searchParams
    const values = keys.map(key => p.get(key))
    if (values.some(v => v === null || v.trim() === '' || !Number.isFinite(Number(v)))) return
    const [x, y, w] = values.map(Number)
    if (w <= 0) return
    return fitRadarRect(x, y, w)
  }
  let custom = read()
  const rect = () => custom ?? preset()
  const save = () => {
    const url = new URL(browser.location.href)
    if (custom) {
      const values = [custom.x0 + custom.w / 2, custom.y0 + custom.h / 2, custom.w]
      keys.forEach((key, i) => url.searchParams.set(key, String(i === 2 ? values[i] : Math.round(values[i] * 100) / 100)))
    } else keys.forEach(key => url.searchParams.delete(key))
    browser.history.replaceState(browser.history.state, '', url)
    changed()
  }
  const restore = () => { custom = read(); changed() }
  browser.addEventListener('popstate', restore)
  return {
    rect,
    zoom(factor: number, fx = .5, fy = .5) {
      if (!Number.isFinite(factor) || factor <= 0) return
      const r = rect(), [x, y] = radarWorldPoint(r, fx, fy)
      const w = clamp(r.w * factor, RADAR_MIN_WIDTH, WORLD_W)
      custom = fitRadarRect(x + (.5 - clamp(fx, 0, 1)) * w, y + (.5 - clamp(fy, 0, 1)) * w / 2, w)
      save()
    },
    pan(dx: number, dy: number) {
      const r = rect()
      custom = fitRadarRect(r.x0 + r.w * (.5 + dx), r.y0 + r.h * (.5 + dy), r.w)
      save()
    },
    center(x: number, y: number) { custom = fitRadarRect(x, y, rect().w); save() },
    reset() { custom = undefined; save() },
    dispose() { browser.removeEventListener('popstate', restore) },
  }
}

export function bindRadarControls(canvas: HTMLCanvasElement, navigation: ReturnType<typeof radarNavigation>, jump: (x: number, y: number) => void, center: () => void) {
  const fraction = (x: number, y: number): [number, number] => {
    const b = canvas.getBoundingClientRect()
    return [(x - b.left) / b.width, (y - b.top) / b.height]
  }
  const gestures = bindMapGestures(canvas, {
    start: () => { canvas.focus({ preventScroll: true }); canvas.dataset.dragging = 'true' },
    end: () => { delete canvas.dataset.dragging },
    pan: (dx, dy) => { const b = canvas.getBoundingClientRect(); navigation.pan(dx / b.width, dy / b.height) },
    zoom: (factor, x, y) => navigation.zoom(factor, ...fraction(x, y)),
    tap: (x, y) => jump(...radarWorldPoint(navigation.rect(), ...fraction(x, y))),
  })
  const wheel = (event: WheelEvent) => {
    event.preventDefault(); event.stopPropagation()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1)
    navigation.zoom(Math.exp(clamp(delta, -400, 400) * .002), ...fraction(event.clientX, event.clientY))
  }
  const key = (event: KeyboardEvent) => {
    event.stopPropagation()
    const pans: Record<string, [number, number]> = { ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] }
    if (pans[event.key]) navigation.pan(...pans[event.key])
    else if (event.key === '+' || event.key === '=') navigation.zoom(.5)
    else if (event.key === '-') navigation.zoom(2)
    else if (event.key === 'Home') center()
    else return
    event.preventDefault()
  }
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('keydown', key)
  return () => { gestures(); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', key) }
}

/** Prozedurale Zeichnung aller Einheiten und Gebäude (keine externen Grafiken). Koordinaten in Metern, +x = Front. */
import { DEFS, type Def, type BuildingDef, type UnitDef } from '../shared/data.ts'
import type { ClientEntity } from './state.ts'
import { drawModelIcon } from './poly/model-icon.ts'

export interface Palette { body: string, dark: string, light: string, accent: string, outline: string, wall: string, roof: string, roofLight: string }
const palettes = new Map<string, Palette>()

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function rgb(c: [number, number, number]) { return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})` }
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function palette(color: string): Palette {
  let p = palettes.get(color)
  if (p) return p
  const c = hexToRgb(color)
  const grey: [number, number, number] = [116, 122, 112]
  const body = mix(c, grey, 0.5)
  const roof = mix(c, [150, 156, 148], 0.72)
  p = {
    body: rgb(body),
    dark: rgb(mix(body, [0, 0, 0], 0.42)),
    light: rgb(mix(body, [255, 255, 255], 0.3)),
    accent: color,
    outline: 'rgba(10,14,12,0.85)',
    wall: rgb(mix(roof, [0, 0, 0], 0.45)),
    roof: rgb(roof),
    roofLight: rgb(mix(roof, [255, 255, 255], 0.22)),
  }
  palettes.set(color, p)
  return p
}

export interface DrawOpts { time: number, ghost: boolean, own: boolean }

const METAL = '#5b6266', METAL_DARK = '#3a3f42', METAL_LIGHT = '#8b9397', TRACK = '#2b2d2b', TRACK_LIGHT = '#4a4d48'

function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) { g.fillRect(x, y, w, h) }
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke() }
function poly(g: CanvasRenderingContext2D, pts: number[], stroke = false) {
  g.beginPath(); g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.closePath(); g.fill()
  if (stroke) g.stroke()
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke = false) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill()
  if (stroke) g.stroke()
}
function grad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, a: string, b: string) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, a); gr.addColorStop(1, b)
  return gr
}
function radial(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: string, b: string) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  gr.addColorStop(0, a); gr.addColorStop(1, b)
  return gr
}

/** Effektiver Maßstab (px pro Meter) mit Mindestgröße in Pixeln, damit Einheiten lesbar bleiben. */
export function effectiveScale(def: Def, pxPerM: number) {
  return Math.max(pxPerM, 6 / def.size)
}

export function drawEntity(g: CanvasRenderingContext2D, e: ClientEntity, sx: number, sy: number, pxPerM: number, color: string, opts: DrawOpts) {
  const def = e.def
  if (!def) return
  const k = effectiveScale(def, pxPerM)
  const pal = palette(color)
  g.save()
  g.translate(sx, sy)
  if (opts.ghost) g.globalAlpha = 0.4
  g.scale(k, k)
  g.lineWidth = 1 / k
  g.lineJoin = 'round'
  if (def.kind === 'building') {
    drawBuilding(g, def, pal, opts, e, k)
  } else {
    drawUnitWithShadow(g, def, pal, opts, e, k)
  }
  g.restore()
}

/** Bauvorschau: halbtransparentes Gebäude in Grün/Rot. */
export function drawGhost(g: CanvasRenderingContext2D, def: BuildingDef, sx: number, sy: number, pxPerM: number, color: string, ok: boolean, time: number) {
  const k = Math.max(pxPerM, 28 / (def.size * 2))
  const pal = palette(color)
  const fake: ClientEntity = { id: -1, kind: 'b', type: def.id, owner: 0, x: 0, y: 0, tx: 0, ty: 0, heading: 0, thead: 0, turret: 0, speed: 0, samples: [], hp: def.hp, maxHp: def.hp, visible: true, ghost: true, lastUpdate: 0, seen: 0, def }
  g.save()
  g.translate(sx, sy)
  g.globalAlpha = 0.55
  g.scale(k, k)
  g.lineWidth = 1 / k
  drawBuilding(g, def, pal, { time, ghost: true, own: true }, fake, k)
  g.restore()
  g.save()
  g.translate(sx, sy)
  g.scale(k, k)
  const s = def.size * 1.08
  g.fillStyle = ok ? 'rgba(62,207,90,0.22)' : 'rgba(255,90,54,0.3)'
  g.strokeStyle = ok ? '#3ecf5a' : '#ff5a36'
  g.lineWidth = 2 / k
  g.fillRect(-s, -s, s * 2, s * 2)
  g.strokeRect(-s, -s, s * 2, s * 2)
  g.restore()
}

// ---------------------------------------------------------------- Einheiten

function drawUnitWithShadow(g: CanvasRenderingContext2D, def: UnitDef, pal: Palette, opts: DrawOpts, e: ClientEntity, k: number) {
  const s = def.size
  const airborne = def.domain === 'air' && !(e.state === 'idle' || e.state === 'rearm')
  // Schatten (Licht von links oben; Luftfahrzeuge werfen den Schatten weiter weg).
  if (!opts.ghost && def.domain !== 'sea') {
    g.save()
    g.translate(airborne ? s * 1.4 : s * 0.22, airborne ? s * 1.9 : s * 0.32)
    g.rotate(e.heading)
    const shape = (grow: number) => {
      if (def.category === 'infantry') circle(g, 0, 0, s * 0.7 + grow)
      else if (def.category === 'aircraft') { g.beginPath(); g.ellipse(0, 0, s * 1.1 + grow, s * 0.8 + grow, 0, 0, Math.PI * 2); g.fill() }
      else rrect(g, -s - grow, -s * 0.62 - grow, s * 2 + grow * 2, s * 1.24 + grow * 2, s * 0.2 + grow)
    }
    g.fillStyle = airborne ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.16)'
    shape(s * 0.18)
    g.fillStyle = airborne ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)'
    shape(0)
    g.restore()
  }
  g.rotate(e.heading)
  switch (def.category) {
    case 'infantry': return drawInfantry(g, def, pal, e, opts, k)
    case 'vehicle': return drawVehicle(g, def, pal, e, opts, k)
    case 'aircraft': return drawAircraft(g, def, pal, e, opts, k)
    case 'ship': return drawShip(g, def, pal, e, opts, k)
  }
}

function drawInfantry(g: CanvasRenderingContext2D, def: UnitDef, pal: Palette, e: ClientEntity, opts: DrawOpts, k: number) {
  g.strokeStyle = pal.outline
  g.lineWidth = 0.9 / k
  // Schultern
  g.fillStyle = pal.dark
  g.beginPath(); g.ellipse(-0.15, 0, 0.75, 1.15, 0, 0, Math.PI * 2); g.fill(); g.stroke()
  // Rucksack / Körper
  g.fillStyle = pal.body
  g.beginPath(); g.ellipse(0, 0, 0.72, 0.95, 0, 0, Math.PI * 2); g.fill()
  // Kopf mit Helm
  const helmet = def.id === 'medic' ? '#f2f2f2' : def.id === 'engineer' ? '#f5c518' : def.id === 'sniper' ? '#3d4a3a' : pal.dark
  g.fillStyle = helmet
  circle(g, 0.1, 0, 0.55)
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  ring(g, 0.1, 0, 0.55)
  g.fillStyle = 'rgba(255,255,255,0.35)'
  circle(g, -0.05, -0.15, 0.2)
  // Waffe
  g.strokeStyle = '#1e2320'
  g.lineWidth = 0.42
  if (def.id === 'sniper') { g.beginPath(); g.moveTo(0.3, 0.35); g.lineTo(2.8, 0.35); g.stroke() }
  else if (def.id === 'rocketeer') { g.fillStyle = '#4a4f4a'; rect(g, -1.1, -1.0, 2.6, 0.55); g.fillStyle = '#c85a2a'; rect(g, 1.2, -1.0, 0.3, 0.55) }
  else if (def.id === 'medic') { g.fillStyle = '#d33'; rect(g, -0.15, -0.5, 0.3, 1.0); rect(g, -0.5, -0.15, 1.0, 0.3) }
  else if (def.id === 'engineer') { g.fillStyle = '#c9c9c9'; rect(g, 0.3, 0.2, 1.3, 0.35); g.fillStyle = '#b07a2a'; rect(g, -0.9, -0.9, 0.8, 0.6) }
  else { g.beginPath(); g.moveTo(0.4, 0.4); g.lineTo(1.9, 0.4); g.stroke() }
  if (e.state === 'heal') { g.strokeStyle = 'rgba(120,255,140,0.8)'; g.lineWidth = 0.3; ring(g, 0, 0, 1.9 + Math.sin(opts.time * 6) * 0.2) }
}

function drawTracks(g: CanvasRenderingContext2D, len: number, wid: number, k: number, time: number, moving: boolean) {
  const th = wid * 0.28
  for (const side of [-1, 1]) {
    const y = side < 0 ? -wid / 2 - th * 0.55 : wid / 2 - th * 0.45
    g.fillStyle = TRACK
    rrect(g, -len / 2, y, len, th, th * 0.3)
    g.fillStyle = TRACK_LIGHT
    const step = Math.max(0.6, len / 9)
    const offset = moving ? (time * 3) % step : 0
    for (let x = -len / 2 + offset; x < len / 2; x += step) rect(g, x, y + th * 0.25, step * 0.45, th * 0.5)
  }
}

function drawWheels(g: CanvasRenderingContext2D, len: number, wid: number, count: number) {
  const r = wid * 0.16
  for (let i = 0; i < count; i++) {
    const x = -len / 2 + len * (i + 0.5) / count
    for (const side of [-1, 1]) {
      g.fillStyle = '#1f2220'
      rrect(g, x - r, side * wid / 2 - r * 0.9 + (side < 0 ? -r * 0.6 : r * 0.6), r * 2, r * 1.8, r * 0.5)
      g.fillStyle = '#5a5e5a'
      rect(g, x - r * 0.4, side * wid / 2 - r * 0.2 + (side < 0 ? -r * 0.6 : r * 0.6), r * 0.8, r * 0.4)
    }
  }
}

function hull(g: CanvasRenderingContext2D, pal: Palette, len: number, wid: number, k: number, pts?: number[]) {
  g.fillStyle = grad(g, -len / 2, -wid / 2, len / 2, wid / 2, pal.light, pal.dark)
  g.strokeStyle = pal.outline
  g.lineWidth = 1.2 / k
  if (pts) poly(g, pts, true)
  else rrect(g, -len / 2, -wid / 2, len, wid, wid * 0.12, true)
}

function turret(g: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, k: number, barrels: number[], barrelLen: number, barrelW: number, rel = 0) {
  g.save()
  g.translate(x, y)
  g.rotate(rel)
  x = 0; y = 0
  // Schatten des Turms
  g.fillStyle = 'rgba(0,0,0,0.3)'
  circle(g, x + r * 0.18, y + r * 0.28, r)
  g.fillStyle = radial(g, x, y, r, pal.light, pal.dark)
  g.strokeStyle = pal.outline
  g.lineWidth = 1 / k
  circle(g, x, y, r); ring(g, x, y, r)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  circle(g, x - r * 0.25, y + r * 0.1, r * 0.3)
  for (const by of barrels) {
    g.fillStyle = METAL_DARK
    rect(g, x, y + by - barrelW / 2, barrelLen, barrelW)
    g.fillStyle = METAL_LIGHT
    rect(g, x, y + by - barrelW / 2, barrelLen, barrelW * 0.35)
    g.fillStyle = METAL_DARK
    rect(g, x + barrelLen - barrelW * 1.4, y + by - barrelW * 0.8, barrelW * 1.4, barrelW * 1.6)
  }
  g.restore()
}

function drawVehicle(g: CanvasRenderingContext2D, def: UnitDef, pal: Palette, e: ClientEntity, opts: DrawOpts, k: number) {
  const s = def.size
  const len = s * 2, wid = s * 1.25
  const moving = e.state === 'move' || e.state === 'toDeposit' || e.state === 'return'
  switch (def.id) {
    case 'scout': {
      drawWheels(g, len, wid * 0.8, 2)
      hull(g, pal, len, wid * 0.8, k, [-len / 2, -wid * 0.36, len * 0.3, -wid * 0.4, len / 2, -wid * 0.12, len / 2, wid * 0.12, len * 0.3, wid * 0.4, -len / 2, wid * 0.36])
      g.fillStyle = 'rgba(20,40,60,0.8)'
      rect(g, len * 0.05, -wid * 0.25, len * 0.18, wid * 0.5)
      turret(g, pal, -len * 0.15, 0, s * 0.3, k, [0], s * 0.9, s * 0.16, e.turret - e.heading)
      return
    }
    case 'apc': {
      drawWheels(g, len, wid, 3)
      hull(g, pal, len, wid, k, [-len / 2, -wid * 0.42, len * 0.25, -wid * 0.42, len / 2, -wid * 0.12, len / 2, wid * 0.12, len * 0.25, wid * 0.42, -len / 2, wid * 0.42])
      g.fillStyle = 'rgba(0,0,0,0.25)'
      rect(g, -len * 0.42, -wid * 0.3, len * 0.55, wid * 0.6)
      const cargo = e.cargo ?? 0
      for (let i = 0; i < (def.cargo ?? 0); i++) {
        g.fillStyle = i < cargo ? '#f2f2f2' : 'rgba(255,255,255,0.15)'
        circle(g, -len * 0.35 + i * len * 0.11, 0, s * 0.1)
      }
      turret(g, pal, len * 0.18, 0, s * 0.2, k, [0], s * 0.5, s * 0.1, e.turret - e.heading)
      return
    }
    case 'samtruck': {
      drawWheels(g, len, wid, 3)
      hull(g, pal, len, wid, k)
      g.fillStyle = 'rgba(20,40,60,0.8)'
      rect(g, len * 0.3, -wid * 0.3, len * 0.15, wid * 0.6)
      g.fillStyle = METAL
      rrect(g, -len * 0.42, -wid * 0.4, len * 0.68, wid * 0.8, s * 0.1)
      g.fillStyle = '#e6e6e6'
      for (const y of [-wid * 0.26, wid * 0.06]) { rrect(g, -len * 0.38, y, len * 0.6, wid * 0.2, s * 0.05); g.fillStyle = '#c0392b'; rect(g, len * 0.16, y + wid * 0.04, s * 0.15, wid * 0.12); g.fillStyle = '#e6e6e6' }
      return
    }
    case 'extractor': {
      drawTracks(g, len * 0.85, wid, k, opts.time, moving)
      hull(g, pal, len * 0.8, wid, k)
      g.fillStyle = 'rgba(20,40,60,0.8)'
      rect(g, len * 0.22, -wid * 0.3, len * 0.12, wid * 0.6)
      // Schaufel vorn
      g.fillStyle = METAL_DARK
      poly(g, [len * 0.3, -wid * 0.55, len / 2, -wid * 0.72, len / 2, wid * 0.72, len * 0.3, wid * 0.55])
      g.fillStyle = METAL_LIGHT
      rect(g, len * 0.44, -wid * 0.7, len * 0.06, wid * 1.4)
      // Ladebehälter mit Füllstand
      const load = e.load ?? 0
      g.fillStyle = '#23272a'
      rrect(g, -len * 0.4, -wid * 0.36, len * 0.55, wid * 0.72, s * 0.08)
      g.fillStyle = '#4fc8ff'
      rect(g, -len * 0.38, -wid * 0.32, len * 0.51 * load, wid * 0.64)
      g.strokeStyle = 'rgba(255,255,255,0.4)'
      g.lineWidth = 0.6 / k
      g.strokeRect(-len * 0.38, -wid * 0.32, len * 0.51, wid * 0.64)
      return
    }
    case 'crawler': {
      drawTracks(g, len, wid * 1.1, k, opts.time, moving)
      hull(g, pal, len, wid * 1.05, k)
      g.fillStyle = 'rgba(0,0,0,0.25)'
      rect(g, -len * 0.45, -wid * 0.32, len * 0.5, wid * 0.64)
      g.fillStyle = pal.accent
      rrect(g, -len * 0.4, -wid * 0.26, len * 0.4, wid * 0.52, s * 0.08)
      g.fillStyle = 'rgba(20,40,60,0.8)'
      rect(g, len * 0.3, -wid * 0.3, len * 0.12, wid * 0.6)
      g.strokeStyle = '#ddd'
      g.lineWidth = s * 0.14
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.55, -wid * 0.6); g.stroke()
      g.fillStyle = '#ffd25a'
      circle(g, len * 0.55, -wid * 0.6, s * 0.16)
      if (e.state === 'deploy') {
        g.strokeStyle = 'rgba(255,220,80,0.9)'
        g.lineWidth = 2 / k
        ring(g, 0, 0, s * (1.4 + (opts.time % 1.5) * 0.6))
      }
      return
    }
    case 'artillery': {
      drawTracks(g, len, wid, k, opts.time, moving)
      hull(g, pal, len, wid, k)
      g.fillStyle = METAL_DARK
      rect(g, -len * 0.5, -wid * 0.18, len * 0.2, wid * 0.36)
      turret(g, pal, -len * 0.12, 0, s * 0.42, k, [0], len * 0.95, s * 0.22, e.turret - e.heading)
      return
    }
    case 'mlrs': {
      drawTracks(g, len, wid, k, opts.time, moving)
      hull(g, pal, len, wid, k)
      g.fillStyle = METAL_DARK
      rrect(g, -len * 0.4, -wid * 0.44, len * 0.75, wid * 0.88, s * 0.08)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        g.fillStyle = '#cfd4cf'
        rrect(g, -len * 0.36 + c * len * 0.175, -wid * 0.38 + r * wid * 0.4, len * 0.14, wid * 0.32, s * 0.03)
        g.fillStyle = '#2b2d2b'
        circle(g, -len * 0.36 + c * len * 0.175 + len * 0.1, -wid * 0.38 + r * wid * 0.4 + wid * 0.16, wid * 0.09)
      }
      return
    }
    case 'aa': {
      drawTracks(g, len, wid, k, opts.time, moving)
      hull(g, pal, len, wid, k)
      turret(g, pal, 0, 0, s * 0.45, k, [-s * 0.22, s * 0.22], s * 1.05, s * 0.14, e.turret - e.heading)
      g.fillStyle = '#c9d1d9'
      circle(g, -s * 0.25, -s * 0.3, s * 0.14)
      return
    }
  }
  // Panzer (lighttank, mbt, heavytank)
  const heavy = def.id === 'heavytank'
  drawTracks(g, len, wid, k, opts.time, moving)
  hull(g, pal, len, wid, k, [-len / 2, -wid * 0.45, len * 0.32, -wid * 0.45, len / 2, -wid * 0.22, len / 2, wid * 0.22, len * 0.32, wid * 0.45, -len / 2, wid * 0.45])
  g.fillStyle = 'rgba(255,255,255,0.12)'
  poly(g, [len * 0.32, -wid * 0.45, len / 2, -wid * 0.22, len / 2, wid * 0.22, len * 0.32, wid * 0.45])
  g.fillStyle = 'rgba(0,0,0,0.3)'
  for (let i = 0; i < 3; i++) rect(g, -len * 0.47 + i * len * 0.06, -wid * 0.3, len * 0.03, wid * 0.6)
  g.fillStyle = pal.accent
  rect(g, -len * 0.3, -wid * 0.45, len * 0.08, wid * 0.9)
  if (heavy) turret(g, pal, -s * 0.05, 0, s * 0.55, k, [-s * 0.2, s * 0.2], s * 1.5, s * 0.17, e.turret - e.heading)
  else turret(g, pal, -s * 0.05, 0, s * (def.id === 'lighttank' ? 0.42 : 0.5), k, [0], s * (def.id === 'lighttank' ? 1.15 : 1.4), s * 0.2, e.turret - e.heading)
}

function drawAircraft(g: CanvasRenderingContext2D, def: UnitDef, pal: Palette, e: ClientEntity, opts: DrawOpts, k: number) {
  const s = def.size
  const grounded = e.state === 'idle' || e.state === 'rearm'
  g.strokeStyle = pal.outline
  g.lineWidth = 1.1 / k
  if (def.id === 'gunship' || def.id === 'cargoheli') {
    const twin = def.id === 'cargoheli'
    g.fillStyle = pal.dark
    rrect(g, -s * 1.6, -s * 0.1, s * 0.9, s * 0.2, s * 0.05)
    if (!twin) { g.fillStyle = pal.dark; rect(g, -s * 1.62, -s * 0.38, s * 0.16, s * 0.76) }
    g.fillStyle = grad(g, 0, -s * 0.5, 0, s * 0.5, pal.light, pal.dark)
    g.beginPath(); g.ellipse(0, 0, s * (twin ? 1.15 : 0.95), s * 0.42, 0, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = 'rgba(30,60,90,0.85)'
    g.beginPath(); g.ellipse(s * 0.5, 0, s * 0.3, s * 0.22, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.beginPath(); g.ellipse(s * 0.55, -s * 0.06, s * 0.12, s * 0.07, 0, 0, Math.PI * 2); g.fill()
    if (!twin) { g.fillStyle = METAL_DARK; rect(g, -s * 0.3, -s * 0.62, s * 0.7, s * 0.14); rect(g, -s * 0.3, s * 0.48, s * 0.7, s * 0.14) }
    const spin = grounded ? 0 : opts.time * 45
    const rotor = (cx: number) => {
      g.strokeStyle = grounded ? 'rgba(25,25,25,0.9)' : 'rgba(25,25,25,0.55)'
      g.lineWidth = s * 0.08
      for (let i = 0; i < 4; i++) {
        const a = spin + i * Math.PI / 2
        g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx + Math.cos(a) * s * 1.05, Math.sin(a) * s * 1.05); g.stroke()
      }
      if (!grounded) { g.fillStyle = 'rgba(210,210,210,0.13)'; circle(g, cx, 0, s * 1.05) }
      g.fillStyle = '#222'
      circle(g, cx, 0, s * 0.12)
    }
    if (twin) { rotor(s * 0.6); rotor(-s * 0.6) } else rotor(0)
    if (e.cargo) { g.fillStyle = '#fff'; for (let i = 0; i < e.cargo; i++) circle(g, -s * 0.5 + i * s * 0.2, s * 0.6, s * 0.07) }
    return
  }
  // Strahlflugzeuge
  const inter = def.id === 'interceptor'
  g.fillStyle = grad(g, -s, -s, s, s, pal.light, pal.dark)
  if (inter) poly(g, [s * 1.3, 0, -s * 0.1, -s * 0.95, -s * 0.95, -s * 0.95, -s * 0.5, -s * 0.16, -s * 0.5, s * 0.16, -s * 0.95, s * 0.95, -s * 0.1, s * 0.95], true)
  else poly(g, [s * 1.15, 0, -s * 0.05, -s * 1.05, -s * 0.85, -s * 1.05, -s * 0.4, -s * 0.22, -s * 0.95, -s * 0.22, -s * 0.95, s * 0.22, -s * 0.4, s * 0.22, -s * 0.85, s * 1.05, -s * 0.05, s * 1.05], true)
  g.fillStyle = pal.body
  poly(g, [s * 0.9, 0, s * 0.2, -s * 0.18, -s * 0.9, -s * 0.14, -s * 0.9, s * 0.14, s * 0.2, s * 0.18])
  g.fillStyle = 'rgba(30,60,90,0.9)'
  g.beginPath(); g.ellipse(s * 0.45, 0, s * 0.28, s * 0.11, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = pal.accent
  rect(g, -s * 0.7, -s * 0.95, s * 0.14, s * 0.35); rect(g, -s * 0.7, s * 0.6, s * 0.14, s * 0.35)
  if (!grounded) {
    g.fillStyle = 'rgba(255,170,60,0.9)'
    circle(g, -s * 0.95, 0, s * 0.12)
    g.fillStyle = 'rgba(255,220,150,0.35)'
    circle(g, -s * 1.15, 0, s * 0.18)
  }
  if (e.ammo !== undefined) {
    for (let i = 0; i < (def.ammo ?? 0); i++) {
      g.fillStyle = i < e.ammo ? '#ffd25a' : 'rgba(255,255,255,0.15)'
      rect(g, -s * 0.35 + i * s * 0.2, s * 0.3, s * 0.1, s * 0.3)
    }
  }
}

function drawShip(g: CanvasRenderingContext2D, def: UnitDef, pal: Palette, e: ClientEntity, opts: DrawOpts, k: number) {
  const s = def.size
  const len = s * 2, wid = s * 0.72
  const moving = e.state === 'move' || e.state === 'return' || e.state === 'toDeposit'
  if (def.id === 'submarine') {
    g.save()
    g.globalAlpha *= 0.75
    g.fillStyle = grad(g, 0, -wid, 0, wid, '#4b535c', '#22272c')
    g.beginPath(); g.ellipse(0, 0, len / 2, wid * 0.55, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#1c2024'
    rrect(g, -s * 0.25, -wid * 0.22, s * 0.55, wid * 0.44, wid * 0.1)
    g.fillStyle = pal.accent
    rect(g, -s * 0.2, -wid * 0.05, s * 0.4, wid * 0.1)
    g.restore()
    return
  }
  // Kielwasser
  if (moving) {
    g.fillStyle = 'rgba(255,255,255,0.22)'
    poly(g, [-len / 2, -wid * 0.35, -len * 1.6, -wid * 1.3, -len * 1.6, wid * 1.3, -len / 2, wid * 0.35])
    g.fillStyle = 'rgba(255,255,255,0.5)'
    poly(g, [len * 0.5, 0, len * 0.2, -wid * 0.75, len * 0.05, -wid * 0.5])
    poly(g, [len * 0.5, 0, len * 0.2, wid * 0.75, len * 0.05, wid * 0.5])
  }
  g.strokeStyle = pal.outline
  g.lineWidth = 1.1 / k
  g.fillStyle = grad(g, 0, -wid, 0, wid, '#8e9498', '#4c5256')
  poly(g, [len / 2, 0, len * 0.28, -wid / 2, -len / 2, -wid / 2, -len / 2, wid / 2, len * 0.28, wid / 2], true)
  g.fillStyle = grad(g, 0, -wid, 0, wid, pal.light, pal.body)
  poly(g, [len * 0.44, 0, len * 0.24, -wid * 0.36, -len * 0.45, -wid * 0.36, -len * 0.45, wid * 0.36, len * 0.24, wid * 0.36])
  const bridge = (x: number, w: number, h: number) => {
    g.fillStyle = 'rgba(0,0,0,0.3)'; rect(g, x + w * 0.1, -h / 2 + h * 0.15, w, h)
    g.fillStyle = grad(g, x, -h, x + w, h, '#d8dcde', '#8a9195'); rrect(g, x, -h / 2, w, h, h * 0.1)
    g.fillStyle = 'rgba(20,40,60,0.9)'
    for (let i = 0; i < 3; i++) rect(g, x + w * 0.15 + i * w * 0.28, -h * 0.28, w * 0.16, h * 0.16)
  }
  const gun = (x: number, r: number, bl: number) => {
    g.fillStyle = 'rgba(0,0,0,0.3)'; circle(g, x + r * 0.2, r * 0.3, r)
    g.fillStyle = radial(g, x, 0, r, '#cfd4d6', '#6b7377'); circle(g, x, 0, r)
    g.fillStyle = METAL_DARK; rect(g, x, -r * 0.18, bl, r * 0.36)
  }
  switch (def.id) {
    case 'patrol':
      bridge(-len * 0.2, len * 0.3, wid * 0.5)
      gun(len * 0.2, wid * 0.16, len * 0.2)
      break
    case 'destroyer':
      bridge(-len * 0.22, len * 0.36, wid * 0.56)
      gun(len * 0.28, wid * 0.22, len * 0.2); gun(-len * 0.38, wid * 0.2, len * 0.16)
      g.fillStyle = '#b8bec2'; rect(g, -len * 0.05, -wid * 0.08, len * 0.08, wid * 0.16)
      break
    case 'cruiser':
      bridge(-len * 0.16, len * 0.3, wid * 0.6)
      gun(len * 0.32, wid * 0.24, len * 0.18); gun(len * 0.12, wid * 0.24, len * 0.18); gun(-len * 0.38, wid * 0.24, len * 0.18)
      g.fillStyle = '#b8bec2'; rect(g, -len * 0.06, -wid * 0.1, len * 0.06, wid * 0.2)
      break
    case 'landingship':
      bridge(-len * 0.42, len * 0.2, wid * 0.6)
      g.fillStyle = '#5c6367'; rect(g, -len * 0.15, -wid * 0.36, len * 0.55, wid * 0.72)
      g.fillStyle = '#3f4548'; poly(g, [len * 0.4, -wid * 0.36, len * 0.5, 0, len * 0.4, wid * 0.36])
      if (e.cargo) { g.fillStyle = '#fff'; for (let i = 0; i < e.cargo; i++) circle(g, -len * 0.1 + (i % 4) * len * 0.12, -wid * 0.2 + Math.floor(i / 4) * wid * 0.4, s * 0.06) }
      break
  }
  g.fillStyle = pal.accent
  rect(g, -len * 0.5, -wid * 0.5, len * 0.06, wid)
}

// ---------------------------------------------------------------- Gebäude

/** Grundkörper: Platte, Schatten, Wände, Dach mit Paneelen. */
function buildingBody(g: CanvasRenderingContext2D, pal: Palette, s: number, k: number, opts: DrawOpts, apron = 1.25) {
  const h = s * 0.26
  // Betonplatte
  g.fillStyle = '#7c8280'
  rrect(g, -s * apron, -s * apron, s * apron * 2, s * apron * 2, s * 0.08)
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 1 / k
  g.strokeRect(-s * apron + s * 0.05, -s * apron + s * 0.05, s * apron * 2 - s * 0.1, s * apron * 2 - s * 0.1)
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  for (let i = 1; i < 4; i++) { const t = -s * apron + (s * apron * 2) * i / 4; g.beginPath(); g.moveTo(t, -s * apron); g.lineTo(t, s * apron); g.moveTo(-s * apron, t); g.lineTo(s * apron, t); g.stroke() }
  // Weicher Schatten
  if (!opts.ghost) {
    g.fillStyle = 'rgba(0,0,0,0.14)'; rrect(g, -s + s * 0.2, -s + s * 0.3, s * 2 + s * 0.3, s * 2 + s * 0.3, s * 0.15)
    g.fillStyle = 'rgba(0,0,0,0.28)'; rect(g, -s + s * 0.3, -s + s * 0.38, s * 2, s * 2)
  }
  // Wände: Front (unten) mit Fenstern und Tor, Seite (rechts) dunkler
  g.fillStyle = pal.wall
  rect(g, -s, -s, s * 2, s * 2)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  rect(g, s - h, -s, h, s * 2)
  const front = s - h
  g.fillStyle = 'rgba(255,255,255,0.06)'
  rect(g, -s, front, s * 2, h)
  g.fillStyle = 'rgba(120,190,240,0.55)'
  const wn = Math.max(3, Math.round(s / 12))
  for (let i = 0; i < wn; i++) {
    const wx = -s + s * 0.18 + (s * 2 - s * 0.36) * (i + 0.5) / wn
    rect(g, wx - s * 0.05, front + h * 0.3, s * 0.1, h * 0.35)
  }
  g.fillStyle = 'rgba(0,0,0,0.45)'
  rect(g, -s * 0.16, front + h * 0.25, s * 0.32, h * 0.75)
  // Dach
  g.fillStyle = grad(g, -s - h, -s - h, s - h, s - h, pal.roofLight, pal.roof)
  g.strokeStyle = pal.outline
  g.lineWidth = 1.2 / k
  rect(g, -s - h, -s - h, s * 2, s * 2)
  g.strokeRect(-s - h, -s - h, s * 2, s * 2)
  // Dachpaneele
  g.strokeStyle = 'rgba(0,0,0,0.13)'
  g.lineWidth = 1 / k
  const n = 5
  for (let i = 1; i < n; i++) {
    const t = -s - h + (s * 2) * i / n
    g.beginPath(); g.moveTo(t, -s - h); g.lineTo(t, s - h); g.moveTo(-s - h, t); g.lineTo(s - h, t); g.stroke()
  }
  g.fillStyle = 'rgba(255,255,255,0.07)'
  rect(g, -s - h, -s - h, s * 2, s * 0.35)
  g.translate(-h, -h)
}

function scorch(g: CanvasRenderingContext2D, s: number, e: ClientEntity) {
  const f = e.hp / e.maxHp
  if (f >= 0.6) return
  const n = f < 0.3 ? 4 : 2
  for (let i = 0; i < n; i++) {
    const a = (e.id * 0.7 + i * 2.1) % (Math.PI * 2), r = s * (0.3 + ((e.id * 13 + i * 7) % 10) / 20)
    g.fillStyle = 'rgba(15,12,10,0.55)'
    circle(g, Math.cos(a) * r, Math.sin(a) * r, s * 0.22)
  }
}

function drawBuilding(g: CanvasRenderingContext2D, def: BuildingDef, pal: Palette, opts: DrawOpts, e: ClientEntity, k: number) {
  const s = def.size
  const t = opts.time
  if (def.category === 'defense') {
    drawDefense(g, def, pal, opts, e, k)
    return
  }
  g.save()
  buildingBody(g, pal, s, k, opts, def.id === 'airfield' ? 1.1 : 1.25)
  const dark = pal.wall
  g.strokeStyle = pal.outline
  g.lineWidth = 1 / k
  switch (def.id) {
    case 'command': {
      // Helipad
      g.fillStyle = '#45494c'; circle(g, 0, s * 0.05, s * 0.52)
      g.strokeStyle = '#d8d8d8'; g.lineWidth = s * 0.05; ring(g, 0, s * 0.05, s * 0.4)
      g.fillStyle = '#d8d8d8'; rect(g, -s * 0.12, -s * 0.13, s * 0.06, s * 0.36); rect(g, s * 0.06, -s * 0.13, s * 0.06, s * 0.36); rect(g, -s * 0.12, 0.02 * s, s * 0.24, s * 0.06)
      // Kommandoflügel
      g.fillStyle = dark; rrect(g, -s * 0.9, -s * 0.9, s * 0.7, s * 0.5, s * 0.05)
      g.fillStyle = 'rgba(80,160,220,0.6)'; for (let i = 0; i < 4; i++) rect(g, -s * 0.84 + i * s * 0.16, -s * 0.82, s * 0.1, s * 0.12)
      // Antennenmast
      g.fillStyle = '#e0e0e0'; rect(g, s * 0.62, -s * 0.9, s * 0.07, s * 0.62)
      g.strokeStyle = '#e0e0e0'; g.lineWidth = s * 0.03
      g.beginPath(); g.moveTo(s * 0.65, -s * 0.9); g.lineTo(s * 0.5, -s * 0.4); g.moveTo(s * 0.65, -s * 0.9); g.lineTo(s * 0.8, -s * 0.4); g.stroke()
      g.fillStyle = Math.sin(t * 4) > 0 ? '#ff4040' : '#802020'; circle(g, s * 0.655, -s * 0.92, s * 0.06)
      // Schüssel
      g.fillStyle = '#cfd4d6'; g.beginPath(); g.ellipse(-s * 0.55, s * 0.55, s * 0.22, s * 0.16, -0.5, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#7d8488'; circle(g, -s * 0.55, s * 0.55, s * 0.06)
      break
    }
    case 'power': {
      g.fillStyle = dark; rrect(g, -s * 0.85, -s * 0.3, s * 1.05, s * 1.1, s * 0.05)
      g.fillStyle = '#2b2f31'; for (let i = 0; i < 3; i++) rect(g, -s * 0.75 + i * s * 0.32, s * 0.55, s * 0.2, s * 0.15)
      for (const cy of [-s * 0.45, s * 0.35]) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; circle(g, s * 0.55, cy + s * 0.06, s * 0.3)
        g.fillStyle = radial(g, s * 0.5, cy, s * 0.3, '#d9dde0', '#8b9195'); circle(g, s * 0.5, cy, s * 0.3)
        g.fillStyle = '#3a3f42'; circle(g, s * 0.5, cy, s * 0.15)
        g.fillStyle = 'rgba(255,255,255,0.35)'; circle(g, s * 0.5, cy, s * 0.06)
      }
      g.fillStyle = '#ffd25a'
      poly(g, [-s * 0.35, -s * 0.1, -s * 0.12, -s * 0.1, -s * 0.22, s * 0.18, -s * 0.02, s * 0.18, -s * 0.45, s * 0.62, -s * 0.3, s * 0.28, -s * 0.5, s * 0.28])
      g.strokeStyle = '#2b2f31'; g.lineWidth = s * 0.03
      g.beginPath(); g.moveTo(s * 0.2, -s * 0.45); g.lineTo(s * 0.2, s * 0.35); g.stroke()
      break
    }
    case 'refinery': {
      g.fillStyle = dark; rrect(g, -s * 0.88, -s * 0.88, s * 0.95, s * 1.76, s * 0.05)
      g.fillStyle = '#1b2226'; rect(g, -s * 0.8, -s * 0.2, s * 0.7, s * 0.55)
      g.fillStyle = Math.sin(t * 3) > -0.3 ? '#4fc8ff' : '#2b7ea0'; rect(g, -s * 0.78, -s * 0.15, s * 0.66, s * 0.08)
      for (let i = 0; i < 3; i++) {
        const cy = -s * 0.55 + i * s * 0.55
        g.fillStyle = 'rgba(0,0,0,0.3)'; circle(g, s * 0.55, cy + s * 0.06, s * 0.26)
        g.fillStyle = radial(g, s * 0.5, cy, s * 0.26, '#cfe8d8', '#5f8f77'); circle(g, s * 0.5, cy, s * 0.26)
        g.fillStyle = 'rgba(0,0,0,0.25)'; circle(g, s * 0.5, cy, s * 0.08)
      }
      g.strokeStyle = '#b8c0c4'; g.lineWidth = s * 0.05
      g.beginPath(); g.moveTo(s * 0.5, -s * 0.55); g.lineTo(s * 0.5, s * 0.55); g.moveTo(s * 0.24, 0); g.lineTo(s * 0.05, 0); g.stroke()
      g.fillStyle = '#4a4f52'; rect(g, -s * 0.2, -s * 0.85, s * 0.14, s * 0.4)
      break
    }
    case 'barracks': {
      for (const y of [-s * 0.72, s * 0.08]) {
        g.fillStyle = dark; rrect(g, -s * 0.85, y, s * 1.7, s * 0.5, s * 0.04)
        g.fillStyle = 'rgba(255,255,255,0.15)'; rect(g, -s * 0.85, y, s * 1.7, s * 0.1)
        g.fillStyle = 'rgba(80,160,220,0.6)'; for (let i = 0; i < 6; i++) rect(g, -s * 0.78 + i * s * 0.28, y + s * 0.3, s * 0.12, s * 0.12)
      }
      g.fillStyle = '#e0e0e0'; rect(g, s * 0.72, -s * 0.95, s * 0.06, s * 0.7)
      g.fillStyle = pal.accent
      poly(g, [s * 0.78, -s * 0.95, s * 1.1 + Math.sin(t * 5) * s * 0.04, -s * 0.85, s * 0.78, -s * 0.72])
      break
    }
    case 'factory': {
      for (let i = 0; i < 4; i++) {
        const x = -s * 0.85 + i * s * 0.42
        g.fillStyle = dark; poly(g, [x, -s * 0.78, x + s * 0.4, -s * 0.78, x + s * 0.4, -s * 0.3])
        g.fillStyle = 'rgba(120,200,255,0.5)'; poly(g, [x + s * 0.05, -s * 0.72, x + s * 0.33, -s * 0.72, x + s * 0.33, -s * 0.4])
      }
      g.fillStyle = '#1c1f22'; rrect(g, -s * 0.4, s * 0.3, s * 0.8, s * 0.6, s * 0.04)
      g.fillStyle = pal.accent; for (let i = 0; i < 4; i++) rect(g, -s * 0.36 + i * s * 0.2, s * 0.32, s * 0.1, s * 0.06)
      g.fillStyle = '#c0c6ca'; rect(g, -s * 0.9, -s * 0.1, s * 1.8, s * 0.06)
      g.fillStyle = '#4a4f52'; rect(g, s * 0.6, -s * 0.05, s * 0.2, s * 0.3)
      g.fillStyle = 'rgba(255,255,255,0.25)'; circle(g, s * 0.7, s * 0.1, s * 0.05)
      break
    }
    case 'radar': {
      g.fillStyle = dark; rrect(g, -s * 0.75, -s * 0.15, s * 1.5, s * 0.95, s * 0.05)
      g.fillStyle = 'rgba(80,160,220,0.6)'; for (let i = 0; i < 4; i++) rect(g, -s * 0.6 + i * s * 0.35, s * 0.5, s * 0.15, s * 0.12)
      g.fillStyle = '#5c6367'; circle(g, 0, -s * 0.25, s * 0.28)
      g.save(); g.translate(0, -s * 0.25); g.rotate(t * 1.2)
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(s * 0.08, s * 0.1, s * 0.6, -1.0, 1.0); g.lineTo(s * 0.08, s * 0.1); g.closePath(); g.fill()
      g.fillStyle = grad(g, -s * 0.6, 0, s * 0.6, 0, '#eef1f2', '#9aa2a6'); g.beginPath(); g.arc(0, 0, s * 0.6, -1.0, 1.0); g.lineTo(0, 0); g.closePath(); g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1 / k; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(0, 0, s * 0.15 * i, -1.0, 1.0); g.stroke() }
      g.fillStyle = pal.accent; rect(g, 0, -s * 0.035, s * 0.55, s * 0.07)
      g.restore()
      g.fillStyle = '#e0e0e0'; rect(g, -s * 0.7, -s * 0.9, s * 0.05, s * 0.75); rect(g, s * 0.65, -s * 0.9, s * 0.05, s * 0.75)
      g.fillStyle = Math.sin(t * 6) > 0 ? '#ff4040' : '#802020'; circle(g, -s * 0.675, -s * 0.92, s * 0.05); circle(g, s * 0.675, -s * 0.92, s * 0.05)
      break
    }
    case 'airfield': {
      g.fillStyle = '#3d423f'; rect(g, -s * 0.95, -s * 0.4, s * 1.9, s * 0.8)
      g.fillStyle = '#e8e8e8'
      for (let i = 0; i < 8; i++) rect(g, -s * 0.9 + i * s * 0.24, -s * 0.03, s * 0.14, s * 0.06)
      for (let i = 0; i < 5; i++) { rect(g, -s * 0.93, -s * 0.36 + i * s * 0.15, s * 0.12, s * 0.06); rect(g, s * 0.81, -s * 0.36 + i * s * 0.15, s * 0.12, s * 0.06) }
      g.fillStyle = 'rgba(255,255,255,0.35)'; rect(g, -s * 0.95, -s * 0.4, s * 1.9, s * 0.03); rect(g, -s * 0.95, s * 0.37, s * 1.9, s * 0.03)
      for (const x of [-s * 0.85, s * 0.05]) { g.fillStyle = dark; rrect(g, x, s * 0.5, s * 0.8, s * 0.4, s * 0.06); g.fillStyle = 'rgba(255,255,255,0.15)'; rect(g, x, s * 0.5, s * 0.8, s * 0.08) }
      g.fillStyle = '#5c6367'; circle(g, s * 0.75, -s * 0.7, s * 0.2); g.fillStyle = 'rgba(80,160,220,0.7)'; circle(g, s * 0.75, -s * 0.7, s * 0.12)
      g.fillStyle = Math.sin(t * 8) > 0.5 ? '#ffd25a' : '#6b5a20'; for (let i = 0; i < 6; i++) circle(g, -s * 0.85 + i * s * 0.34, -s * 0.5, s * 0.03)
      break
    }
    case 'shipyard': {
      g.fillStyle = '#1f4f7a'; rect(g, -s * 0.3, -s * 0.92, s * 1.22, s * 0.95)
      g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 5; i++) rect(g, -s * 0.25 + i * s * 0.24, -s * 0.9 + (i % 2) * s * 0.3, s * 0.15, s * 0.04)
      g.fillStyle = dark; rrect(g, -s * 0.88, -s * 0.88, s * 0.5, s * 1.76, s * 0.05); rrect(g, -s * 0.4, s * 0.15, s * 1.28, s * 0.72, s * 0.05)
      g.fillStyle = 'rgba(80,160,220,0.6)'; for (let i = 0; i < 3; i++) rect(g, -s * 0.8, -s * 0.7 + i * s * 0.5, s * 0.34, s * 0.14)
      g.strokeStyle = '#d0d5d8'; g.lineWidth = s * 0.05
      g.beginPath(); g.moveTo(-s * 0.35, -s * 0.85); g.lineTo(-s * 0.35, s * 0.05); g.moveTo(-s * 0.35, -s * 0.85); g.lineTo(s * 0.85, -s * 0.85); g.stroke()
      g.fillStyle = '#d0d5d8'; rect(g, s * 0.3, -s * 0.88, s * 0.08, s * 0.3)
      g.fillStyle = pal.accent; rect(g, -s * 0.4, s * 0.15, s * 1.28, s * 0.06)
      break
    }
    case 'tech': {
      g.fillStyle = dark
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; if (i === 0) g.moveTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8); else g.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8) } g.closePath(); g.fill()
      g.fillStyle = radial(g, 0, 0, s * 0.5, '#dfe6ea', '#6f7d86'); circle(g, 0, 0, s * 0.5)
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-s * 0.15, -s * 0.18, s * 0.18, s * 0.1, -0.6, 0, Math.PI * 2); g.fill()
      g.fillStyle = pal.accent; circle(g, 0, 0, s * 0.12)
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1 / k; ring(g, 0, 0, s * 0.62)
      g.fillStyle = '#fff'; circle(g, Math.cos(t * 2) * s * 0.62, Math.sin(t * 2) * s * 0.62, s * 0.06)
      g.fillStyle = '#e0e0e0'; for (const a of [0.5, 2.6, 4.7]) rect(g, Math.cos(a) * s * 0.85 - s * 0.03, Math.sin(a) * s * 0.85 - s * 0.03, s * 0.06, s * 0.06)
      break
    }
  }
  scorch(g, s, e)
  g.restore()
  if (e.repairing) {
    g.strokeStyle = '#7fff9f'
    g.lineWidth = 2 / k
    ring(g, 0, 0, s * (1.15 + 0.08 * Math.sin(t * 6)))
    g.fillStyle = '#7fff9f'
    g.font = `bold ${s * 0.5}px sans-serif`; g.textAlign = 'center'; g.fillText('⚒', 0, -s * 1.25)
    g.textAlign = 'left'
  }
}

function drawDefense(g: CanvasRenderingContext2D, def: BuildingDef, pal: Palette, opts: DrawOpts, e: ClientEntity, k: number) {
  const s = def.size
  // Betonsockel mit Sandsackring
  g.fillStyle = '#7c8280'; circle(g, 0, 0, s * 1.2)
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1 / k; ring(g, 0, 0, s * 1.1)
  if (!opts.ghost) { g.fillStyle = 'rgba(0,0,0,0.3)'; circle(g, s * 0.2, s * 0.25, s * 0.9) }
  if (def.id === 'bunker') {
    g.fillStyle = grad(g, -s, -s, s, s, '#8a9088', '#4f5550'); rrect(g, -s * 0.8, -s * 0.8, s * 1.6, s * 1.6, s * 0.2)
    g.strokeStyle = pal.outline; g.lineWidth = 1.2 / k; g.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6)
    g.fillStyle = '#101312'; rect(g, -s * 0.55, -s * 0.1, s * 1.1, s * 0.2); rect(g, -s * 0.1, -s * 0.55, s * 0.2, s * 1.1)
    g.fillStyle = pal.accent; rect(g, -s * 0.75, -s * 0.75, s * 0.3, s * 0.1)
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = i % 2 ? '#b8a47a' : '#a08e66'; circle(g, Math.cos(a) * s * 1.02, Math.sin(a) * s * 1.02, s * 0.14) }
    return
  }
  g.fillStyle = radial(g, 0, 0, s * 0.9, pal.light, pal.dark); circle(g, 0, 0, s * 0.9)
  g.strokeStyle = pal.outline; g.lineWidth = 1.2 / k; ring(g, 0, 0, s * 0.9)
  g.save()
  g.rotate(e.turret)
  switch (def.id) {
    case 'turret': turret(g, pal, 0, 0, s * 0.5, k, [0], s * 1.4, s * 0.24); break
    case 'aagun': turret(g, pal, 0, 0, s * 0.5, k, [-s * 0.2, s * 0.2], s * 1.3, s * 0.15); g.fillStyle = '#c9d1d9'; circle(g, -s * 0.3, -s * 0.3, s * 0.14); break
    case 'sam':
      g.fillStyle = METAL; rrect(g, -s * 0.55, -s * 0.55, s * 1.1, s * 1.1, s * 0.1)
      for (const y of [-s * 0.42, s * 0.06]) { g.fillStyle = '#e6e6e6'; rrect(g, -s * 0.15, y, s * 1.15, s * 0.36, s * 0.08); g.fillStyle = '#c0392b'; rect(g, s * 0.8, y + s * 0.08, s * 0.16, s * 0.2) }
      break
    case 'coastal': turret(g, pal, 0, 0, s * 0.6, k, [0], s * 1.7, s * 0.34); break
  }
  g.restore()
  if (e.off) { g.fillStyle = '#ff5a36'; circle(g, s * 0.75, -s * 0.75, s * 0.28); g.fillStyle = '#fff'; g.font = `bold ${s * 0.45}px sans-serif`; g.textAlign = 'center'; g.fillText('⚡', s * 0.75, -s * 0.6); g.textAlign = 'left' }
  scorch(g, s, e)
}

// ---------------------------------------------------------------- Lagerstätten

export function drawDeposit(g: CanvasRenderingContext2D, e: ClientEntity, sx: number, sy: number, pxPerM: number, time: number) {
  const amount = e.amount ?? 0
  const frac = Math.min(1, amount / 50_000)
  const worldR = 40 + frac * 60
  const r = Math.max(5, worldR * pxPerM)
  g.save()
  g.translate(sx, sy)
  g.fillStyle = 'rgba(30,50,60,0.35)'
  g.beginPath(); g.ellipse(0, r * 0.15, r * 1.15, r * 0.9, 0, 0, Math.PI * 2); g.fill()
  const n = r > 12 ? 9 : r > 6 ? 4 : 1
  for (let i = 0; i < n; i++) {
    const a = i * 0.83 + e.id * 0.37, d = n > 1 ? r * 0.62 * ((i % 3) / 3 + 0.3) : 0
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d * 0.8
    const cr = n > 1 ? r * (0.22 + ((i * 7) % 5) / 25) : r * 0.7
    const gr = g.createLinearGradient(cx - cr, cy - cr, cx + cr * 0.6, cy + cr)
    gr.addColorStop(0, `rgba(200,250,255,${0.6 + frac * 0.4})`)
    gr.addColorStop(0.5, `rgba(70,200,240,${0.7 + frac * 0.3})`)
    gr.addColorStop(1, `rgba(20,90,130,${0.8})`)
    g.fillStyle = gr
    g.beginPath(); g.moveTo(cx, cy - cr * 1.2); g.lineTo(cx + cr * 0.7, cy - cr * 0.1); g.lineTo(cx + cr * 0.25, cy + cr * 0.8); g.lineTo(cx - cr * 0.45, cy + cr * 0.6); g.lineTo(cx - cr * 0.7, cy - cr * 0.2); g.closePath(); g.fill()
    if (r > 12) { g.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.max(0, Math.sin(time * 3 + i))})`; circle(g, cx - cr * 0.2, cy - cr * 0.5, cr * 0.16) }
  }
  g.restore()
}

// ---------------------------------------------------------------- Symbole für die Seitenleiste

export function drawIcon(def: Def, color: string, w = 96, h = 60): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const g = canvas.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#2a3530'); bg.addColorStop(1, '#141c18')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < w; i += 8) g.fillRect(i, 0, 1, h)
  if (def.kind === 'building' || ['service_robot','robot_dog','recon_drone'].includes(def.id)) { drawModelIcon(g,def,color,w,h); return canvas }
  const pal = palette(color)
  const fake: ClientEntity = {
    id: 0, kind: 'u', type: def.id, owner: 0, x: 0, y: 0, tx: 0, ty: 0, heading: -Math.PI / 5, thead: 0, turret: -Math.PI / 5, speed: 0, samples: [],
    hp: def.hp, maxHp: def.hp, visible: true, ghost: false, lastUpdate: 0, seen: 0, def, ammo: (def as UnitDef).ammo, state: 'move',
  }
  const k = (Math.min(w, h) * 0.72) / (def.size * 2)
  g.save()
  g.translate(w / 2, h / 2)
  g.scale(k, k)
  g.lineWidth = 1 / k
  drawUnitWithShadow(g, def, pal, { time: 0.4, ghost: false, own: true }, fake, k)
  g.restore()
  return canvas
}

export { DEFS }

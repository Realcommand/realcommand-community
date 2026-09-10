import { WORLD_W, WORLD_H } from '../../shared/constants.ts'
import { formatDistance } from '../../shared/geo.ts'
import type { BaseInfo, ContactWire, RadarStationWire } from '../../shared/protocol.ts'
import type { ClientEntity } from '../state.ts'
import type { ViewRect } from '../camera.ts'

export interface RadarRect { x0: number, y0: number, w: number, h: number }
type RadarCamera = { x: number, y: number, width: number, height: number, mpp: number }

export function radarBounds(camera: RadarCamera, world: boolean): RadarRect {
  if (world) return { x0: 0, y0: 0, w: WORLD_W, h: WORLD_H }
  // Drei sichtbare Kartenausschnitte; auch im Hochformat bleibt der ganze
  // Kameraausschnitt enthalten. Eine nahe Basis verschwindet nicht in 12 km.
  const w = Math.min(WORLD_W, Math.max(1000, camera.width * camera.mpp * 3, camera.height * camera.mpp * 6))
  const h = w / 2
  return {
    x0: Math.max(0, Math.min(WORLD_W - w, camera.x - w / 2)),
    y0: Math.max(0, Math.min(WORLD_H - h, camera.y - h / 2)), w, h,
  }
}

export function radarWorldPoint(rect: RadarRect, fx: number, fy: number): [number, number] {
  return [rect.x0 + Math.max(0, Math.min(1, fx)) * rect.w, rect.y0 + Math.max(0, Math.min(1, fy)) * rect.h]
}

/** Eine gemeinsame Fläche: überlappende Sensoren erhöhen niemals die Helligkeit. */
export function paintRadarCoverage(g: CanvasRenderingContext2D, stations: readonly RadarStationWire[], rect: RadarRect, width: number, height: number) {
  g.save()
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = 'rgba(80,180,190,0.07)'
  g.beginPath()
  for (const station of stations) {
    const x = (station.x - rect.x0) / rect.w * width, y = (station.y - rect.y0) / rect.h * height
    const rx = station.r / rect.w * width, ry = station.r / rect.h * height
    if (rx < 1 || x + rx < 0 || y + ry < 0 || x - rx > width || y - ry > height) continue
    g.moveTo(x + rx, y)
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  }
  g.fill()
  g.restore()
}

type RadarEntity = Pick<ClientEntity, 'id' | 'kind' | 'owner' | 'x' | 'y' | 'visible' | 'ghost' | 'def' | 'inside'>
interface RadarOverlay {
  rect: RadarRect
  width: number
  height: number
  viewport: ViewRect
  world: boolean
  myId: number
  entities: Iterable<RadarEntity>
  bases: readonly BaseInfo[]
  contacts: readonly ContactWire[]
  selected: ReadonlySet<number>
}

export const RADAR_COLORS = { own: '#79d5ff', foreign: '#ffad79', contact: '#f5d77e', stale: '#a2aab2', resource: '#a0bc8e' }

export function paintRadarOverlay(g: CanvasRenderingContext2D, p: RadarOverlay) {
  const { rect, width: W, height: H } = p
  const px = (x: number) => (x - rect.x0) / rect.w * W
  const py = (y: number) => (y - rect.y0) / rect.h * H
  const inside = (x: number, y: number) => x >= rect.x0 && x <= rect.x0 + rect.w && y >= rect.y0 && y <= rect.y0 + rect.h
  const diamond = (x: number, y: number, r: number) => {
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath()
  }
  g.save()
  // Ruhiges Raster statt animiertem Lichtstreifen über den Kontakten.
  g.strokeStyle = 'rgba(207,226,234,0.09)'; g.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(i * W / 4, 0); g.lineTo(i * W / 4, H)
    g.moveTo(0, i * H / 4); g.lineTo(W, i * H / 4); g.stroke()
  }
  for (const entity of p.entities) {
    if (entity.inside !== undefined || !inside(entity.x, entity.y) || (!entity.visible && !entity.ghost && entity.owner !== p.myId)) continue
    if (entity.kind === 'd' && p.world) continue
    const x = px(entity.x), y = py(entity.y), own = entity.owner === p.myId
    g.fillStyle = entity.ghost ? RADAR_COLORS.stale : entity.kind === 'd' ? RADAR_COLORS.resource : own ? RADAR_COLORS.own : RADAR_COLORS.foreign
    g.strokeStyle = '#071017'; g.lineWidth = 2
    const size = p.world ? 3 : Math.max(4, Math.min(9, (entity.def?.size ?? 0) * 2 / rect.w * W))
    if (entity.kind === 'b') {
      if (entity.ghost) { g.strokeStyle = RADAR_COLORS.stale; g.lineWidth = 1; g.strokeRect(x - size / 2, y - size / 2, size, size) }
      else { g.strokeRect(x - size / 2, y - size / 2, size, size); g.fillRect(x - size / 2, y - size / 2, size, size) }
    } else {
      g.beginPath(); g.arc(x, y, entity.kind === 'd' ? 1.5 : p.world ? 1.5 : 2.5, 0, Math.PI * 2); g.stroke(); g.fill()
    }
    if (p.selected.has(entity.id)) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.strokeRect(x - 5, y - 5, 10, 10) }
  }
  for (const contact of p.contacts) {
    if (!inside(contact.x, contact.y)) continue
    diamond(px(contact.x), py(contact.y), 4)
    g.strokeStyle = '#071017'; g.lineWidth = 3; g.stroke()
    g.strokeStyle = RADAR_COLORS.contact; g.lineWidth = 1.5; g.stroke()
  }
  for (const base of p.bases) {
    if (!inside(base.x, base.y)) continue
    const x = px(base.x), y = py(base.y)
    g.beginPath(); g.rect(x - 4, y - 4, 8, 8)
    g.fillStyle = '#0a1822'; g.fill()
    g.strokeStyle = base.stale ? RADAR_COLORS.stale : base.player === p.myId ? RADAR_COLORS.own : RADAR_COLORS.foreign
    g.lineWidth = 2; g.stroke()
    g.fillStyle = g.strokeStyle
    g.fillRect(x - 2, y - 2, 4, 4)
  }
  const x0 = Math.max(1, px(p.viewport.x0)), y0 = Math.max(1, py(p.viewport.y0))
  const x1 = Math.min(W - 1, px(p.viewport.x1)), y1 = Math.min(H - 1, py(p.viewport.y1))
  if (x1 >= x0 && y1 >= y0) {
    const w = Math.max(4, x1 - x0), h = Math.max(4, y1 - y0)
    g.strokeStyle = '#071017'; g.lineWidth = 3; g.strokeRect(x0, y0, w, h)
    g.strokeStyle = '#f2f6f8'; g.lineWidth = 1; g.strokeRect(x0, y0, w, h)
  }
  g.font = '600 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'top'
  g.fillStyle = '#081019'; g.fillRect(6, 6, 22, 20)
  g.fillStyle = '#d9e6ea'; g.fillText('N', 13, 10)
  // Ein ablesbarer Maßstabsbalken, keine bloße Kilometerzahl ohne Bezug.
  const target = rect.w / 4, power = 10 ** Math.floor(Math.log10(target))
  const length = [5, 2, 1].map(n => n * power).find(n => n <= target) ?? power
  const bar = length / rect.w * W
  g.fillStyle = '#081019'; g.fillRect(6, H - 30, Math.max(bar + 12, 64), 24)
  g.fillStyle = '#d9e6ea'; g.fillText(formatDistance(length), 12, H - 27)
  g.strokeStyle = '#d9e6ea'; g.lineWidth = 1.5
  g.beginPath(); g.moveTo(12, H - 14); g.lineTo(12, H - 10); g.lineTo(12 + bar, H - 10); g.lineTo(12 + bar, H - 14); g.stroke()
  g.restore()
}

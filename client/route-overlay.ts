import type { ClientEntity } from './state.ts'

export function drawUnitRoute(g: CanvasRenderingContext2D, project: (x: number, y: number) => [number, number], unit: ClientEntity) {
  const points = unit.route?.length ? unit.route : unit.dx !== undefined && unit.dy !== undefined
    ? [{ k: unit.target ? 'attackmove' as const : 'move' as const, x: unit.dx, y: unit.dy }] : []
  if (!points.length) return
  g.save()
  g.lineWidth = 1
  g.font = '11px system-ui'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  let [x, y] = project(unit.x, unit.y)
  for (const [index, point] of points.entries()) {
    const [tx, ty] = project(point.x, point.y)
    g.strokeStyle = point.k === 'attackmove' ? 'rgba(255,125,76,.85)' : 'rgba(120,235,170,.8)'
    g.setLineDash([4, 4])
    g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke()
    g.setLineDash([])
    g.fillStyle = '#14221f'
    g.beginPath(); g.arc(tx, ty, 8, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#effaf4'; g.fillText(String(index + 1), tx, ty)
    x = tx; y = ty
  }
  if (unit.routeRepeat) {
    const [firstX, firstY] = project(points[0].x, points[0].y)
    if (points.length > 1) {
      g.strokeStyle = 'rgba(120,235,170,.8)'; g.setLineDash([4, 4])
      g.beginPath(); g.moveTo(x, y); g.lineTo(firstX, firstY); g.stroke()
    }
    g.fillStyle = '#effaf4'; g.fillText('↻', firstX, firstY - 18)
  }
  g.restore()
}

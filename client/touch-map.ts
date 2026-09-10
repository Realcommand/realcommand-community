interface TouchMapActions {
  pan(dx: number, dy: number): void
  zoom(factor: number, x: number, y: number): void
  tap(x: number, y: number): void
  start?(): void
  end?(): void
}

/** Ein Finger verschiebt die Karte, zwei zoomen. Nur ein ruhiger Tap wählt aus. */
export function bindTouchMap(canvas: HTMLCanvasElement, actions: TouchMapActions) {
  return bindMapGestures(canvas, actions, true)
}

/** Gemeinsame Gesten für Spielkarte und unabhängig bedienbares Radar. */
export function bindMapGestures(canvas: HTMLCanvasElement, actions: TouchMapActions, touchOnly = false) {
  const points = new Map<number, { x: number, y: number }>()
  let origin = { x: 0, y: 0 }, moved = false
  const distance = () => {
    const [a, b] = [...points.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const down = (event: PointerEvent) => {
    if (touchOnly ? event.pointerType !== 'touch' : event.pointerType !== 'touch' && event.button !== 0) return
    event.preventDefault() // Keine zusätzlichen synthetischen Mausaktionen.
    event.stopPropagation()
    if (!points.size) actions.start?.()
    if (!points.size) { origin = { x: event.clientX, y: event.clientY }; moved = false }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.size > 1) moved = true
    canvas.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    const before = points.get(event.pointerId)
    if (!before) return
    event.preventDefault()
    const oldDistance = distance()
    const oldPoints = [...points.values()]
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.size === 1) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) moved = true
      if (moved) actions.pan(before.x - event.clientX, before.y - event.clientY)
    } else {
      const [a, b] = [...points.values()], nextDistance = distance()
      actions.pan((oldPoints[0].x + oldPoints[1].x - a.x - b.x) / 2, (oldPoints[0].y + oldPoints[1].y - a.y - b.y) / 2)
      if (oldDistance > 0 && nextDistance > 0) actions.zoom(oldDistance / nextDistance, (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
  }
  const up = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return
    event.preventDefault()
    points.delete(event.pointerId)
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (event.type !== 'pointerup' || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) moved = true
    if (!points.size && !moved) actions.tap(event.clientX, event.clientY)
    if (!points.size) actions.end?.()
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('lostpointercapture', up)
  return () => {
    points.clear()
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', up)
    canvas.removeEventListener('lostpointercapture', up)
  }
}

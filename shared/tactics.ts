/** Real Command tactical rules, shared by simulation, API and HUD. */
export const MAX_ROUTE_WAYPOINTS = 16

export interface RouteWaypoint { k: 'move' | 'attackmove', x: number, y: number }

export const FIRE_DISCIPLINES = [
  { id: 'free', label: 'Feuer frei', description: 'Gegner in Waffenreichweite selbstständig bekämpfen.' },
  { id: 'return', label: 'Nur erwidern', description: 'Nur den tatsächlichen Angreifer in Waffenreichweite bekämpfen; nicht verfolgen.' },
  { id: 'hold', label: 'Feuer halten', description: 'Nicht selbstständig schießen. Ein direkter Angriffsbefehl gilt weiterhin.' },
] as const
export type FireDiscipline = typeof FIRE_DISCIPLINES[number]['id']

export function isFireDiscipline(value: unknown): value is FireDiscipline {
  return FIRE_DISCIPLINES.some(mode => mode.id === value)
}

/** A route is a list of destinations, never a nested client-supplied activity. */
export function isRouteWaypoint(order: { k: string, x?: number, y?: number } | undefined): order is RouteWaypoint {
  return !!order && (order.k === 'move' || order.k === 'attackmove') && Number.isFinite(order.x) && Number.isFinite(order.y)
}

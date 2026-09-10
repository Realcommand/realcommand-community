import type { ClientEntity } from '../state.ts'
import type { UnitDef } from '../../shared/data.ts'
import { MAX_UNITS_PER_PLAYER } from '../../shared/constants.ts'

export const UNIT_FILTERS = [
  { value: 'all', label: 'Alle Einheiten' },
  { value: 'aircraft', label: 'Luftfahrzeuge' },
  { value: 'vehicle', label: 'Fahrzeuge' },
  { value: 'infantry', label: 'Infanterie' },
  { value: 'ship', label: 'Schiffe' },
] as const
export type UnitFilter = typeof UNIT_FILTERS[number]['value']

const STATE_LABELS: Record<string, string> = {
  idle: 'bereit', move: 'unterwegs', attack: 'im Gefecht', seek: 'sucht Lagerstätte', toDeposit: 'fährt zur Lagerstätte',
  harvest: 'baut ab', return: 'liefert ab', unload: 'entlädt', deploy: 'entfaltet sich', inside: 'an Bord', rearm: 'rüstet nach',
  heal: 'heilt', nores: 'keine Rohstoffe gefunden', noref: 'keine Aufbereitungsanlage',
  inbound: 'im Anflug', outbound: 'dreht ab', loiter: 'kreist', parked: 'geparkt', guard: 'auf Wache',
  repair: 'repariert', no_funds: 'Reparatur wartet auf Guthaben',
}

export function unitStatus(e: Pick<ClientEntity, 'state' | 'def' | 'inside' | 'routeRepeat'>): string {
  if (e.inside !== undefined) return `an Bord von #${e.inside}`
  if ((e.def as UnitDef | undefined)?.domain === 'air') {
    if (e.state === 'return') return 'fliegt zum Flugfeld'
    if ((e.def as UnitDef).endurance) {
      if (e.state === 'rearm') return 'lädt Akku'
      if (e.state === 'loiter') return 'schwebt'
    }
  }
  if (e.routeRepeat && e.state === 'move') return 'auf Wachroute'
  return e.state ? STATE_LABELS[e.state] ?? e.state : 'bereit'
}

export function ownedUnits(entities: Iterable<ClientEntity>, owner: number, filter: UnitFilter = 'all', search = '') {
  const query = search.trim().toLocaleLowerCase('de-DE')
  return [...entities].filter(e => e.owner === owner && e.kind === 'u' && e.hp > 0 && !e.ghost
    && (filter === 'all' || e.def?.category === filter)
    && (!query || `${e.def?.name ?? e.type} #${e.id}`.toLocaleLowerCase('de-DE').includes(query)))
    .sort((a, b) => (a.def?.name ?? a.type).localeCompare(b.def?.name ?? b.type, 'de-DE') || a.id - b.id)
}

/** Passagiere bleiben in der Übersicht; Befehle erhalten sie erst nach dem Aussteigen. */
export function selectableUnitIds(entities: Iterable<ClientEntity>, owner: number, filter: UnitFilter = 'all', search = '') {
  return ownedUnits(entities, owner, filter, search).filter(e => e.inside === undefined).map(e => e.id)
}

export function normalizeUnitIds(ids: Iterable<number>): number[] {
  return [...new Set([...ids].filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b).slice(0, MAX_UNITS_PER_PLAYER)
}

export interface UnitRoute { filter: UnitFilter, search: string, unit?: number, units?: number[] }

/** Liste und gezielte Auswahl bleiben beim Neuladen und bei Browsernavigation erhalten. */
export function unitRosterNavigation(
  browser: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>,
  changed: (route: UnitRoute) => void,
) {
  const read = (): UnitRoute => {
    const params = new URL(browser.location.href).searchParams
    const filter = UNIT_FILTERS.find(f => f.value === params.get('unitType'))?.value ?? 'all'
    const raw = params.get('unit') ?? ''
    const unit = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : undefined
    const units = normalizeUnitIds((params.get('units') ?? '').split(',').filter(id => /^\d+$/.test(id)).map(Number))
    return { filter, search: (params.get('unitSearch') ?? '').slice(0, 80), unit, ...(unit === undefined && units.length ? { units } : {}) }
  }
  const restore = () => changed(read())
  browser.addEventListener('popstate', restore)
  return {
    current: read,
    set(change: Partial<UnitRoute>) {
      const route = { ...read(), ...change }
      if (change.unit !== undefined) route.units = undefined
      if (change.units !== undefined) route.unit = undefined
      const url = new URL(browser.location.href)
      for (const [key, value] of Object.entries({ unitType: route.filter === 'all' ? '' : route.filter, unitSearch: route.search.trim().slice(0, 80), unit: route.unit?.toString() ?? '', units: normalizeUnitIds(route.units ?? []).join(',') })) {
        if (value) url.searchParams.set(key, value)
        else url.searchParams.delete(key)
      }
      if (url.href !== browser.location.href) browser.history.replaceState(browser.history.state, '', url)
      restore()
    },
    dispose: () => browser.removeEventListener('popstate', restore),
  }
}

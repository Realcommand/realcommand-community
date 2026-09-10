import { h, text } from '../engine/render.ts'
import { signal } from '../engine/signal.ts'
import { Button } from '../engine/widgets.ts'
import { drawIcon } from '../sprites.ts'
import type { ClientEntity } from '../state.ts'
import { UNIT_FILTERS, ownedUnits, selectableUnitIds, normalizeUnitIds, unitRosterNavigation, unitStatus, type UnitFilter } from './unit-roster.ts'

export function unitPanel(options: { pick: (entity: ClientEntity, restoring: boolean) => void, select: (ids: number[], restoring: boolean) => void, color: () => string }) {
  let entities = new Map<number, ClientEntity>(), myId = 0, selected = new Set<number>()
  let pendingUnit: number | undefined
  let pickedFromList = false
  let routeUnit: number | undefined
  let routeUnits = ''
  let pendingUnits: number[] | undefined
  let applyingSelection = false
  const [bulk, setBulk] = signal({ count: 0, canSelect: false, canClear: false })
  const rows = new Map<number, { button: HTMLButtonElement, status: HTMLElement, hp: HTMLElement }>()
  const count = h('b', { class: 'rc-num', 'aria-live': 'polite' })
  const list = h('div', { class: 'hud-unit-list', role: 'group', 'aria-label': 'Eigene Einheiten' })
  const empty = h('p', { class: 'hud-unit-empty rc-muted' })
  const filter = h('select', { class: 'hud-unit-filter', 'aria-label': 'Einheiten filtern',
    onChange: (event: Event) => navigation.set({ filter: (event.target as HTMLSelectElement).value as UnitFilter }),
  }, ...UNIT_FILTERS.map(f => h('option', { value: f.value }, f.label))) as HTMLSelectElement
  const search = h('input', { type: 'search', class: 'hud-unit-search', placeholder: 'Name oder #ID suchen',
    'aria-label': 'Einheit suchen', maxlength: 80,
    onInput: (event: Event) => navigation.set({ search: (event.target as HTMLInputElement).value }),
  }) as HTMLInputElement
  const navigation = unitRosterNavigation(window, route => {
    filter.value = route.filter
    if (document.activeElement !== search) search.value = route.search
    const unitsKey = route.units?.join(',') ?? ''
    if (!applyingSelection && (route.unit !== routeUnit || unitsKey !== routeUnits)) {
      pendingUnit = route.unit
      pendingUnits = route.unit === undefined ? route.units ?? [] : undefined
    }
    routeUnit = route.unit
    routeUnits = unitsKey
    render()
  })
  const initial = navigation.current()
  filter.value = initial.filter; search.value = initial.search; pendingUnit = initial.unit; routeUnit = initial.unit
  pendingUnits = initial.units; routeUnits = initial.units?.join(',') ?? ''

  function selectUnits(ids: number[], restoring = false) {
    pendingUnit = undefined; pendingUnits = undefined
    selected = new Set(normalizeUnitIds(ids))
    applyingSelection = true
    try {
      options.select([...selected], restoring)
      navigation.set({ unit: undefined, units: selected.size ? [...selected] : undefined })
    } finally { applyingSelection = false }
    render()
  }

  function render() {
    if (applyingSelection) return
    const route = navigation.current()
    if (pendingUnits !== undefined && myId && (entities.size || !pendingUnits.length)) {
      const available = new Set(selectableUnitIds(entities.values(), myId))
      selectUnits(pendingUnits.filter(id => available.has(id)), true)
      return
    }
    if (pendingUnit !== undefined) {
      const entity = entities.get(pendingUnit)
      if (entity?.owner === myId && entity.kind === 'u') { pendingUnit = undefined; options.pick(entity, !pickedFromList); pickedFromList = false }
    }
    const all = ownedUnits(entities.values(), myId)
    const shown = ownedUnits(all, myId, route.filter, route.search)
    setBulk({
      count: all.filter(e => selected.has(e.id) && e.inside === undefined).length,
      canSelect: selectableUnitIds(shown, myId).length > 0,
      canClear: selected.size > 0 || route.unit !== undefined || route.units !== undefined,
    })
    count.textContent = `${shown.length} / ${all.length}`
    const ids = new Set(shown.map(e => e.id))
    for (const [id, row] of rows) if (!ids.has(id)) { row.button.remove(); rows.delete(id) }
    let previous: ChildNode | null = null
    for (const entity of shown) {
      let row = rows.get(entity.id)
      if (!row) {
        const status = h('span', { class: 'hud-unit-status' })
        const hp = h('span', { class: 'hud-unit-hp' })
        const button = h('button', { type: 'button', class: 'hud-unit',
          onClick: () => { pendingUnit = entity.id; pickedFromList = true; navigation.set({ unit: entity.id }) },
        }, entity.def ? drawIcon(entity.def, options.color(), 40, 28) : null,
        h('span', { class: 'hud-unit-text' }, h('b', `${entity.def?.name ?? entity.type} #${entity.id}`), status, hp)) as HTMLButtonElement
        row = { button, status, hp }; rows.set(entity.id, row)
      }
      const battery = entity.battery === undefined ? '' : ` · Akku ${entity.battery} %`
      row.status.textContent = unitStatus(entity) + battery
      row.hp.textContent = `${Math.ceil(entity.hp)} / ${entity.maxHp} TP`
      row.button.setAttribute('aria-label', `${entity.def?.name ?? entity.type} #${entity.id} auswählen`)
      row.button.setAttribute('aria-pressed', String(selected.has(entity.id)))
      row.button.title = entity.inside === undefined ? 'Auswählen und auf der Karte zentrieren' : 'Transporter auswählen und auf der Karte zentrieren'
      const next: ChildNode | null = previous ? previous.nextSibling : list.firstChild
      if (next !== row.button) list.insertBefore(row.button, next)
      previous = row.button
    }
    empty.textContent = all.length ? 'Keine Einheiten für diesen Filter.' : 'Noch keine eigenen Einheiten.'
    empty.hidden = shown.length > 0
  }
  const element = h('section', { class: 'hud-units', 'aria-label': 'Einheitenübersicht' },
    h('div', { class: 'hud-unit-heading' }, h('b', 'Eigene Einheiten'), count), filter, search,
    h('div', { class: 'hud-unit-bulk', role: 'group', 'aria-label': 'Mehrfachauswahl' },
      Button({ label: 'Alle markieren', size: 'sm', disabled: () => !bulk().canSelect,
        title: 'Alle steuerbaren Einheiten der gefilterten Liste markieren',
        onClick: () => { const route = navigation.current(); selectUnits(selectableUnitIds(entities.values(), myId, route.filter, route.search)) } }),
      Button({ label: 'Abwählen', size: 'sm', disabled: () => !bulk().canClear,
        title: 'Gesamte Auswahl aufheben', onClick: () => selectUnits([]) }),
    ),
    h('div', { class: 'hud-unit-selection', role: 'status' }, text(() => `${bulk().count} markiert`)), list, empty)
  return {
    element,
    update(next: Map<number, ClientEntity>, owner: number, selection: Set<number>) {
      entities = next; myId = owner; selected = selection; render()
    },
    selectionChanged(selection: Set<number>) {
      selected = selection
      if (applyingSelection) return
      const route = navigation.current()
      const ids = normalizeUnitIds(selectableUnitIds(entities.values(), myId).filter(id => selection.has(id)))
      if (pendingUnit === undefined && pendingUnits === undefined && (
        route.unit !== undefined && (selection.size !== 1 || !selection.has(route.unit))
        || route.units !== undefined && route.units.join(',') !== ids.join(',')
      )) {
        applyingSelection = true
        try { navigation.set({ unit: undefined, units: route.units && ids.length ? ids : undefined }) }
        finally { applyingSelection = false }
      }
      render()
    },
    dispose: navigation.dispose,
  }
}

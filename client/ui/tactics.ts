import { FIRE_DISCIPLINES, MAX_ROUTE_WAYPOINTS } from '../../shared/tactics.ts'
import type { Input } from '../input.ts'
import type { ClientEntity } from '../state.ts'
import { h } from '../engine/render.ts'

/** Uses the same command channel as keyboard, map clicks and agents. */
export function tacticalControls(input: Pick<Input, 'mode' | 'queued' | 'repeat' | 'beginRoute' | 'endRoute' | 'issue'>, units: ClientEntity[]) {
  const button = (label: string, title: string, action: () => void, pressed?: boolean | 'mixed') => h('button', {
    type: 'button', class: 'hud-action', title, onClick: action,
    ...(pressed === undefined ? {} : { 'aria-pressed': String(pressed) }),
  }, label)
  const lengths = units.map(unit => unit.route?.length ?? 0)
  const low = Math.min(...lengths), high = Math.max(...lengths)
  const armed = units.filter(unit => unit.def?.weapons.length)
  const routing = input.queued && (input.mode === 'move' || input.mode === 'attackmove')
  const patrols = units.filter(unit => unit.routeRepeat && unit.route?.length).length
  return h('div', { class: 'hud-tactics', 'aria-label': 'Truppensteuerung' },
    h('div', { class: 'hud-tactics-heading' }, h('b', patrols === units.length ? 'Wachroute ↻' : patrols ? 'Routen · teilweise Wache' : 'Marschroute'),
      h('span', { class: 'rc-num', 'aria-label': 'Routenziele' }, `${low === high ? high : `${low}–${high}`} / ${MAX_ROUTE_WAYPOINTS} Ziele`)),
    h('div', { class: 'hud-tactics-row' },
      button('Bewegen', 'Ein einzelnes Ziel auf der Karte anklicken', () => { input.endRoute(); input.mode = 'move' }, input.mode === 'move' && !routing),
      button('Angriffsmarsch', 'A, dann Ziel anklicken; Feuerdisziplin beachten', () => { input.endRoute(); input.mode = 'attackmove' }, input.mode === 'attackmove' && !routing),
      button('Einmalige Route', 'Neue Route: Ziele nacheinander anklicken und einmal abfahren.', () => input.beginRoute(false), routing && !input.repeat),
      button('Wachroute', 'Neue Wachroute: Ziele nacheinander anklicken. Nach dem letzten Ziel wieder zum ersten; ein Ziel bewachen.', () => input.beginRoute(true), routing && input.repeat),
      routing ? button('Fertig', 'Eingabe beenden; die beauftragte Route läuft weiter.', () => input.endRoute()) : null,
      button('Stopp', 'S – gesamte Route und Wiederholung abbrechen', () => { input.endRoute(); input.issue({ k: 'stop' }) })),
    h('p', { class: 'hud-tactics-hint' }, routing
      ? input.repeat ? 'Ziele anklicken → Fertig. Wache wiederholt die Route; Stopp bricht sie ab.' : 'Ziele anklicken → Fertig. Die Route wird einmal abgefahren.'
      : input.mode === 'move' || input.mode === 'attackmove' ? 'Ziel anklicken · Umschalt hängt weitere Ziele an.'
      : 'Umschalt + Rechtsklick: weiteres Ziel anhängen.'),
    armed.length ? h('div', { class: 'hud-fire', role: 'group', 'aria-label': 'Feuerdisziplin' },
      h('b', 'Feuerdisziplin'),
      h('div', { class: 'hud-tactics-row' }, ...FIRE_DISCIPLINES.map(mode => {
        const count = armed.filter(unit => (unit.fireDiscipline ?? 'free') === mode.id).length
        return button(mode.label, mode.description, () => input.issue({ k: 'fire', mode: mode.id }), count === armed.length ? true : count ? 'mixed' : false)
      }))) : null)
}

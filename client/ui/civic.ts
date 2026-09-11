import { h } from '../engine/render.ts'
import { CIVIC_BUILDINGS, GOODS, type CivicReport, type Good } from '../../shared/civic.ts'

export interface CivicActions {
  trade(side: 'buy' | 'sell', good: Good, quantity: number): Promise<CivicReport>
  education(enabled: boolean): Promise<CivicReport>
  build?(id: string): void
  housing?():{id:number,name:string}[]
  upgrade?(id:number):Promise<CivicReport>
}
/** Shared by the live HUD and the explicitly local city preview. */
export function civicPanel(actions: CivicActions, demo = false) {
  const url = new URL(location.href)
  let report: CivicReport | undefined, busy = false
  const setParam = (key: string, value: string) => { const u = new URL(location.href); u.searchParams.set(key, value); history.replaceState(null, '', u) }
  const readout = h('div', { class: 'civic-metrics' })
  const notice = h('p', { class: 'civic-notice', role: 'status' })
  const stock = h('p', { class: 'civic-stock' })
  const support=h('p')
  const upgradeSelect=h('select',{'aria-label':'Wohnquartier ausbauen',onChange:()=>setParam('upgradeBuilding',upgradeSelect.value)}) as HTMLSelectElement
  const upgrade=h('button',{type:'button',onClick:()=>void run(()=>actions.upgrade!(Number(upgradeSelect.value)),'Wohnquartier zum Hochhaus ausgebaut.')},'Für 3.400 CR zum Hochhaus ausbauen') as HTMLButtonElement
  const direction = h('select', { 'aria-label': 'Handelsrichtung', onChange: () => { setParam('trade', direction.value); refreshPrice() } },
    h('option', { value: 'buy' }, 'Kaufen'), h('option', { value: 'sell' }, 'Verkaufen')) as HTMLSelectElement
  direction.value = url.searchParams.get('trade') === 'sell' ? 'sell' : 'buy'
  const good = h('select', { 'aria-label': 'Handelsware', onChange: () => { setParam('good', good.value); refreshPrice() } },
    ...Object.entries(GOODS).map(([id, data]) => h('option', { value: id }, data.name))) as HTMLSelectElement
  good.value = url.searchParams.get('good') === 'goods' ? 'goods' : 'food'
  const amount = h('input', { type: 'number', 'aria-label': 'Handelsmenge', min: '1', max: '1000', step: '1', value: '10', onInput: () => { setParam('amount', amount.value); refreshPrice() } }) as HTMLInputElement
  const initial = Number(url.searchParams.get('amount'))
  if (Number.isSafeInteger(initial) && initial >= 1 && initial <= 1000) amount.value = String(initial)
  const quote = h('output', { 'aria-label': 'Handelspreis' })
  const run = async (action: () => Promise<CivicReport>, message: string) => {
    if (busy) return
    busy = true; refreshPrice(); notice.textContent = 'Wird gebucht …'
    try { update(await action()); notice.textContent = message }
    catch (error) { notice.textContent = (error as Error).message }
    finally { busy = false; refreshPrice() }
  }
  const submit = h('button', { type: 'submit' }, 'Handel abschließen') as HTMLButtonElement
  const education = h('button', { type: 'button', onClick: () => run(() => actions.education(!report?.education), 'Ausbildungsauftrag aktualisiert.') }, 'Ausbildung pausieren') as HTMLButtonElement
  // Ein grauer Knopf ohne Grund sieht aus wie ein kaputter. Derselbe Ton wie
  // beim Handel: erst steht da, was fehlt, dann ist der Knopf nachvollziehbar.
  const schooling = h('p', { class: 'civic-schooling' })
  const price = () => GOODS[good.value as Good][direction.value as 'buy' | 'sell'] * Number(amount.value)
  function refreshPrice() {
    quote.textContent = `${Number.isFinite(price()) ? price().toLocaleString('de-DE') : '–'} Credits · ${GOODS[good.value as Good][direction.value as 'buy' | 'sell']} je Stück`
    submit.disabled = busy || !report?.buildings.market_hall || !Number.isSafeInteger(Number(amount.value)) || Number(amount.value) < 1 || Number(amount.value) > 1000
    const school = !!report?.buildings.school
    education.disabled = busy || !school
    education.title = school ? '' : 'Erst eine Schule bauen – sie bildet die Fachkräfte aus.'
    direction.disabled = good.disabled = amount.disabled = busy
  }
  const buildingList = h('div', { class: 'civic-buildings' }, ...CIVIC_BUILDINGS.map(def => h('article',
    h('strong', def.name), h('p', def.description), actions.build ? h('button', { type: 'button', onClick: () => { close(); actions.build!(def.id) } }, `${def.cost} CR · Bauen`) : h('span', `${def.cost} CR Baukosten`))))
  const dialog = h('dialog', { class: 'civic-panel', 'aria-labelledby': 'civic-title', onCancel: () => close() },
    h('header', h('div', h('span', { class: 'civic-eyebrow' }, demo ? 'Real Command / LOKALE WIRTSCHAFTSDEMO' : 'Real Command / STADT & HANDEL'), h('h1', { id: 'civic-title' }, 'Eine Stadt, die arbeitet.')),
      h('button', { type: 'button', 'aria-label': 'Stadt schließen', onClick: () => close() }, '×')),
    h('p', { class: 'civic-lead' }, 'Wohnen → Versorgung → Ausbildung → Arbeit. Baue ein Wohnquartier und einen Hof; ergänze Markt, Schule und Gewerbe.'),
    demo ? h('p', { class: 'civic-demo' }, 'Lokale Demo mit Musterbeständen. Käufe und Ausbildung wirken nur hier; beim Neuladen beginnt die Demo neu.') : null,
    readout,
    h('section',h('h2','Stadtgröße & Verkehrsversorgung'),support,actions.upgrade?h('div',{class:'civic-trade'},upgradeSelect,upgrade):null),
    h('section', h('h2', 'Versorgung & Handel'), stock,
      h('form', { class: 'civic-trade', onSubmit: (event: Event) => { event.preventDefault(); void run(() => actions.trade(direction.value as 'buy' | 'sell', good.value as Good, Number(amount.value)), 'Handel abgeschlossen.') } },
        h('label', 'Aktion', direction), h('label', 'Ware', good), h('label', 'Menge', amount), quote, submit), notice),
    h('section', { class: 'civic-education' }, h('div', h('h2', 'Schule & Ausbildung'), h('p', '2 Credits und 0,2 Konsumgüter je neuer Fachkraft. Büros brauchen Fachkräfte und Waren. Strommangel halbiert die Produktion und stoppt Ausbildung.'), schooling), education),
    h('details', h('summary', 'Gebäude für deine Stadt'), buildingList),
    h('footer', 'Lokaler Händler mit endlichen Beständen · Richtwerte je Spielminute · Lagerlimit 10.000 je Ware'),
  ) as HTMLDialogElement
  document.body.append(dialog)
  function close() { dialog.close(); const u = new URL(location.href); u.searchParams.delete('panel'); history.replaceState(null, '', u) }
  function update(next: CivicReport) {
    report = next
    const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('de-DE')}`
    const metrics = [
      ['Bewohner', `${next.residents} / ${next.capacity}`, 'Wohnraum'],
      ['Arbeitsplätze', `${next.employed} / ${next.jobs}`, 'besetzt'],
      ['Fachkräfte', String(next.qualified), `${next.educationSeats} Bildungsplätze`],
      ['Stadteinkommen', signed(next.incomePerMinute), 'Credits / min · Prognose'],
      ['Nahrung', signed(next.foodPerMinute), 'Einheiten / min'],
      ['Konsumgüter', signed(next.goodsPerMinute), 'Einheiten / min'],
    ]
    readout.replaceChildren(...metrics.map(([label, value, detail]) => h('div', h('span', label), h('strong', value), h('small', detail))))
    const infra=next.infrastructure
    support.textContent=`${infra.tier}: Versorgung für ${infra.capacity} Bewohner · ${infra.efficiency}% Leistungsfähigkeit · ${infra.connected}/${infra.total} Gebäude erschlossen · höchstens ${next.barracksLimit} Kasernen. Kleine Häuser reichen für ein Dorf bis 80 Bewohner. Darüber braucht es Hochhäuser und freie Wege zum Verkehrszentrum. Überlastung senkt Leistung und führt zu Abwanderung.`
    if(actions.housing){const selected=upgradeSelect.value||url.searchParams.get('upgradeBuilding');const homes=actions.housing();const key=homes.map(e=>e.id).join(',');if(upgradeSelect.dataset.homes!==key){upgradeSelect.dataset.homes=key;upgradeSelect.replaceChildren(...homes.map(e=>h('option',{value:String(e.id)},e.name)));if(selected&&homes.some(e=>String(e.id)===selected))upgradeSelect.value=selected}upgrade.disabled=busy||homes.length===0}
    stock.textContent = `Budget: ${next.credits.toLocaleString('de-DE')} CR · Lager: ${next.stock.food.toLocaleString('de-DE')} Nahrung · ${next.stock.goods.toLocaleString('de-DE')} Konsumgüter. Händler: ${next.merchant.stock.food} Nahrung · ${next.merchant.stock.goods} Konsumgüter · ${next.merchant.funds.toLocaleString('de-DE')} CR. ${next.buildings.market_hall ? '' : 'Für den Handel fehlt eine Markthalle.'}`
    education.textContent = next.education ? `Ausbildung pausieren (${next.trainingPerMinute}/min)` : 'Ausbildung fortsetzen'
    schooling.textContent = next.buildings.school ? '' : 'Für die Ausbildung fehlt eine Schule.'
    refreshPrice()
  }
  return { update, isOpen: () => dialog.open, open: () => { if (!dialog.open) dialog.showModal(); setParam('panel', 'civic') }, close }
}

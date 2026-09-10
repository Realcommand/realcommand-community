import type { BuildingDef } from './data.ts'

export const CIVIC_IDS = ['housing', 'farm', 'civic_workshop', 'market_hall', 'school', 'training_center', 'office', 'skyscraper', 'transport_hub'] as const
export type CivicId = typeof CIVIC_IDS[number]
export type Good = 'food' | 'goods'
export type CivicCounts = Record<CivicId, number>
export const GOODS = { food: { name: 'Nahrung', buy: 4, sell: 2 }, goods: { name: 'Konsumgüter', buy: 12, sell: 8 } } as const
export const emptyCivicCounts = (): CivicCounts => Object.fromEntries(CIVIC_IDS.map(id => [id, 0])) as CivicCounts
export const isCivic = (id: string): id is CivicId => (CIVIC_IDS as readonly string[]).includes(id)
const building = (id: CivicId, name: string, cost: number, size: number, power: number, prereq: string[], description: string): BuildingDef => ({
  kind: 'building', id, name, category: 'structure', role: 'civilian', cost, buildTime: cost / 3,
  hp: cost * .6 + 300, armor: 'structure', size, power, sight: 500, weapons: [], prereq, placement: 'land', description,
})
export const CIVIC_BUILDINGS: BuildingDef[] = [
  building('housing', 'Wohnquartier', 600, 18, -3, ['command'], 'Wohnraum für 40 Menschen. Zuzug braucht Nahrung; Bewohner besetzen Arbeitsplätze.'),
  building('farm', 'Landwirtschaft', 700, 30, -2, ['housing'], '6 Arbeitsplätze erzeugen bis zu 48 Nahrung pro Spielminute.'),
  building('civic_workshop', 'Manufaktur', 1000, 23, -8, ['housing', 'power'], '8 Arbeitsplätze erzeugen bis zu 7,2 Konsumgüter pro Spielminute.'),
  building('market_hall', 'Markthalle', 900, 24, -4, ['housing'], 'Nahrung und Konsumgüter mit einem lokalen Händler kaufen und verkaufen. Endlicher Warenbestand und Händlerkasse.'),
  building('school', 'Schule', 1200, 25, -5, ['housing', 'power'], '60 Bildungsplätze, bis zu 1,5 neue Fachkräfte pro Spielminute. Braucht Konsumgüter und laufendes Budget.'),
  building('training_center', 'Ausbildungszentrum', 1700, 26, -8, ['school'], '24 zusätzliche Bildungsplätze, bis zu 3,6 neue Fachkräfte pro Spielminute. Ergänzt die Schule.'),
  building('office', 'Bürohaus', 1800, 20, -10, ['school'], '20 Büroarbeitsplätze für Fachkräfte. Verbraucht Konsumgüter und erzeugt Einkommen.'),
  building('skyscraper', 'Hochhaus', 4000, 24, -18, ['office', 'training_center'], 'Gemischtes Stadtquartier: Wohnraum für 160 Menschen und 40 Büroarbeitsplätze.'),
  building('transport_hub', 'Verkehrszentrum', 1600, 28, -6, ['housing', 'power'], 'Erschließt freie Landwege bis 1,2 km. Versorgt bis zu 300 zusätzliche Bewohner; ohne Verkehr bleibt die Siedlung klein.'),
]
export interface CivicState {
  residents: number
  qualified: number
  stock: Record<Good, number>
  merchant: { stock: Record<Good, number>, funds: number }
  education: boolean
}
export interface CivicReport {
  credits: number
  buildings: CivicCounts
  residents: number
  capacity: number
  qualified: number
  employed: number
  jobs: number
  educationSeats: number
  education: boolean
  foodPerMinute: number
  goodsPerMinute: number
  incomePerMinute: number
  trainingPerMinute: number
  stock: Record<Good, number>
  merchant: CivicState['merchant']
  power: boolean
  infrastructure:{capacity:number,connected:number,total:number,efficiency:number,tier:string}
  barracksLimit:number
}
/** One starter inventory per player, retained through sale, defeat and reload. */
export function createCivic(): CivicState {
  return { residents: 0, qualified: 0, stock: { food: 80, goods: 30 }, merchant: { stock: { food: 400, goods: 160 }, funds: 5000 }, education: true }
}
/** Kleinstes Dorf, das sich mit Wohnraum und Guthaben immer wieder ansiedelt. */
export const SETTLER_FLOOR = 20
export interface CivicInfrastructure {capacity:number,connected:number,total:number}
export const barracksLimit=(s:CivicState|undefined,b:CivicCounts,network:CivicInfrastructure)=>Math.min(4,1+(b.transport_hub>0&&network.connected>0?Math.floor(Math.min(s?.residents??0,(s?.qualified??0)*4,80+b.skyscraper*160,80+Math.max(0,network.capacity-80)*network.connected/Math.max(1,network.total))/100):0))
function rates(s: CivicState, b: CivicCounts, power: boolean, funds: number,network:CivicInfrastructure) {
  const capacity = b.housing * 40 + b.skyscraper * 160
  const serviced=80+Math.max(0,network.capacity-80)*(network.total?network.connected/network.total:0)
  // Small homes support a village; larger settlements require vertical housing.
  const growthCapacity=Math.min(capacity,serviced,80+b.skyscraper*160)
  const residents = Math.min(capacity, s.residents), qualified = Math.min(residents, s.qualified)
  const efficiency=Math.min(1,growthCapacity/Math.max(1,residents))
  let available = Math.floor(residents * .65)
  const allocate = (wanted: number) => { const n = Math.min(available, wanted); available -= n; return n }
  const farmers = allocate(b.farm * 6), makers = allocate(b.civic_workshop * 8)
  const officeJobs = b.office * 20 + b.skyscraper * 40
  const clerks = allocate(Math.min(officeJobs, Math.floor(qualified)))
  const factor = (power ? 1 : .5)*efficiency
  const educationSeats = b.school * 60 + b.training_center * 24
  const training = s.education && power && funds > 0 && s.stock.goods > 0
    ? efficiency*Math.min(b.school * .025 + b.training_center * .06, Math.max(0, Math.min(residents * .65, educationSeats) - qualified) / 60) : 0
  return { capacity,growthCapacity,efficiency, residents, qualified, educationSeats, training,
    employed: farmers + makers + clerks, jobs: b.farm * 6 + b.civic_workshop * 8 + officeJobs,
    food: farmers / 6 * .8 * factor, consumption: residents * .01,
    goods: makers / 8 * .12 * factor,
    office: s.stock.goods > 0 ? clerks * factor : 0,
  }
}
/** Constant work per city: no resident entities, pathfinding, or per-person loops. */
export function advanceCivic(s: CivicState, b: CivicCounts, power: boolean, funds: number, dt: number,network:CivicInfrastructure={capacity:80+300*b.transport_hub,connected:1,total:1}): number {
  if (!Number.isFinite(dt) || dt <= 0) return funds
  const r = rates(s, b, power, funds,network)
  s.residents = r.residents; s.qualified = r.qualified
  const foodAvailable = s.stock.food + r.food * dt
  const consumed = Math.min(foodAvailable, r.consumption * dt)
  s.stock.food = Math.min(Math.max(10000,s.stock.food), foodAvailable - consumed)
  const fed = consumed + 1e-8 >= r.consumption * dt
  if(s.residents>r.growthCapacity)s.residents=Math.max(r.growthCapacity,s.residents*Math.exp(-dt/3600))
  else if (fed && s.stock.food >= 1) s.residents = Math.min(r.growthCapacity, s.residents + (r.growthCapacity / 240) * dt, s.residents + s.stock.food)
  // Hunger schrumpft die Bevölkerung exponentiell. Linear wäre der Schritt nicht
  // zeitschrittunabhängig: ein einzelner großer Sprung (eine lange nicht besuchte
  // Stadt) hätte die Einwohner auf null gesetzt, und ohne Einwohner gibt es keine
  // Bauern mehr – die Stadt wäre unwiederbringlich tot statt vorübergehend arm.
  else if (!fed) s.residents = s.residents * Math.exp(-dt * .02 / 60)
  // Neubesiedlung: Eine menschenleere Siedlung mit Wohnraum und Guthaben zieht
  // wieder ein kleines Dorf an. Ohne diese Regel bliebe jede einmal verhungerte
  // Stadt für immer tot – keine Einwohner heißt keine Bauern, keine Bauern heißt
  // nie wieder Nahrung, selbst mit Millionen auf dem Konto. Sie greift nur bei
  // faktisch null Einwohnern und ersetzt keine Nahrung für laufendes Wachstum.
  if (s.residents < 1 && funds > 0 && r.capacity > 0) s.residents = Math.min(SETTLER_FLOOR, r.growthCapacity)
  const trained = Math.min(r.training * dt, funds / 2, s.stock.goods / .2)
  s.qualified = Math.min(s.residents * .65, s.qualified + trained)
  s.stock.goods -= trained * .2
  funds -= trained * 2
  const officeWork = Math.min(r.office * dt, s.stock.goods / .003)
  s.stock.goods = Math.min(Math.max(10000,s.stock.goods), s.stock.goods - officeWork * .003 + r.goods * dt)
  // Civic service income supplements the existing RTS base income.
  return funds + officeWork * .05 + (fed ? r.residents * .006 * dt*r.efficiency : 0)
}
export function civicReport(s: CivicState, b: CivicCounts, power: boolean, funds: number,network:CivicInfrastructure={capacity:80+300*b.transport_hub,connected:1,total:1}): CivicReport {
  const r = rates(s, b, power, funds,network), round = (n: number) => Math.round(n * 10) / 10
  return { credits: Math.floor(funds), buildings: b, residents: Math.floor(r.residents), capacity: r.capacity, qualified: Math.floor(r.qualified),
    employed: r.employed, jobs: r.jobs, educationSeats: r.educationSeats, education: s.education,
    foodPerMinute: round((r.food - r.consumption) * 60), goodsPerMinute: round((r.goods - r.office * .003 - r.training * .2) * 60),
    incomePerMinute: round((r.office * .05 + (s.stock.food > 0 ? r.residents * .006*r.efficiency : 0) - r.training * 2) * 60),
    trainingPerMinute: round(r.training * 60), stock: { food: round(s.stock.food), goods: round(s.stock.goods) },
    merchant: { stock: { ...s.merchant.stock }, funds: s.merchant.funds }, power,
    infrastructure:{capacity:Math.floor(r.growthCapacity),connected:network.connected,total:network.total,efficiency:Math.round(r.efficiency*100),tier:r.growthCapacity<=80?'Dorf':r.growthCapacity<=400?'Stadt':'Großstadt'},barracksLimit:barracksLimit(s,b,network) }
}
/** Validate the whole exchange before either ledger changes. Returns new player funds. */
export function tradeCivic(s: CivicState, b: CivicCounts, funds: number, side: unknown, good: unknown, quantity: unknown): number {
  if (!b.market_hall) throw new Error('Baue zuerst eine eigene Markthalle.')
  if (side !== 'buy' && side !== 'sell') throw new Error('Ungültige Handelsrichtung.')
  if (good !== 'food' && good !== 'goods') throw new Error('Unbekannte Ware.')
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Menge muss eine ganze Zahl zwischen 1 und 1000 sein.')
  const value = GOODS[good][side] * quantity
  if (side === 'buy') {
    if (funds < value) throw new Error('Nicht genug Credits.')
    if (s.merchant.stock[good] < quantity) throw new Error('Der Händler hat nicht genug Waren.')
    if (s.stock[good] + quantity > 10000) throw new Error('Das Lager ist voll (10.000 je Ware).')
    s.stock[good] += quantity; s.merchant.stock[good] -= quantity; s.merchant.funds += value
    return funds - value
  }
  if (s.stock[good] < quantity) throw new Error('Nicht genug Waren im Lager.')
  if (s.merchant.funds < value) throw new Error('Die Händlerkasse reicht nicht aus.')
  s.stock[good] -= quantity; s.merchant.stock[good] += quantity; s.merchant.funds -= value
  return funds + value
}

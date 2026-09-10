#!/usr/bin/env node
/**
 * Regelbasierter Autopilot: baut und verteidigt eine Basis ausschließlich über die REST-API.
 * Zeigt, wie ein Programm (oder eine KI) das Spiel spielt. Läuft endlos.
 *
 *   node agents/autopilot.mjs --url http://localhost:8080 --name "Autopilot" [--faction meridian] [--lon 10 --lat 50] [--interval 5]
 */
import { createClient, ensureToken, parseArgs } from './toolset.mjs'

const args = parseArgs(process.argv.slice(2), { interval: '5', faction: 'meridian' })
const url = args.url ?? process.env.REALCOMMAND_URL ?? 'http://localhost:8080'
const client = createClient({ url, token: args.token ?? process.env.REALCOMMAND_TOKEN })
await ensureToken(client, { name: args.name ?? process.env.REALCOMMAND_NAME ?? 'Autopilot' })
const interval = Math.max(1, Number(args.interval)) * 1000
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

/** Bauplan der Basis (Reihenfolge, Zieltyp -> gewünschte Anzahl). */
const BUILD_ORDER = [
  ['power', 1], ['refinery', 1], ['barracks', 1], ['power', 2], ['factory', 1], ['bunker', 1], ['turret', 1],
  ['radar', 1], ['refinery', 2], ['power', 3], ['turret', 2], ['aagun', 1], ['tech', 1], ['power', 4], ['sam', 1], ['factory', 2], ['airfield', 1], ['power', 5],
]
/** Gewünschte Armee (Typ -> Anzahl), wird der Reihe nach aufgefüllt. */
const ARMY = [['rifleman', 4], ['rocketeer', 2], ['lighttank', 2], ['mbt', 4], ['aa', 1], ['artillery', 2], ['heavytank', 2], ['mlrs', 2], ['medic', 1], ['gunship', 2]]
const RESERVE = 600
let eventSeq = 0
let deployIssued = 0
let lastPlan = ''

async function tick() {
  const sit = await client.get('/me/situation')
  const ev = await client.get('/me/events', { since: eventSeq })
  eventSeq = ev.latestSeq
  for (const e of ev.events) log('EVENT', e.type, '-', e.message)

  if (!sit.player.spawned) {
    const spots = await client.get('/spawn-spots', { lon: args.lon, lat: args.lat, radius: args.lon ? 300_000 : undefined, count: 3 })
    if (!spots.spots.length) { log('kein Startplatz gefunden'); return }
    const s = spots.spots[0]
    await client.post('/me/spawn', { x: s.x, y: s.y, faction: args.faction })
    log(`gelandet bei ${s.lat.toFixed(2)}N ${s.lon.toFixed(2)}E als ${args.faction}, ${s.deposits} Lagerstätten in der Nähe`)
    return
  }
  const units = sit.army.units, buildings = sit.base.buildings
  const counts = { ...sit.base.counts }
  const crawler = units.find(u => u.type === 'crawler')
  if (!counts.command) {
    if (crawler && crawler.state !== 'deploy' && Date.now() - deployIssued > 60_000) {
      deployIssued = Date.now()
      await client.post('/me/orders', { ids: [crawler.id], order: { k: 'deploy' } })
      log('Bauraupe entfaltet sich')
    }
    return
  }

  // Fertige Gebäude platzieren.
  for (const [cat, slot] of Object.entries(sit.production)) {
    for (const type of [...slot.ready]) {
      const spots = await client.get('/me/build-spots', { type, count: 3 })
      if (!spots.spots.length) { log(`kein Platz für ${type}: ${spots.note}`); continue }
      const s = spots.spots[Math.floor(Math.random() * spots.spots.length)]
      await client.post('/me/buildings', { type, x: s.x, y: s.y })
      log(`${type} platziert (${cat})`)
      counts[type] = (counts[type] ?? 0) + 1
      slot.ready.splice(slot.ready.indexOf(type), 1)
    }
  }

  const available = new Set(sit.available.map(a => a.type))
  const funds = sit.economy.funds
  const active = (cat) => sit.production[cat]?.current || sit.production[cat]?.queue.length

  // Gebäude nach Bauplan.
  const structuresBusy = active('structure'), defenseBusy = active('defense')
  const pendingCount = (cat, type) => {
    const slot = sit.production[cat]
    return (slot.current?.type === type ? 1 : 0) + [...slot.queue, ...slot.ready].filter(t=>t===type).length
  }
  for (const [type, want] of BUILD_ORDER) {
    const isDefense = ['bunker', 'turret', 'aagun', 'sam', 'coastal'].includes(type)
    const busy = isDefense ? defenseBusy : structuresBusy
    if (busy) continue
    const have = (counts[type] ?? 0) + pendingCount(isDefense ? 'defense' : 'structure', type)
    if (have >= want) continue
    if (!available.has(type)) continue
    const def = sit.available.find(a => a.type === type)
    if (funds < def.cost + (type === 'power' || type === 'refinery' ? 0 : RESERVE)) { break }
    await client.post('/me/production', { type })
    log(`Produktion: ${type} (${def.cost}, ${Math.round(def.buildTime / 60)} min)`)
    if (isDefense) break; else break
  }

  // Wirtschaft: Förderfahrzeuge.
  const extractors = units.filter(u => u.type === 'extractor').length
  if (!active('vehicle') && counts.refinery && extractors < 2 * counts.refinery && available.has('extractor') && funds > 1400 + RESERVE) {
    await client.post('/me/production', { type: 'extractor' })
    log('Produktion: extractor')
  }

  // Armee auffüllen.
  const unitCounts = sit.army.counts
  for (const [type, want] of ARMY) {
    if ((unitCounts[type] ?? 0) >= want || !available.has(type)) continue
    const def = sit.available.find(a => a.type === type)
    const cat = def.category
    if (active(cat)) continue
    if (funds < def.cost + RESERVE * 2) continue
    await client.post('/me/production', { type })
    log(`Produktion: ${type}`)
    break
  }

  // Verteidigung: sichtbare Feinde angreifen, sonst Wache in der Basis.
  const combat = units.filter(u => !['extractor', 'crawler', 'engineer', 'medic'].includes(u.type) && u.state !== 'inside')
  const threats = sit.threats.filter(t => t.distance < 25_000)
  if (threats.length && combat.length) {
    const target = threats[0]
    const idle = combat.filter(u => !u.order || u.order.k === 'guard')
    if (idle.length) {
      await client.post('/me/orders', { ids: idle.map(u => u.id), order: { k: 'attackmove', x: target.x, y: target.y } })
      log(`Angriff auf ${target.name} von ${target.ownerName} (${target.distance} m) mit ${idle.length} Einheiten`)
    }
  } else {
    const home = sit.player.home
    const strays = combat.filter(u => !u.order && u.distanceFromHome > 1500)
    if (strays.length && home) {
      await client.post('/me/orders', { ids: strays.map(u => u.id), order: { k: 'move', x: home.x + (Math.random() - 0.5) * 400, y: home.y + 250 + Math.random() * 200 } })
    }
  }

  const plan = `funds ${funds} | power ${sit.power.produced}/${sit.power.consumed} | buildings ${JSON.stringify(counts)} | units ${JSON.stringify(unitCounts)}`
  if (plan !== lastPlan) { lastPlan = plan; log(plan) }
  if (sit.hints.length) for (const h of sit.hints) if (!h.startsWith('Fewer than')) log('HINT', h)
}

log(`Autopilot verbunden mit ${url}`)
for (;;) {
  try { await tick() } catch (error) { log('Fehler:', error.message) }
  await new Promise(r => setTimeout(r, interval))
}

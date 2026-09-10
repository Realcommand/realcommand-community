/**
 * Gemeinsames Werkzeugset für KI-Agenten (MCP-Server und Claude-Kommandant).
 * Jedes Werkzeug ruft die REST-API auf; Beschreibungen sind auf LLMs zugeschnitten.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function createClient({ url, token }) {
  const base = url.replace(/\/$/, '') + '/api/v1'
  const headers = () => ({ 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) })
  async function call(method, path, query, body) {
    const qs = query ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))).toString() : ''
    const res = await fetch(base + path + qs, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = { error: text } }
    if (!res.ok) { const err = new Error(json.error ?? `HTTP ${res.status}`); err.status = res.status; throw err }
    return json
  }
  return {
    base,
    get token() { return token },
    set token(v) { token = v },
    get: (path, query) => call('GET', path, query),
    post: (path, body) => call('POST', path, undefined, body),
    del: (path, query) => call('DELETE', path, query),
  }
}

/** Token-Datei für automatische Registrierung (~/.config/realcommand/<host>-<name>.json). */
export function tokenStore(url, name) {
  const dir = join(homedir(), '.config', 'realcommand')
  const host = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_')
  const file = join(dir, `${host}-${name.replace(/[^a-z0-9]/gi, '_')}.json`)
  return {
    load() { try { return JSON.parse(readFileSync(file, 'utf8')).token } catch { return undefined } },
    save(token) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ token, name, url }, null, 2)) },
    file,
    exists: () => existsSync(file),
  }
}

/** Stellt sicher, dass ein Token vorhanden ist: aus Option, Umgebung, Datei oder per Registrierung. */
export async function ensureToken(client, { name }) {
  if (client.token) return client.token
  if (!name) throw new Error('no token and no name: pass --token or --name')
  const store = tokenStore(client.base, name)
  const saved = store.load()
  if (saved) { client.token = saved; return saved }
  const reg = await client.post('/players', { name })
  client.token = reg.token
  store.save(reg.token)
  return reg.token
}

const point = {
  x: { type: 'number', description: 'x in metres (plate carrée)' },
  y: { type: 'number', description: 'y in metres' },
  lon: { type: 'number', description: 'longitude in degrees (alternative to x/y)' },
  lat: { type: 'number', description: 'latitude in degrees' },
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function compactSituation(s) {
  return {
    time: s.time,
    player: s.player,
    funds: s.economy.funds,
    power: s.power,
    refineries: s.economy.refineries,
    extractors: s.economy.extractors,
    depositsNearby: s.economy.deposits.slice(0, 5),
    buildings: s.base.counts,
    units: s.army.counts,
    production: Object.fromEntries(Object.entries(s.production).filter(([, v]) => v.current || v.queue.length || v.blocked).map(([k, v]) => [k, v])),
    available: s.available.map(a => a.type),
    locked: s.locked.map(l => `${l.type} (needs ${l.missing.join(', ')})`),
    threats: s.threats.slice(0, 10).map(t => ({ id: t.id, type: t.type, owner: t.ownerName, distance: t.distance, hp: t.hp })),
    hints: s.hints,
    latestEventSeq: s.latestEventSeq,
  }
}

export const TOOLS = [
  {
    name: 'get_rules',
    description: 'Game rules, coordinate system, order semantics, economy numbers and the recommended workflow. Read once at the start.',
    input_schema: { type: 'object', properties: {} },
    run: (c) => c.get('/rules'),
  },
  {
    name: 'get_catalog',
    description: 'Definitions of all units and buildings (cost, build time in seconds, speed, weapons, prerequisites, faction exclusives). Pass "type" for one entry.',
    input_schema: { type: 'object', properties: { type: { type: 'string', description: 'optional type id, e.g. "mbt" or "refinery"' } } },
    run: (c, i) => i.type ? c.get(`/catalog/${encodeURIComponent(i.type)}`) : c.get('/catalog').then(cat => ({
      units: cat.units.map(u => ({ type: u.type, name: u.name, category: u.category, domain: u.domain, cost: u.cost, buildTimeSeconds: u.buildTimeSeconds, hp: u.hp, speedKmh: u.speedKmh, role: u.role, cargo: u.cargo, prerequisites: u.prerequisites, factions: u.factions, weapons: u.weapons.map(w => `${w.warhead} ${w.damage}dmg/${w.reloadSeconds}s r=${w.rangeMeters}m vs ${w.targets.join('/')}`) })),
      buildings: cat.buildings.map(b => ({ type: b.type, name: b.name, category: b.category, cost: b.cost, buildTimeSeconds: b.buildTimeSeconds, hp: b.hp, power: b.power, produces: b.produces, placement: b.placement, prerequisites: b.prerequisites, factions: b.factions, weapons: b.weapons.map(w => `${w.warhead} ${w.damage}dmg/${w.reloadSeconds}s r=${w.rangeMeters}m vs ${w.targets.join('/')}`) })),
      factions: cat.factions,
    })),
  },
  {
    name: 'get_situation',
    description: 'Compact situation report: funds, power, buildings/units by type, production, available and locked types, threats, hints. Use "full": true for every entity with positions and states.',
    input_schema: { type: 'object', properties: { full: { type: 'boolean', description: 'include full entity lists' } } },
    run: (c, i) => c.get('/me/situation').then(s => i.full ? s : compactSituation(s)),
  },
  {
    name: 'get_civic',
    description: 'Civilian economy: residents, housing, employment, qualified workers, education, food/goods stocks, production rates and the finite local merchant. Read before planning civilian construction or trading.',
    input_schema: { type: 'object', properties: {} },
    run: (c) => c.get('/me/civic'),
  },
  {
    name:'upgrade_housing',
    description:'Upgrade one existing owned housing building to a skyscraper for 3400 credits. Requires office, training center and a connected transport hub, a clear larger footprint and sufficient credits. Read get_civic and owned buildings first. Villages support only 80 residents; transport and vertical housing unlock growth. Military buildings have strict civil-support limits.',
    input_schema:{type:'object',required:['id'],properties:{id:{type:'integer'}}},
    run:(c,i)=>c.post('/me/civic/upgrade',{id:i.id}),
  },
  {
    name: 'get_world_system',
    description: 'Own protected bank balance, reputation, saved rebuild plan, alliances and war-crime proceedings. Includes only your finances, never hidden base coordinates.',
    input_schema: { type: 'object', properties: {} },
    run: c=>c.get('/me/world'),
  },
  {
    name: 'world_action',
    description: 'Bank, alliance and court actions. Read get_world_system first. Banking requires its current bankVersion to reject duplicate or stale transactions. Bank transfers and diplomatic/court decisions require your human commander’s instruction. Capturing a headquarters loots the settlement and lowers reputation; respawn restores buildings without cash or units, preserving bank savings.',
    input_schema: { type:'object',required:['action'],properties:{action:{type:'string',enum:['bank_deposit','bank_withdraw','alliance_create','alliance_apply','alliance_accept','alliance_leave','case_file','case_defend','case_vote','war_declare','war_peace']},amount:{type:'integer',minimum:1},bankVersion:{type:'integer'},name:{type:'string'},allianceId:{type:'integer'},memberId:{type:'integer'},targetId:{type:'integer'},warId:{type:'integer'},conquestId:{type:'integer'},caseId:{type:'integer'},charge:{type:'string',enum:['civilian_seizure','alliance_breach']},statement:{type:'string'},guilty:{type:'boolean'}} },
    run:(c,i)=>c.post('/me/world',i),
  },
  {
    name: 'trade_civic',
    description: 'Buy or sell food or goods at your market hall. Prices, merchant stocks and funds are finite: inspect get_civic first. Quantity is a whole number from 1 to 1000. Buying spends your credits; selling transfers your goods.',
    input_schema: { type: 'object', properties: { side: { type: 'string', enum: ['buy', 'sell'] }, good: { type: 'string', enum: ['food', 'goods'] }, quantity: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['side', 'good', 'quantity'] },
    run: (c, i) => c.post('/me/civic/trade', { side: i.side, good: i.good, quantity: i.quantity }),
  },
  {
    name: 'set_education',
    description: 'Enable or pause school/training. Requires your own school. Each new qualification costs two credits and 0.2 goods; qualified workers fill office jobs.',
    input_schema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    run: (c, i) => c.post('/me/civic/education', { enabled: i.enabled }),
  },
  {
    name: 'list_entities',
    description: 'Own units and buildings with ids, positions (x/y and lon/lat), hp, state and current order. Filter by kind (unit|building) and/or type.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['unit', 'building'] }, type: { type: 'string' } } },
    run: (c, i) => c.get('/me/entities', { kind: i.kind, type: i.type }),
  },
  {
    name: 'scan',
    description: 'Visible enemy objects and resource deposits around a point (default: around your base) within a radius in metres (default 40000). You only see what your units and buildings see.',
    input_schema: { type: 'object', properties: { ...point, radius: { type: 'number' } } },
    run: (c, i) => c.get('/me/visible', i),
  },
  {
    name: 'radar',
    description: 'Radar picture: your radar stations (position and range) and every contact they detect that nobody actually sees. A contact carries position, class (air/ground/naval) and distance; the identity only appears within 45% of a station range. Radar reaches far beyond sight, but tells you much less - use scan for objects your units really see. Aircraft have a large radar signature and are picked up at long range; infantry is almost invisible to radar.',
    input_schema: { type: 'object', properties: {} },
    run: (c) => c.get('/me/radar'),
  },
  {
    name: 'get_events',
    description: 'Notable events since a sequence number: production_ready, unit_produced, building_placed, under_attack, unit_lost, building_lost, power_low/power_ok.',
    input_schema: { type: 'object', properties: { since: { type: 'integer', description: 'last seen sequence number (0 for all recent)' } } },
    run: (c, i) => c.get('/me/events', { since: i.since ?? 0 }),
  },
  {
    name: 'find_spawn_spots',
    description: 'Before spawning: suggest valid start positions, ranked by nearby deposits. Optionally near lon/lat within radius metres.',
    input_schema: { type: 'object', properties: { ...point, radius: { type: 'number' }, count: { type: 'integer' } } },
    run: (c, i) => c.get('/spawn-spots', i),
  },
  {
    name: 'spawn',
    description: 'Land at a point on land with a faction (aurora | meridian | kestrel). Only once per player. You receive a crawler, an extractor and a small force.',
    input_schema: { type: 'object', properties: { ...point, faction: { type: 'string', enum: ['aurora', 'meridian', 'kestrel'] } }, required: ['faction'] },
    run: (c, i) => c.post('/me/spawn', i),
  },
  {
    name: 'produce',
    description: 'Start or queue production of a unit or building type. Cost is paid immediately. Finished buildings appear in production[category].ready, an array of type IDs. They remain available for place_building while the next queued item is built.',
    input_schema: { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] },
    run: (c, i) => c.post('/me/production', { type: i.type }),
  },
  {
    name: 'cancel_production',
    description: 'Cancel active production, remove a queued item by index, or cancel one finished building by readyType (full refund). Use either index or readyType, not both.',
    input_schema: { type: 'object', properties: { category: { type: 'string', enum: ['structure', 'defense', 'infantry', 'vehicle', 'aircraft', 'ship'] }, index: { type: 'integer', minimum: 0 }, readyType: { type: 'string' } }, required: ['category'] },
    run: (c, i) => c.del(`/me/production/${i.category}`, { index: i.index, readyType: i.readyType }),
  },
  {
    name: 'find_build_spots',
    description: 'Valid placement coordinates for a building type near your base (within the build radius, on land, coastal for shipyards). Use one of them with place_building.',
    input_schema: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'integer' }, ...point }, required: ['type'] },
    run: (c, i) => c.get('/me/build-spots', i),
  },
  {
    name: 'place_building',
    description: 'Place a finished ("ready") building at a valid spot.',
    input_schema: { type: 'object', properties: { type: { type: 'string' }, ...point }, required: ['type'] },
    run: (c, i) => c.post('/me/buildings', i),
  },
  {
    name: 'order_units',
    description: 'Give an order to own units by id. move/attackmove/unload take a point; attack/load/capture/harvest take target. Set queued:true for move/attackmove to append to a route (16 destinations maximum). Other manual commands cancel the route. fire with mode free, return or hold changes persistent fire discipline without cancelling the route. Direct attack overrides fire discipline.',
    input_schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
        k: { type: 'string', enum: ['move', 'attackmove', 'attack', 'stop', 'guard', 'harvest', 'deploy', 'load', 'unload', 'capture', 'return', 'fire'] },
        queued: { type: 'boolean', description: 'Append move/attackmove to an active route' },
        repeat: { type: 'boolean', description: 'Repeat move/attackmove route as a patrol. Queued points inherit when omitted; stop cancels.' },
        mode: { type: 'string', enum: ['free', 'return', 'hold'], description: 'Required for fire' },
        ...point,
        target: { type: 'integer', description: 'target entity id' },
      },
      required: ['ids', 'k'],
    },
    run: (c, i) => c.post('/me/orders', { ids: i.ids, order: { k: i.k, x: i.x, y: i.y, lon: i.lon, lat: i.lat, target: i.target, ...(i.queued !== undefined ? { queued: i.queued } : {}), ...(i.repeat !== undefined ? { repeat: i.repeat } : {}), ...(i.mode !== undefined ? { mode: i.mode } : {}) } }),
  },
  {
    name: 'eta',
    description: 'Travel distance and time for a unit (by id) or a unit type (from the base) to a point. Useful to judge whether an attack or expansion is feasible.',
    input_schema: { type: 'object', properties: { unit: { type: 'integer' }, type: { type: 'string' }, ...point } },
    run: (c, i) => c.get('/me/eta', i),
  },
  {
    name: 'sell_building',
    description: 'Sell an own building for 50 % of its cost.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    run: (c, i) => c.post(`/me/buildings/${i.id}/sell`),
  },
  {
    name: 'repair_building',
    description: 'Toggle repair of an own building (costs funds over time).',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    run: (c, i) => c.post(`/me/buildings/${i.id}/repair`),
  },
  {
    name: 'set_rally',
    description: 'Set the rally point of a production building; new units move there.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' }, ...point }, required: ['id'] },
    run: (c, i) => c.post(`/me/buildings/${i.id}/rally`, i),
  },
  {
    name: 'get_bases',
    description: 'Command centers you know: your own, plus every foreign one your sight or radar has actually found. Once found, a base stays remembered even after you move away. A base picked up on radar only comes back with player 0 and name "unbekannt" - look at it with a unit to learn whose it is. This is NOT a world map of all players: if a base is not in the list, you have not found it yet. Send a scout.',
    input_schema: { type: 'object', properties: {} },
    run: (c) => c.get('/bases'),
  },
  {
    name: 'chat',
    description: 'Write into the private command channel with your player. Only the two of you see it. Use it to report what you did and why, and to answer their orders. Not a world chat.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: (c, i) => c.post('/me/chat', { text: i.text }),
  },
  {
    name: 'read_orders',
    description: 'Read the private command channel: the orders your player wrote to you, and your own earlier reports. Pass "since" (last seen sequence number) to get only what is new. Orders from the player outrank your own plan.',
    input_schema: { type: 'object', properties: { since: { type: 'integer' } } },
    run: (c, i) => c.get('/me/chat', { since: i.since ?? 0 }),
  },
  {
    name: 'wait',
    description: 'Wait for real time to pass (max 300 seconds), then return new events and a compact situation. Use it while production or movement is in progress.',
    input_schema: { type: 'object', properties: { seconds: { type: 'number' }, since: { type: 'integer', description: 'event sequence number already seen' } }, required: ['seconds'] },
    run: async (c, i) => {
      const seconds = Math.min(300, Math.max(1, Number(i.seconds) || 10))
      await sleep(seconds * 1000)
      const [events, situation] = await Promise.all([c.get('/me/events', { since: i.since ?? 0 }), c.get('/me/situation')])
      return { waited: seconds, events, situation: compactSituation(situation) }
    },
  },
]

export function toolByName(name) {
  return TOOLS.find(t => t.name === name)
}

export async function runTool(client, name, input) {
  const tool = toolByName(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  return tool.run(client, input ?? {})
}

export function parseArgs(argv, defaults = {}) {
  const out = { ...defaults }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i++ }
  }
  return out
}

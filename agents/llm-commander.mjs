#!/usr/bin/env node
/**
 * LLM-Kommandant für OpenAI-kompatible Chat-Endpunkte (z. B. devshot, Ollama, vLLM): spielt über die REST-API mit Tool-Calling.
 *
 *   LLM_API_KEY=... node agents/llm-commander.mjs --url http://localhost:8080 --name "KI" [--llm-url https://console.devshot.com/api/ai] [--model devshot-chat] [--interval 60] [--faction aurora] [--lon 10 --lat 50] [--goal "..."]
 *
 * Umgebungsvariablen: LLM_API_KEY (Pflicht), LLM_BASE_URL, LLM_MODEL, REALCOMMAND_URL, REALCOMMAND_TOKEN, REALCOMMAND_NAME
 */
import { createClient, ensureToken, TOOLS, runTool, parseArgs } from './toolset.mjs'

const args = parseArgs(process.argv.slice(2), { interval: '60', faction: 'meridian' })
const url = args.url ?? process.env.REALCOMMAND_URL ?? 'http://localhost:8080'
const llmUrl = (args['llm-url'] ?? process.env.LLM_BASE_URL ?? 'https://console.devshot.com/api/ai').replace(/\/$/, '')
const model = args.model ?? process.env.LLM_MODEL ?? 'devshot-chat'
const apiKey = process.env.LLM_API_KEY
if (!apiKey) { console.error('LLM_API_KEY fehlt'); process.exit(1) }
const client = createClient({ url, token: args.token ?? process.env.REALCOMMAND_TOKEN })
await ensureToken(client, { name: args.name ?? process.env.REALCOMMAND_NAME ?? 'LLM-Kommandant' })
const interval = Math.max(10, Number(args.interval)) * 1000
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const rules = await client.get('/rules')
const goal = args.goal ?? `Found a base as faction "${args.faction}"${args.lon ? ` near lon ${args.lon}, lat ${args.lat}` : ''}, build a working economy (power, refinery, extractors), then factories and defenses, keep the power balance positive, scout the surroundings and grow the army. Defend when attacked. Be economical with funds.`
const system = [
  'You are the commander of a base in Real Command, a persistent real-time strategy game on the world map. You act only through the provided tools; the game keeps running between your turns, in real time (minutes for buildings, km/h for units).',
  'Each turn you receive the current situation and new events. Decide what to do, call the tools (several per turn are fine), and finish the turn with one or two sentences describing what you did and why.',
  'Orders from your commander arrive in "ordersFromYourCommander" and in the private channel (read_orders). They outrank your own plan: follow them unless they would destroy you, and answer in that channel with the chat tool so the human sees what you did.',
  'Guidelines: production costs are paid immediately, so keep a small reserve. One building at a time per category; place "ready" buildings promptly (find_build_spots + place_building). Keep extractors busy. Never move the crawler far before deploying it. Respond to under_attack events with attackmove of combat units. If a tool returns an error, read it and adapt.',
  `Your goal: ${goal}`,
  'Game rules (JSON):',
  JSON.stringify(rules),
].join('\n\n')

const tools = TOOLS.filter(t => t.name !== 'wait').map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
const history = []
let eventSeq = 0, chatSeq = 0, turn = 0, totalTokens = 0

async function chat(messages) {
  const res = await fetch(llmUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], tools, tool_choice: 'auto', temperature: 0.3 }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`LLM antwortete nicht mit JSON (${res.status}): ${text.slice(0, 200)}`) }
  if (!res.ok) throw new Error(`LLM-Fehler ${res.status}: ${json.error?.message ?? text.slice(0, 200)}`)
  totalTokens += json.usage?.total_tokens ?? 0
  return json.choices[0].message
}

async function commanderTurn() {
  turn++
  // Der Befehlskanal wird bei JEDEM Zug gelesen. Anweisungen des Spielers sind
  // der Grund, warum es ihn gibt – sie dürfen nicht davon abhängen, dass der
  // Agent von sich aus nachsieht.
  // NICHT `chat` nennen – so hieße die Variable wie die Funktion, die das Modell
  // aufruft, und würde sie innerhalb dieses Zuges verdecken.
  const [situation, events, kanal, civic] = await Promise.all([
    client.get('/me/situation'),
    client.get('/me/events', { since: eventSeq }),
    client.get('/me/chat', { since: chatSeq }).catch(() => ({ messages: [], lastSeq: chatSeq })),
    client.get('/me/civic'),
  ])
  eventSeq = events.latestSeq
  const orders = (kanal.messages ?? []).filter(m => m.from === 'player')
  chatSeq = kanal.lastSeq ?? chatSeq
  const compact = {
    turn, time: situation.time, player: situation.player, funds: situation.economy.funds, power: situation.power,
    buildings: situation.base.counts, units: situation.army.counts, extractors: situation.economy.extractors,
    production: situation.production, available: situation.available.map(a => `${a.type} (${a.cost})`), locked: situation.locked.map(l => `${l.type} needs ${l.missing.join('+')}`),
    threats: situation.threats.slice(0, 10), depositsNearby: situation.economy.deposits.slice(0, 5), hints: situation.hints, newEvents: events.events,
    civic, ordersFromYourCommander: orders.map(o => o.text),
  }
  if (orders.length) log('Anweisung:', orders.map(o => o.text).join(' | '))
  history.push({ role: 'user', content: `Situation report (turn ${turn}):\n${JSON.stringify(compact)}` })
  while (history.length > 30) history.shift()
  while (history.length && history[0].role !== 'user') history.shift()
  let letzterText = ''
  for (let step = 0; step < 20; step++) {
    const msg = await chat(history)
    history.push(msg)
    if (msg.content) { letzterText = String(msg.content).trim(); log('KI:', letzterText.slice(0, 400)) }
    const calls = msg.tool_calls ?? []
    if (!calls.length) { await berichten(letzterText); return }
    for (const call of calls) {
      let input = {}
      try { input = call.function.arguments ? JSON.parse(call.function.arguments) : {} } catch { input = {} }
      let content
      try {
        const result = await runTool(client, call.function.name, input)
        content = JSON.stringify(result)
        log(`  tool ${call.function.name}(${JSON.stringify(input)}) -> ok`)
      } catch (error) {
        content = `Error: ${error.message}`
        log(`  tool ${call.function.name}(${JSON.stringify(input)}) -> ${error.message}`)
      }
      history.push({ role: 'tool', tool_call_id: call.id, content: content.slice(0, 12000) })
    }
  }
  await berichten(letzterText)
}

/**
 * Jeder Zug endet mit einer Meldung im Befehlskanal. Darauf zu hoffen, dass das
 * Modell von sich aus das Chat-Werkzeug aufruft, reicht nicht – es tat es
 * schlicht nicht. Der Mensch soll sehen, was seine KI tut, ohne darum bitten
 * zu müssen, deshalb steht der Bericht hier fest verdrahtet.
 */
let letzterBericht = ''
async function berichten(text) {
  const sauber = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!sauber || sauber === letzterBericht) return
  letzterBericht = sauber
  try { await client.post('/me/chat', { text: sauber.slice(0, 500) }) } catch { /* der Zug zählt mehr als der Bericht */ }
}

log(`LLM-Kommandant verbunden mit ${url}, Modell ${model} über ${llmUrl}, Zug alle ${interval / 1000} s`)
for (;;) {
  try { await commanderTurn() } catch (error) { log('Fehler:', error.message) }
  log(`Runde ${turn} beendet, ${totalTokens} Tokens insgesamt`)
  await new Promise(r => setTimeout(r, interval))
}

#!/usr/bin/env node
/**
 * KI-Kommandant: Claude spielt über die REST-API (Tool Use). Baut, verteidigt und erweitert die Basis.
 *
 *   node agents/claude-commander.mjs --url http://localhost:8080 --name "Claude" [--faction aurora] [--lon 10 --lat 50]
 *       [--interval 60] [--model claude-opus-5] [--effort medium] [--goal "..."]
 *
 * Benötigt Zugangsdaten für die Claude API (ANTHROPIC_API_KEY oder `ant auth login`).
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient, ensureToken, TOOLS, runTool, parseArgs } from './toolset.mjs'

const args = parseArgs(process.argv.slice(2), { interval: '60', model: 'claude-opus-5', effort: 'medium', faction: 'aurora' })
const url = args.url ?? process.env.REALCOMMAND_URL ?? 'http://localhost:8080'
const client = createClient({ url, token: args.token ?? process.env.REALCOMMAND_TOKEN })
await ensureToken(client, { name: args.name ?? process.env.REALCOMMAND_NAME ?? 'Claude' })
const anthropic = new Anthropic()
const interval = Math.max(10, Number(args.interval)) * 1000
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const rules = await client.get('/rules')
const goal = args.goal ?? `Found a base as faction "${args.faction}"${args.lon ? ` near lon ${args.lon}, lat ${args.lat}` : ''}, build a working economy (power, refinery, extractors), then factories and defenses, keep the power balance positive, scout the surroundings and grow the army. Defend when attacked. Be economical with funds.`

const system = [
  'You are the commander of a base in Real Command, a persistent real-time strategy game on the world map. You act only through the provided tools; the game keeps running between your turns, in real time (minutes for buildings, km/h for units).',
  'Each turn you receive the current situation and new events. Decide what to do, call the tools, and finish the turn with a short log line (one or two sentences) describing what you did and why. Do not narrate tool calls one by one.',
  'Guidelines: production costs are paid immediately, so keep a small reserve. One building at a time per category; place "ready" buildings promptly (find_build_spots + place_building). Keep extractors busy and near refineries. Never move the crawler far before deploying. Respond to under_attack events with attackmove of combat units.',
  `Your goal: ${goal}`,
  'Game rules (JSON):',
  JSON.stringify(rules),
].join('\n\n')

const tools = TOOLS.filter(t => t.name !== 'wait').map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
const history = []
let eventSeq = 0
let turn = 0

async function commanderTurn() {
  turn++
  const [situation, events] = await Promise.all([client.get('/me/situation'), client.get('/me/events', { since: eventSeq })])
  eventSeq = events.latestSeq
  const compact = {
    turn, time: situation.time, player: situation.player, funds: situation.economy.funds, power: situation.power,
    buildings: situation.base.counts, units: situation.army.counts, extractors: situation.economy.extractors,
    production: situation.production, available: situation.available.map(a => `${a.type} (${a.cost})`), locked: situation.locked.map(l => `${l.type} needs ${l.missing.join('+')}`),
    threats: situation.threats.slice(0, 10), depositsNearby: situation.economy.deposits.slice(0, 5), hints: situation.hints,
    newEvents: events.events,
  }
  history.push({ role: 'user', content: `Situation report (turn ${turn}):\n${JSON.stringify(compact)}` })
  // Verlauf begrenzen: nur die letzten Runden behalten (jede Runde beginnt mit einer user-Nachricht).
  while (history.length > 24) history.shift()
  while (history.length && history[0].role !== 'user') history.shift()

  for (let step = 0; step < 25; step++) {
    const response = await anthropic.beta.messages.create({
      model: args.model,
      max_tokens: 16000,
      system,
      tools,
      messages: history,
      thinking: { type: 'adaptive' },
      output_config: { effort: args.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    history.push({ role: 'assistant', content: response.content })
    if (response.stop_reason === 'refusal') {
      log('Claude hat den Zug abgelehnt:', response.stop_details?.explanation ?? '')
      return
    }
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    for (const block of response.content) if (block.type === 'text' && block.text.trim()) log('CLAUDE:', block.text.trim())
    if (response.stop_reason !== 'tool_use' || !toolUses.length) return
    const results = []
    for (const use of toolUses) {
      try {
        const result = await runTool(client, use.name, use.input)
        log(`  tool ${use.name}(${JSON.stringify(use.input)}) -> ok`)
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) })
      } catch (error) {
        log(`  tool ${use.name}(${JSON.stringify(use.input)}) -> ${error.message}`)
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Error: ${error.message}`, is_error: true })
      }
    }
    history.push({ role: 'user', content: results })
  }
}

log(`Claude-Kommandant verbunden mit ${url}, Modell ${args.model}, Zug alle ${interval / 1000} s`)
for (;;) {
  try {
    await commanderTurn()
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) log('Rate-Limit, warte …')
    else if (error instanceof Anthropic.AuthenticationError) { log('Keine gültigen Claude-Zugangsdaten (ANTHROPIC_API_KEY oder `ant auth login`).'); process.exit(1) }
    else if (error instanceof Anthropic.APIError) log(`Claude-API-Fehler ${error.status}: ${error.message}`)
    else log('Fehler:', error.message)
  }
  await new Promise(r => setTimeout(r, interval))
}

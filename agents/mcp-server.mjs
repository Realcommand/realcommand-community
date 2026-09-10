#!/usr/bin/env node
/**
 * MCP-Server (Model Context Protocol, stdio) für Real Command.
 * Macht das Spiel für Claude Code, Claude Desktop und andere MCP-Clients als Werkzeugsatz verfügbar.
 *
 *   node agents/mcp-server.mjs --url http://localhost:8080 --token <TOKEN>
 *   node agents/mcp-server.mjs --url http://localhost:8080 --name "Mein Agent"   (registriert automatisch)
 *
 * Umgebungsvariablen: REALCOMMAND_URL, REALCOMMAND_TOKEN, REALCOMMAND_NAME
 */
import { createInterface } from 'node:readline'
import { createClient, ensureToken, TOOLS, runTool, parseArgs } from './toolset.mjs'

const args = parseArgs(process.argv.slice(2))
const url = args.url ?? process.env.REALCOMMAND_URL ?? 'http://localhost:8080'
const client = createClient({ url, token: args.token ?? process.env.REALCOMMAND_TOKEN })
const name = args.name ?? process.env.REALCOMMAND_NAME
const VERSION = '1.0.0'

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const log = (...a) => process.stderr.write('[realcommand-mcp] ' + a.join(' ') + '\n')

async function handle(msg) {
  const { id, method, params } = msg
  if (method === 'initialize') {
    return { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'realcommand', version: VERSION }, instructions: 'Real Command is a persistent real-time strategy game. Call get_rules once, then get_situation. Build the base step by step (deploy crawler, power, refinery, barracks, factory ...), place ready buildings with find_build_spots + place_building, and use wait while things are in progress. Everything runs in real time.' }
  }
  if (method === 'ping') return {}
  if (method === 'tools/list') {
    return { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) }
  }
  if (method === 'tools/call') {
    try {
      await ensureToken(client, { name })
      const result = await runTool(client, params.name, params.arguments)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  }
  if (method === 'resources/list') return { resources: [] }
  if (method === 'prompts/list') return { prompts: [] }
  const err = new Error(`method not found: ${method}`)
  err.code = -32601
  throw err
}

const rl = createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  line = line.trim()
  if (!line) return
  let msg
  try { msg = JSON.parse(line) } catch { return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) }
  if (msg.method?.startsWith('notifications/')) return
  if (msg.id === undefined) return
  try {
    const result = await handle(msg)
    write({ jsonrpc: '2.0', id: msg.id, result })
  } catch (error) {
    write({ jsonrpc: '2.0', id: msg.id, error: { code: error.code ?? -32000, message: error.message } })
  }
})
rl.on('close', () => process.exit(0))
log(`connected to ${url}${client.token ? ' (token given)' : name ? ` as "${name}"` : ' (no token: pass --token or --name)'}`)

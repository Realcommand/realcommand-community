// Development server for the Real Command interface.
//
// It serves what this repository owns — the pages, the styles and the bundles
// esbuild just built — and forwards everything else to a running game server:
// the REST API, the WebSocket protocol, the land mask and the world assets. So
// a change to the interface can be tried against a live world without a copy of
// the simulation.
//
//   npm run dev                                  # against https://realcommand.reco.games
//   GAME_URL=http://localhost:8080 npm run dev   # against your own server
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { extname, join, normalize, resolve, sep } from 'node:path'

const game = new URL(process.env.GAME_URL ?? 'https://realcommand.reco.games')
const port = Number(process.env.PORT ?? 8100)
const root = resolve(import.meta.dirname, '..', 'public')
const secure = game.protocol === 'https:'
const upstreamPort = Number(game.port) || (secure ? 443 : 80)
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.map': 'application/json', '.svg': 'image/svg+xml',
}

const watcher = spawn(process.execPath, [join(import.meta.dirname, 'build.mjs'), '--watch'], { stdio: 'inherit' })
const stop = () => { if (watcher.exitCode === null) watcher.kill('SIGTERM') }
process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', stop)

/** Only files this repository actually carries are served locally. */
async function local(url) {
  const path = normalize(decodeURIComponent(new URL(url, 'http://localhost').pathname))
  const file = join(root, path === sep ? 'index.html' : path)
  if (!file.startsWith(root + sep)) return undefined
  try { return (await stat(file)).isFile() ? file : undefined } catch { return undefined }
}

function headers(source) {
  const copy = { ...source, host: game.host }
  delete copy['accept-encoding']
  return copy
}

function proxy(req, res) {
  const send = secure ? httpsRequest : httpRequest
  const upstream = send({ hostname: game.hostname, port: upstreamPort, path: req.url, method: req.method, headers: headers(req.headers) },
    answer => { res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res) })
  upstream.on('error', error => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`The game server at ${game.origin} did not answer: ${error.message}\n`)
  })
  req.pipe(upstream)
}

const server = createServer(async (req, res) => {
  const file = req.method === 'GET' || req.method === 'HEAD' ? await local(req.url) : undefined
  if (!file) return proxy(req, res)
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
})

// The game speaks WebSocket on the same origin it serves the client from, so the
// upgrade is forwarded byte for byte instead of being answered here.
server.on('upgrade', (req, socket, head) => {
  const upstream = secure
    ? tlsConnect({ host: game.hostname, port: upstreamPort, servername: game.hostname })
    : netConnect({ host: game.hostname, port: upstreamPort })
  upstream.on(secure ? 'secureConnect' : 'connect', () => {
    const lines = Object.entries(headers(req.headers))
      .flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map(one => `${name}: ${one}\r\n`))
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('')}\r\n`)
    if (head?.length) upstream.write(head)
    socket.pipe(upstream); upstream.pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(port, () => console.log(`Interface on http://localhost:${port}, world from ${game.origin}`))

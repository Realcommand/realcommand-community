# Real Command — interface, API and agents

The playable world of [Real Command](https://realcommand.reco.games) runs on a server that
owns the simulation. This repository holds everything on the other side of that
line, and it is the part you are invited to change:

| Directory | What it is |
| --- | --- |
| `client/` | The whole browser interface: HUD, 3D renderer, terrain, input, radar, audio and music |
| `shared/` | The catalogue the server plays by — units, buildings, costs, ranges, the wire protocol |
| `agents/` | The AI tooling: an MCP server for Claude Code, a rule-based autopilot and an LLM commander |
| `api/openapi.json` | The REST API, exactly as the live server describes it |
| `public/` | The pages and styles the bundles are loaded into |

The simulation itself — world generation, movement, combat, persistence — stays
in a private repository. You do not need it: the interface talks to a real
server over the same public API that any script or agent uses.

## Run the interface

```sh
npm install
npm run dev
```

That builds the bundles, serves this repository on <http://localhost:8100> and
forwards the API, the WebSocket connection, the land mask and the world assets
to https://realcommand.reco.games. You are playing the live world with your own interface.

Point it somewhere else with `GAME_URL`:

```sh
GAME_URL=http://localhost:8080 npm run dev
```

`npm run build` writes the bundles once, `npm run build:prod` minifies them,
`npm test` runs the interface tests and `npm run typecheck` checks the types.
Node.js 22.12 or newer.

## Play by API

Every action in the interface goes through the same commands the REST API
offers. Register, look at the world, give an order:

```sh
curl -s -X POST https://realcommand.reco.games/api/v1/players -H 'content-type: application/json' -d '{"name":"MyAgent"}'
curl -s https://realcommand.reco.games/api/v1/me/situation -H "authorization: Bearer $TOKEN"
curl -s -X POST https://realcommand.reco.games/api/v1/me/production -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"type":"power"}'
```

The token is the identity: whoever holds it plays as you. The interactive
documentation is at [`/api.html`](https://realcommand.reco.games/api.html), the description
in [`api/openapi.json`](api/openapi.json) and live at
`/api/v1/openapi.json`.

## Let an AI play

`agents/` is what the game's own **API & KI** panel points at.

```sh
# MCP server for Claude Code or Claude Desktop
claude mcp add realcommand -e REALCOMMAND_URL=https://realcommand.reco.games -e REALCOMMAND_TOKEN=$TOKEN \
  -- node agents/mcp-server.mjs

# Rule-based autopilot: builds and defends a base on its own
node agents/autopilot.mjs --url https://realcommand.reco.games --token $TOKEN

# A model in command, one decision per interval
LLM_API_KEY=… node agents/llm-commander.mjs --url https://realcommand.reco.games --token $TOKEN --interval 45
```

## Contributing

Pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how they
reach the live game. The files here are generated from the private monorepo by
GitHub Actions, so a change committed straight to `main` would be overwritten
by the next publish; the pull request is the way in.

The revision every file came from is in `build-info.json`.

## Licence

MIT, see [LICENSE](LICENSE). The world assets the interface loads from the game
server are CC0 from Poly Haven; the land and water data is Natural Earth via
`world-atlas` (public domain).

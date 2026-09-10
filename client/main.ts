import { Context } from 'cordis'
import { Camera } from './camera.ts'
import { Terrain } from './terrain.ts'
import { Link } from './link.ts'
import { GameState } from './state.ts'
import { Effects } from './effects.ts'
import { Audio } from './audio.ts'
import { Renderer } from './renderer.ts'
import { Input } from './input.ts'
import { UI } from './ui.ts'

const ctx = new Context()
ctx.logger.exporter({
  export(message) {
    const args = message.args
    if (message.type === 'error') console.error(`[${message.name}]`, ...args)
    else if (message.type === 'warn') console.warn(`[${message.name}]`, ...args)
    else console.log(`[${message.name}]`, ...args)
  },
})

ctx.plugin(Camera)
ctx.plugin(Terrain)
ctx.plugin(Link)
ctx.plugin(GameState)
ctx.plugin(Effects)
ctx.plugin(Audio)
ctx.plugin(Input)
ctx.plugin(Renderer)
ctx.plugin(UI)

;(window as any).rc = ctx

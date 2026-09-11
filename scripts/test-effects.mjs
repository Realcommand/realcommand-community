import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { Matrix4, Vector3 } from 'three'
import { Effects } from '../client/effects.ts'
import { Camera } from '../client/camera.ts'
import { makeModel } from '../client/poly/models.ts'
import { DEFS } from '../shared/data.ts'

const random=Math.random
try {
  Math.random=()=>.5
  for(const type of ['power','factory'])for(const heading of [0,.9,Math.PI]) {
    const effects=new Effects(new Context()),def=DEFS[type]
    const e={id:7,type,x:20e6,y:10e6,heading}
    const ports=makeModel(def).filter(p=>p.exhaust)
    assert.equal(ports.length,2,`${type} has two actual chimney openings`)
    effects.emitExhaust(e,180)
    assert.equal(effects.particles.length,2)
    const root=new Matrix4().makeRotationY(-heading).scale(new Vector3(def.size,def.size,def.size))
    root.setPosition(e.x,180,e.y)
    for(const [i,port] of ports.entries()) {
      const mouth=new Vector3(port.p[0],port.p[1]+port.s[1]/2,port.p[2]).applyMatrix4(root)
      const p=effects.particles[i]
      assert.ok(Math.hypot(p.x-mouth.x,p.y-mouth.z,p.elevation-mouth.y)<1e-8,'emission follows the rendered model, heading and terrain elevation')
      assert.ok(p.size+p.grow*p.ttl<def.size*.05,'wisps stay smaller than 5% of the building radius throughout their lifetime')
    }
    const p=effects.particles[0],before={...p}
    effects.update(.5)
    assert.ok(p.elevation>before.elevation,'buoyancy raises world height')
    assert.ok(Math.abs(p.y-before.y)<.1,'rising smoke does not slide north over the ground')
    effects.update(3)
    assert.equal(effects.particles.length,0,'ambient wisps dissipate promptly')
  }
} finally { Math.random=random }

const effects=new Effects(new Context()),e={id:100,type:'factory',x:20e6,y:10e6,heading:0}
effects.emitExhaust({...e,off:true},80)
assert.equal(effects.particles.length,0,'an offline plant emits no exhaust')
for(let frame=0;frame<600;frame++) {
  effects.update(1/60);effects.emitExhaust(e,80)
  assert.ok(effects.particles.length<=48,'dense wisps have a bounded particle budget')
}
const cam=new Camera(new Context());cam.resize(1280,720);cam.heightAt=()=>80
cam.moveTo(e.x,e.y,1)
const p=effects.particles[0]
assert.deepEqual(cam.worldToScreen(p.x,p.y,p.elevation),cam.worldToScreen(p.x,p.y),'vertical ascent remains over the chimney in tactical view')
cam.perspective=true
assert.ok(cam.worldToScreen(p.x,p.y,p.elevation)[1]<cam.worldToScreen(p.x,p.y)[1],'perspective projects the smoke above its ground position')
cam.perspective=false
const draws=[],stops=[]
const g={
  createRadialGradient:()=>({addColorStop:(...args)=>stops.push(args)}),
  beginPath(){},arc:(...args)=>draws.push(args),fill(){},
}
effects.draw(g,cam)
assert.equal(draws.length,effects.particles.length)
assert.ok(stops.some(([at,color])=>at===1&&color.endsWith(',0)')),'wisps have transparent edges instead of flat discs')
const radius=draws[0][2];draws.length=0;cam.moveTo(e.x,e.y,2)
effects.draw(g,cam)
assert.ok(Math.abs(draws[0][2]-radius/2)<1e-6,'zoom scales the wisps without imposing a large minimum screen size')
effects.update(3)
assert.equal(effects.particles.length,0)
console.log('Abgas-Effekte bestanden: Kaminpositionen, Modellnormalisierung, Rotation, Höhenprojektion, feine Partikel, Ausblenden, Zoom und begrenztes Budget.')

// --- Ereigniseffekte ---------------------------------------------------------
// Jedes Ereignis des Protokolls hinterlässt ein sichtbares Zeichen, und zwar das
// zur Sache passende: Wasser spritzt, Menschen lassen kein Wrack zurück.

const world = new Context()
const entities = new Map()
let wet = false
world.provide('state', { entities })
world.provide('terrain', { isWater: () => wet })
const fx = new Effects(world)
fx[Service.init]()
const send = (event) => {
  fx.particles.length = 0; fx.rings.length = 0; fx.flashes.length = 0; fx.decals.length = 0
  world.emit('state/event', event)
  return fx
}
const kinds = () => new Set(fx.particles.map(p => p.kind))
const decals = () => new Set(fx.decals.map(d => d.kind))
const X = 20e6, Y = 10e6
const shotAt = (w) => send({ e: 'shot', from: 1, x: X, y: Y, tx: X + 200, ty: Y, w, ttl: 0.5 })

assert.equal(shotAt('bullet').flashes.length, 1, 'Pulverwaffen blitzen')
assert.equal(shotAt('shell').flashes.length, 1)
for (const w of ['bomb', 'torpedo', 'melee', 'arrow']) {
  assert.equal(shotAt(w).flashes.length, 0, `${w} hat kein Mündungsfeuer`)
}
assert.ok(shotAt('melee').particles.length > 0, 'ein Nahkampfschlag wirbelt Staub auf')

wet = true
send({ e: 'hit', x: X, y: Y, w: 'shell', r: 40 })
assert.deepEqual(kinds(), new Set(['steam']), 'ein Einschlag im Wasser wirft eine Fontäne, kein Feuer')
assert.equal(fx.decals.length, 0, 'im Wasser bleibt kein Krater')
assert.equal(fx.rings.length, 1, 'die Wellen laufen als Ring auseinander')
wet = false

send({ e: 'hit', x: X, y: Y, w: 'flak', r: 0 })
assert.ok(kinds().has('smoke') && kinds().has('spark'), 'Flak zerplatzt als Wolke in der Luft')
assert.equal(fx.decals.length, 0, 'ein Luftziel hinterlässt keine Bodenspur')

send({ e: 'hit', x: X, y: Y, w: 'bullet', r: 0 })
assert.ok(kinds().has('spark'), 'Einschläge auf Panzerung funken')

send({ e: 'hit', x: X, y: Y, w: 'shell', r: 90 })
assert.ok(kinds().has('fire') && kinds().has('dust'), 'schwere Sprengköpfe treiben Feuer und Staub')
assert.ok(fx.rings.length >= 2, 'die Druckwelle bekommt eine zweite, weitere Front')
assert.ok(decals().has('crater'))

send({ e: 'die', id: 1, x: X, y: Y, ty: 'rifleman', k: 'p' })
assert.equal(fx.decals.length, 0, 'ein gefallener Mensch hinterlässt kein Wrack und keinen Krater')
assert.ok(kinds().has('dust') && !kinds().has('fire'), 'er brennt auch nicht')

send({ e: 'die', id: 2, x: X, y: Y, ty: 'mbt', k: 'u' })
assert.deepEqual(decals(), new Set(['wreck', 'crater']), 'ein Fahrzeug bleibt als Wrack liegen')
assert.ok(kinds().has('fire') && kinds().has('debris'))

send({ e: 'die', id: 3, x: X, y: Y, ty: 'power', k: 'b' })
assert.deepEqual(decals(), new Set(['rubble', 'crater']), 'ein Gebäude stürzt in Trümmer')

send({ e: 'gather', id: 4, x: X, y: Y, rs: 'wood' })
assert.deepEqual(kinds(), new Set(['debris']), 'Holz splittert')
send({ e: 'gather', id: 4, x: X, y: Y, rs: 'stone' })
assert.deepEqual(kinds(), new Set(['dust']), 'Stein staubt')

entities.set(7, { id: 7, x: X, y: Y, def: DEFS['power'] })
send({ e: 'capture', id: 7, by: 2 })
assert.equal(fx.rings.length, 1, 'eine Übernahme markiert das Gebäude')
assert.ok(kinds().has('spark'))
send({ e: 'site_done', id: 7, ty: 'power' })
assert.equal(fx.rings.length, 1, 'ein fertiger Bau meldet sich am Ort')
assert.ok(fx.particles.length > 0)
send({ e: 'arrive', id: 7 })
assert.equal(fx.rings.length, 1, 'Zuwanderung zeigt sich an der Siedlung')
send({ e: 'arrive', id: 99 })
assert.equal(fx.rings.length, 0, 'unbekannte Ziele erzeugen nichts')
send({ e: 'avatar_died', id: 1, x: X, y: Y })
assert.equal(fx.rings.length, 1, 'der gefallene Avatar bekommt eine deutliche Marke')
assert.ok(kinds().has('smoke'))

// --- Dauerhafte Spuren -------------------------------------------------------

fx.particles.length = 0
fx.emitWake(11, X, Y, 0, 12)
assert.equal(fx.particles.length, 2, 'ein Schiff zieht Schaum zu beiden Seiten')
assert.ok(fx.particles.every(p => p.kind === 'steam' && p.x < X), 'der Schaum bleibt hinter dem Heck')
fx.emitWake(11, X, Y, 0, 12)
assert.equal(fx.particles.length, 2, 'die Spur wird gedrosselt, nicht je Bild erzeugt')

fx.particles.length = 0
fx.emitContrail(12, X, Y, 0, 20)
assert.equal(fx.particles.length, 1)
const trail = fx.particles[0]
assert.ok(trail.ttl > 5 && trail.alpha < 0.5, 'ein Kondensstreifen steht lange und blass')
assert.ok(trail.vx === 0 && trail.vy === 0, 'er bleibt liegen, wo das Flugzeug war')

fx.particles.length = 0
fx.emitDownwash(13, X, Y, 8)
assert.equal(fx.particles.length, 3, 'ein Hubschrauber drückt Staub nach außen')
assert.ok(fx.particles.every(p => p.kind === 'dust' && Math.hypot(p.vx, p.vy) > 8), 'und zwar deutlich')

// --- Fahrspuren ---------------------------------------------------------------
// Die Spur gehört dem Boden: Sie liegt unter den Ketten des gezeichneten
// Modells und wird mit der Entfernung schmal wie alles andere im Gelände.

const tracked = DEFS['lighttank']
const treads = makeModel(tracked).filter(p => p.color === '#1c211e' && Math.abs(p.p[2]) > 0)
assert.equal(treads.length, 2, 'der Panzer fährt auf zwei Ketten')
fx.tracks.length = 0
const drive = (steps) => { for (let i = 0; i < steps; i++) fx.emitTracks({ id: 21, type: 'lighttank', x: X, y: Y - 600 + i * 30 }) }
drive(1)
assert.equal(fx.tracks.length, 0, 'das erste Bild merkt sich nur den Standort')
drive(40)
const rut = fx.tracks[0]
assert.ok(Math.abs(rut.gauge / tracked.size - Math.abs(treads[0].p[2])) < 0.06, 'die Spurweite ist die Kettenweite des Modells, nicht die Rumpfgröße')
assert.ok(Math.abs(rut.rail * 2 / tracked.size - treads[0].s[2]) < 0.06, 'und die Spur so breit wie die Kette')
fx.emitTracks({ id: 21, type: 'lighttank', x: X, y: Y })
assert.equal(fx.tracks.length, 39, 'stehende Fahrzeuge schreiben keine Segmente fort')

const view = new Camera(new Context())
view.resize(1280, 720)
view.heightAt = () => 40
view.perspective = true
view.moveTo(X, Y, 0.5)
const fills = []
let path = []
const canvas = {
  fillStyle: '', lineWidth: 0, strokeStyle: '', lineCap: '',
  beginPath() { path = [] },
  moveTo(x, y) { path.push([x, y]) },
  lineTo(x, y) { path.push([x, y]) },
  closePath() {}, stroke() { fills.push({ style: this.strokeStyle, path: path.slice() }) },
  fill() { fills.push({ style: this.fillStyle, path: path.slice() }) },
  arc() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {},
  createRadialGradient: () => ({ addColorStop() {} }), roundRect() {},
}
fx.decals.length = 0
fx.drawDecals(canvas, view)
assert.equal(fills.length, 1, 'gleich alte Segmente füllen einen Pfad, damit sich die Stöße nicht doppelt decken')
const quad = (i) => fills[0].path.slice(i * 4, i * 4 + 4)
const width = (i) => Math.hypot(quad(i)[0][0] - quad(i)[3][0], quad(i)[0][1] - quad(i)[3][1])
assert.equal(fills[0].path.length % 8, 0, 'jedes gezeichnete Segment liefert zwei Ketten als Vierecke')
assert.ok(fills[0].path.length / 8 < fx.tracks.length, 'was neben dem Bild liegt, wird gar nicht erst gezeichnet')
assert.ok(width(fills[0].path.length / 4 - 1) > width(0) * 3, 'nah ist die Spur deutlich breiter als fern')
const far = quad(0)[0][1], near = quad(fills[0].path.length / 4 - 1)[0][1]
assert.ok(near > far, 'und sie läuft nach hinten ins Bild')
fx.update(32)
for (let i = 0; i < 6; i++) fx.emitTracks({ id: 21, type: 'lighttank', x: X + i * 30, y: Y })
fills.length = 0
fx.drawDecals(canvas, view)
const alpha = fills.map(f => Number(f.style.split(',')[3].slice(0, -1)))
assert.ok(fills.length > 1, 'alte und frische Spuren werden getrennt gefüllt')
assert.ok(Math.max(...alpha) === 0.3 && Math.min(...alpha) < 0.3, 'die alte Spur ist blasser als die frische, keine dunkler als frisch')
fx.update(12)
fills.length = 0
fx.drawDecals(canvas, view)
assert.equal(fills.length, 1, 'die alte Spur ist vergangen, die frische steht noch')
fx.update(40)
fills.length = 0
fx.drawDecals(canvas, view)
assert.equal(fills.length, 0, 'nach einer Weile ist der Boden wieder unberührt')

console.log('Ereigniseffekte bestanden: Mündungsfeuer nach Waffenart, Wasserfontänen, Flakwolken, Druckwellen, Wracks, Trümmer, Späne, Baumeldungen, Avatarverlust, Kielwasser, Kondensstreifen, Rotorabwind und Fahrspuren.')

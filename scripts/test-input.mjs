import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { Camera } from '../client/camera.ts'
import { Input } from '../client/input.ts'
import { GameState } from '../client/state.ts'
import { DEFS } from '../shared/data.ts'

// Real input handlers and camera, with DOM event targets instead of a live game.
const windowTarget = new EventTarget()
const canvas = Object.assign(new EventTarget(), { dataset: {} })
const sidebar = { classList: { contains: () => false }, getBoundingClientRect: () => ({ left: 984 }) }
const documentTarget = Object.assign(new EventTarget(), {
  activeElement: null,
  getElementById: id => id === 'game' ? canvas : null,
  querySelector: selector => selector === '.hud-side' ? sidebar : { getBoundingClientRect: () => ({ height: 36 }) },
  elementFromPoint: (x,y) => x<0||x>=1280||y<0||y>=720 ? null : x>=984||y<36 ? sidebar : canvas,
})
const globals = {
  document: documentTarget,
  innerWidth: 1280,
  innerHeight: 720,
  HTMLInputElement: class {},
  HTMLTextAreaElement: class {},
  addEventListener: windowTarget.addEventListener.bind(windowTarget),
  removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
}
const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true })

const ctx = new Context()
const camera = new Camera(ctx)
const state = new GameState(ctx)
ctx.set('camera', camera)
ctx.set('state', state)
const sent=[]
ctx.provide('link',{send:message=>sent.push(message)})
const input = new Input(ctx)
const cleanup = input[Service.init]()
camera.resize(1280, 720)
const origin = () => camera.moveTo(20e6, 10e6, 2)
const position = () => [camera.x, camera.y, camera.mpp]
const frame = () => { input.update(1 / 60); camera.update(1 / 60) }
const dispatch = (receiver, type, fields = {}, target = receiver) => {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, fields)
  Object.defineProperty(event, 'target', { value: target })
  receiver.dispatchEvent(event)
  return event
}

try {
  for (const [name, x, y] of [
    ['left edge', 1, 360], ['right edge', 1279, 360],
    ['top edge below toolbar', 640, 37], ['bottom edge', 640, 719],
    ['top-left corner', 1, 37], ['bottom-right corner', 983, 719],
    ['sidebar approach', 983, 360],
  ]) {
    origin()
    const before = position()
    dispatch(windowTarget, 'pointermove', { clientX: x, clientY: y }, canvas)
    for (let i = 0; i < 60; i++) frame()
    assert.deepEqual(position(), before, `Pointer at ${name} must not move the camera`)
  }

  origin()
  const beforeMenu = position()
  for (const x of [950, 960, 975, 983, 990, 1100]) {
    dispatch(windowTarget, 'pointermove', { clientX: x, clientY: 360 }, x < 984 ? canvas : sidebar)
    frame()
  }
  assert.deepEqual(position(), beforeMenu, 'Crossing into the sidebar must not nudge the map')

  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    origin()
    const before = position()
    dispatch(windowTarget, 'keydown', { code, key: code })
    frame()
    assert.notDeepEqual(position(), before, `${code} still pans deliberately`)
    dispatch(windowTarget, 'keyup', { code })
    const stopped = position()
    frame()
    assert.deepEqual(position(), stopped, `${code} stops on release`)
  }

  origin()
  const wheel = (dx, dy, ctrlKey = false) => dispatch(canvas, 'wheel', { deltaX: dx, deltaY: dy, ctrlKey, shiftKey: false, clientX: 640, clientY: 360 })
  assert.equal(wheel(8, 12).defaultPrevented, true)
  assert.equal(camera.x, 20e6 + 16, 'Two-finger horizontal swipe pans')
  assert.ok(camera.y > 10e6, 'Two-finger vertical component pans')
  const swiped = position()
  wheel(0, 12)
  assert.equal(camera.x, swiped[0])
  assert.ok(camera.y > swiped[1], 'Vertical swipe continues panning after trackpad detection')
  assert.equal(camera.mpp, 2, 'Two-finger scrolling does not zoom')
  wheel(0, -2, true)
  frame()
  assert.ok(camera.mpp < 2, 'Pinch still zooms')

  for (const button of [1, 2]) {
    origin()
    dispatch(canvas, 'mousedown', { button, clientX: 640, clientY: 360 })
    dispatch(canvas, 'mousemove', { clientX: 620, clientY: 350 })
    assert.equal(camera.x, 20e6 + 40, `Mouse button ${button} still drags the map`)
    dispatch(windowTarget, 'mouseup', { button, clientX: 620, clientY: 350 })
  }

  origin();state.phase='play';state.myId=49
  const entity=(id,type,sx,sy,extra={})=>{
    const [x,y]=camera.screenToWorld(sx,sy),def=DEFS[type]
    const e={id,type,kind:def.kind==='unit'?'u':'b',owner:49,x,y,tx:x,ty:y,hp:def.hp,maxHp:def.hp,def,visible:true,ghost:false,...extra}
    state.entities.set(id,e);return e
  }
  const scout=entity(1,'scout',100,130)
  entity(2,'recon_drone',640,360)
  entity(3,'mbt',800,500)
  entity(4,'scout',1100,350) // under the HUD
  entity(5,'scout',1350,350) // outside the viewport
  entity(6,'scout',400,250,{ghost:true})
  entity(7,'scout',450,250,{visible:false})
  entity(8,'rifleman',500,250,{inside:10})
  const enemy=entity(9,'mbt',400,400,{owner:50})
  const transport=entity(10,'apc',550,250,{owner:50})
  entity(11,'command',500,500)
  entity(12,'scout',900,250,{hp:0})
  const click=(sx,sy,fields={})=>{
    const mouse={button:0,clientX:sx,clientY:sy,metaKey:false,ctrlKey:false,shiftKey:false,...fields}
    dispatch(canvas,'mousedown',mouse);dispatch(windowTarget,'mouseup',mouse)
  }
  const dbl=(sx,sy)=>{click(sx,sy);click(sx,sy)}
  dbl(200,600)
  assert.deepEqual([...state.selected],[1,2,3],'background double-click selects all visible own unit types, excluding buildings, enemies, passengers, hidden/dead units and HUD-covered positions')
  assert.equal(sent.length,0,'selection does not send orders')
  const stationary=position()
  click(100,130)
  assert.deepEqual([...state.selected],[scout.id])
  for(let i=0;i<30;i++)frame()
  assert.deepEqual(position(),stationary,'first click must not move the camera before the second click')
  click(100,130)
  assert.deepEqual([...state.selected],[1,2,3],'double-click on a unit also selects other types')

  const destination=camera.screenToWorld(720,580)
  click(720,580,{metaKey:true})
  assert.deepEqual(sent.at(-1),{t:'order',ids:[1,2,3],order:{k:'move',x:destination[0],y:destination[1]}})
  click(720,580,{button:2,shiftKey:true})
  assert.equal(sent.at(-1).order.queued,true,'Shift-right-click appends a destination')
  click(720,580,{metaKey:true,shiftKey:true})
  assert.equal(sent.at(-1).order.queued,true,'Shift-Command-click appends a destination')
  input.mode='attackmove'
  click(720,580,{shiftKey:true})
  assert.equal(sent.at(-1).order.k,'attackmove');assert.equal(sent.at(-1).order.queued,true)
  assert.equal(input.mode,'attackmove','Shift retains attack-move input for another waypoint')
  input.mode='move';input.queued=true
  click(720,580)
  assert.equal(sent.at(-1).order.k,'move');assert.equal(sent.at(-1).order.queued,true)
  assert.equal(input.mode,'move','route tool supports repeated unmodified taps')
  input.queued=false
  click(720,580)
  assert.equal(sent.at(-1).order.queued,undefined);assert.equal(input.mode,'normal')
  const beforeRouteTool=sent.length
  input.beginRoute(true)
  assert.equal(sent.length,beforeRouteTool,'choosing patrol does not issue an order')
  click(720,580)
  assert.equal(sent.at(-1).order.repeat,true);assert.equal(sent.at(-1).order.queued,undefined,'first patrol point replaces the old route')
  assert.equal(sent.at(-1).order.k,'attackmove')
  click(710,570)
  assert.equal(sent.at(-1).order.repeat,true);assert.equal(sent.at(-1).order.queued,true,'subsequent patrol points append')
  const beforeDone=sent.length
  input.endRoute()
  assert.equal(sent.length,beforeDone,'Fertig leaves the route running')
  assert.equal(input.repeat,false);assert.equal(input.queued,false);assert.equal(input.mode,'normal')
  click(720,580,{metaKey:true,shiftKey:true})
  assert.equal(sent.at(-1).order.repeat,undefined,'Shift append inherits the active patrol without changing its mode')
  input.beginRoute(false);click(720,580)
  assert.equal(sent.at(-1).order.repeat,false);assert.equal(sent.at(-1).order.queued,undefined)
  input.issue({k:'guard'})
  assert.equal(input.mode,'normal');assert.equal(input.queued,false,'manual guard ends route input')
  input.beginRoute(true)
  dispatch(windowTarget,'keydown',{code:'Escape',key:'Escape'})
  assert.equal(input.repeat,false);assert.equal(input.queued,false,'Escape clears all route tools')
  state.select([1,2,3])
  const beforeFocusedControl=sent.length
  dispatch(windowTarget,'keydown',{code:'KeyS',key:'s'}, {closest:()=>({})})
  assert.equal(sent.length,beforeFocusedControl,'typing on a focused HUD control does not issue a map hotkey')
  assert.deepEqual([...state.selected],[1,2,3],'Command-click retains selection')
  const sentBeforeRepeat=sent.length
  click(720,580,{metaKey:true})
  assert.equal(sent.length,sentBeforeRepeat+1,'repeated Command-clicks are commands, not selection double-clicks')
  click(400,400,{metaKey:true})
  assert.deepEqual(sent.at(-1),{t:'order',ids:[1,2,3],order:{k:'attack',target:enemy.id}})
  const commandAttack=sent.at(-1)
  click(400,400,{button:2})
  assert.deepEqual(sent.at(-1),commandAttack,'Command-left-click and right-click share target behavior')
  transport.owner=49
  click(550,250,{metaKey:true})
  assert.equal(sent.at(-1).order.k,'load');assert.equal(sent.at(-1).order.target,transport.id)

  const beforeRelease=sent.length
  dispatch(canvas,'mousedown',{button:0,clientX:720,clientY:580,metaKey:true})
  dispatch(windowTarget,'mouseup',{button:0,clientX:720,clientY:580,metaKey:false})
  assert.equal(sent.length,beforeRelease+1,'Command captured on press survives early key release')
  for(const mode of ['drag','menu','blur']){
    const before=sent.length,selection=[...state.selected]
    dispatch(canvas,'mousedown',{button:0,clientX:720,clientY:580,metaKey:true})
    if(mode==='drag')dispatch(canvas,'mousemove',{clientX:760,clientY:580})
    if(mode==='blur')dispatch(windowTarget,'blur')
    dispatch(windowTarget,'mouseup',{button:0,clientX:mode==='menu'?1100:mode==='drag'?760:720,clientY:580,metaKey:true})
    assert.equal(sent.length,before,`${mode} cannot send an accidental command`)
    assert.deepEqual([...state.selected],selection,`${mode} cannot replace the selection`)
    assert.equal(input.drag,undefined)
  }
  assert.equal(input.pickAt(500,250),undefined,'loaded passengers cannot be clicked through their transport')
  input.placing='power'
  const beforeCancel=sent.length
  click(720,580,{metaKey:true})
  assert.equal(input.placing,undefined);assert.equal(sent.length,beforeCancel,'Command-click shares placement cancellation with right-click')
  state.select([]);click(720,580,{metaKey:true});assert.equal(sent.length,beforeCancel,'no selection sends no unit orders')

  // Mit eigener Auswahl ist der Linksklick der Befehl, den der Zeiger zeigt.
  // Vorher musste man dafür die rechte Taste oder ⌘ treffen — auf kleinen
  // Fenstern und am Trackpad hat das niemand gefunden.
  state.entities.clear()
  const tank=entity(30,'mbt',300,300),feind=entity(31,'mbt',800,300,{owner:50})
  const eigenerLkw=entity(32,'apc',500,300),lager=entity(33,'command',200,600)
  state.select([tank.id])
  const ziel=camera.screenToWorld(700,600)
  const vorBefehl=sent.length
  click(700,600)
  assert.equal(sent.length,vorBefehl+1,'Linksklick auf freies Gelände befiehlt statt abzuwählen')
  assert.deepEqual(sent.at(-1),{t:'order',ids:[tank.id],order:{k:'move',x:ziel[0],y:ziel[1]}})
  assert.deepEqual([...state.selected],[tank.id],'die Auswahl bleibt bestehen')
  click(800,300)
  assert.equal(sent.at(-1).order.k,'attack','Linksklick auf einen Feind greift an, wie der Zeiger zeigt')
  assert.equal(sent.at(-1).order.target,feind.id)
  const vorAuswahl=sent.length
  click(200,600)
  assert.deepEqual([...state.selected],[lager.id],'eigene Objekte anzuklicken wählt weiterhin aus')
  assert.equal(sent.length,vorAuswahl,'und schickt keinen Befehl')
  state.select([tank.id])
  click(500,300)
  assert.equal(sent.at(-1).order.k,'load','ein eigener Transporter nimmt die Auswahl auf')
  state.select([tank.id])
  const vorUmschalt=sent.length
  click(700,600,{shiftKey:true})
  assert.equal(sent.length,vorUmschalt,'Umschalt bleibt der Auswahl vorbehalten und befiehlt nicht')
  state.select([])
  const vorLeer=sent.length
  click(700,600)
  assert.equal(sent.length,vorLeer,'ohne Auswahl bleibt der Linksklick reine Auswahl')
  state.select([tank.id])
  dispatch(windowTarget,'keydown',{key:'Escape'})
  assert.deepEqual([...state.selected],[],'Escape hebt die Auswahl auf – der Weg, der ohne Leerklick bleibt')

  // Screen-space selection must also work with the perspective camera and its trapezoidal ground view.
  state.entities.clear();camera.perspective=true;origin()
  entity(20,'scout',200,200);entity(21,'recon_drone',900,650)
  entity(22,'mbt',1400,650);entity(23,'mbt',1100,400);entity(24,'rifleman',450,400,{inside:25})
  dbl(300,600)
  assert.deepEqual([...state.selected],[20,21],'perspective selection uses actual projected pixels rather than a world bounding box')
  dispatch(canvas,'mousedown',{button:0,clientX:150,clientY:150})
  dispatch(canvas,'mousemove',{clientX:950,clientY:690})
  dispatch(windowTarget,'mouseup',{button:0,clientX:950,clientY:690})
  assert.deepEqual([...state.selected],[20,21],'drag box shares the same visibility rules')
  console.log('Eingabe bestanden: ruhige Ränder, Tastatur, Trackpad, Pinch, Ziehen; Doppelklick wählt alle sichtbaren eigenen Einheiten, Command-Klick, Rechtsklick und Linksklick mit Auswahl teilen Zielbefehle, keine Befehle bei Drag/Menü/Blur.')
} finally {
  cleanup()
  await ctx.fiber.dispose()
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
}

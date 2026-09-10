import { Context } from 'cordis'
import { h } from './engine/render.ts'
import { Camera } from './camera.ts'
import { PolyScene } from './poly/scene.ts'
import { graphicsSettings } from './poly/settings.ts'
import { LandMask } from '../shared/landmask.ts'
import { WORLD_W, WORLD_H } from '../shared/constants.ts'
import { worldToLonLat, cellX, cellY } from '../shared/geo.ts'
import { DEFS } from '../shared/data.ts'
import { BOT_PLAN, MAX_DEBUG_BOTS, type BotStatus, type BotPoint, type BotDetail } from '../shared/debug-bots.ts'
import type { ClientEntity } from './state.ts'

const params = new URLSearchParams(location.search)
const valid = (name: string, fallback: number, max: number) => { const value = Number(params.get(name)); return Number.isSafeInteger(value) && value > 0 && value <= max ? value : fallback }
let points: BotPoint[] = [], selected = valid('bot', 1, MAX_DEBUG_BOTS), detail: BotDetail | undefined, mask: LandMask | undefined
let view: 'world'|'city' = params.get('view') === 'city' ? 'city' : 'world', pending = false, stopped = false
const updateUrl = (key: string, value: string) => { const u = new URL(location.href); u.searchParams.set(key,value); history.replaceState(null,'',u) }
const request = async <T>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch('/api/v1/admin/bots' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await r.json(); if (!r.ok) throw new Error(data.error ?? 'Debug-Anfrage fehlgeschlagen.'); return data
}
const number = (n: number) => n.toLocaleString('de-DE')
const counts = h('div', {class:'bot-stats'})
const message = h('p',{class:'bot-message',role:'status'},'Verbinde mit der lokalen Debug-Welt …')
const phase = h('p',{class:'bot-phase'})
const amount = h('input',{type:'number',min:'1',max:String(MAX_DEBUG_BOTS),value:String(valid('bots',MAX_DEBUG_BOTS,MAX_DEBUG_BOTS)),'aria-label':'Bot-Anzahl',onInput:()=>updateUrl('bots',amount.value)}) as HTMLInputElement
const seed = h('input',{type:'number',min:'0',max:'1000000',value:params.get('seed') ?? '49','aria-label':'Welt-Seed',onInput:()=>updateUrl('seed',seed.value)}) as HTMLInputElement
const choose = h('input',{type:'number',min:'1',max:String(MAX_DEBUG_BOTS),value:String(selected),'aria-label':'Bot auswählen',onInput:()=>selectBot(Number(choose.value))}) as HTMLInputElement
const map = h('canvas',{width:1200,height:600,'aria-label':'Weltweite Bot-Siedlungen',class:'bot-map'}) as HTMLCanvasElement
const background = document.createElement('canvas'); background.width=1200;background.height=600
const info = h('div',{class:'bot-detail'},'Wähle einen Bot auf der Karte oder über seine Nummer.')
const cityHost = h('div',{class:'bot-city'})
const scene = new PolyScene(graphicsSettings(location.search))
scene.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
cityHost.append(scene.canvas)
const camera = new Camera(new Context())
let models: ClientEntity[] = []
const setView = (next: 'world'|'city') => { view=next;updateUrl('view',view);map.hidden=view!=='world';cityHost.hidden=view!=='city';worldButton.setAttribute('aria-pressed',String(view==='world'));cityButton.setAttribute('aria-pressed',String(view==='city'));resize() }
const worldButton=h('button',{type:'button',onClick:()=>setView('world')},'Weltkarte')
const cityButton=h('button',{type:'button',onClick:()=>setView('city')},'Stadt ansehen')
const act = async (action:()=>Promise<BotStatus>) => {
  if(pending)return; pending=true;start.disabled=pause.disabled=true
  try {renderStatus(await action());message.textContent='Debug-Steuerung übernommen.';await refresh()}
  catch(e){message.textContent=(e as Error).message}
  finally{pending=false;start.disabled=pause.disabled=false}
}
const start=h('button',{type:'button',class:'bot-primary',onClick:()=>act(()=>request('',{count:Number(amount.value),seed:Number(seed.value)}))},'Bots starten / fortsetzen') as HTMLButtonElement
const pause=h('button',{type:'button',onClick:()=>act(()=>request('/pause',{}))},'Entscheidungen pausieren') as HTMLButtonElement
const root = h('div',{class:'bot-page'},
  h('header',{class:'poly-header'},h('a',{href:'/engine.html',class:'poly-brand'},h('span',{class:'poly-mark'},'R'),'Real Command'),h('span',{class:'poly-eyebrow'},'DEBUG / BEWOHNTE WELT'),h('a',{href:'/',class:'poly-play'},'Zum Spiel ↗')),
  h('aside',{class:'bot-controls'},h('p',{class:'poly-eyebrow'},'GLOBALE SIEDLUNGSSIMULATION'),h('h1','Eine Welt.\n10.000 Städte.'),
    h('p','Städte werden weltweit gegründet und danach ohne Ende weiterentwickelt: bezahlte Bauaufträge, bis das Gebäudebudget erreicht ist, danach Ausbau der Wohnquartiere zu Hochhäusern.'),counts,phase,
    h('div',{class:'bot-fields'},h('label','Bot-Anzahl',amount),h('label','Seed',seed)),start,pause,message,
    h('p',{class:'bot-note'},'Lokale Entwicklung · Bots rechnen direkt im Server. Die Zahl echter WebSocket-Verbindungen wird separat gemessen. Pause stoppt neue Entscheidungen; laufende Produktion und Wirtschaft gehen weiter.'),
    h('a',{href:'/engine.html?scene=city'},'Zur zivilen Modellszene ↗')),
  h('main',{class:'bot-main'},h('div',{class:'bot-viewbar'},worldButton,cityButton,h('label','Bot auswählen',choose)),map,cityHost,info,
    h('p',{class:'bot-legend'},'● Aufbau läuft     ● Grün: Ausbauplan fertig · Karte anklicken, um eine Stadt zu untersuchen')),
)
document.body.append(root)
function renderStatus(s:BotStatus){
  counts.replaceChildren(...[['Städte',`${number(s.spawned)} / ${number(s.target)}`],['Grundplan fertig',number(s.settled)],['Gebäude',number(s.buildings)],['Bewohner',number(s.residents)],['Ausbauten',number(s.grown)],['Hochhäuser',number(s.upgrades)],['Menschen',number(s.humans)],['Verbindungen',number(s.connections)]].map(([label,value])=>h('div',h('span',label),h('strong',value))))
  phase.textContent=`${s.running?'Aktiv':'Pausiert'} · ${number(s.developing)} bauen gerade · ${number(s.asleep)} ruhen · ${s.blocked} blockiert · ${s.trades} Handelsabschlüsse · ${s.activeWars} aktive Feldzüge (${s.wars} insgesamt) · Bot-Schritt ${s.lastPulseMs} ms (Mittel ${s.avgPulseMs} ms, Budget ${number(s.limit)} Gebäude je Stadt)`
  if(s.error)message.textContent=s.error
}
function drawMap(){
  const g=map.getContext('2d')!;g.drawImage(background,0,0)
  for(const p of points){g.fillStyle=p.stage>=BOT_PLAN.length?'#d2e8b2':'#d9b466';g.fillRect(p.x/WORLD_W*1200-1,p.y/WORLD_H*600-1,2.4,2.4)}
  const p=points.find(p=>p.index===selected)
  if(p){g.strokeStyle='#fff6ce';g.lineWidth=2;g.beginPath();g.arc(p.x/WORLD_W*1200,p.y/WORLD_H*600,7,0,Math.PI*2);g.stroke()}
}
function selectBot(index:number){
  if(!Number.isSafeInteger(index)||index<1||index>MAX_DEBUG_BOTS)return
  selected=index;choose.value=String(index);updateUrl('bot',String(index));drawMap()
  void loadDetail().catch(e=>{message.textContent=(e as Error).message})
}
map.addEventListener('click',e=>{
  const rect=map.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*1200,y=(e.clientY-rect.top)/rect.height*600
  let nearest:BotPoint|undefined,best=100
  for(const p of points){const d=(p.x/WORLD_W*1200-x)**2+(p.y/WORLD_H*600-y)**2;if(d<best){nearest=p;best=d}}
  if(nearest)selectBot(nearest.index)
})
async function loadDetail(){
  const p=points.find(p=>p.index===selected);if(!p)return
  const next=await request<BotDetail>('/'+p.id)
  if(next.index!==selected)return
  const changed = !detail || detail.id!==next.id || detail.entities.length!==next.entities.length
  detail=next
  const {lon,lat}=worldToLonLat(next.home.x,next.home.y), civic=next.civic
  info.replaceChildren(h('div',h('span',{class:'poly-eyebrow'},`${lat.toFixed(2)}° / ${lon.toFixed(2)}°`),h('h2',next.name),h('p',`${Math.min(next.stage,next.totalStages)} / ${next.totalStages} Bauabschnitte${next.grown?` + ${next.grown} Ausbauten`:''} · ${next.production?.ready.length?DEFS[next.production.ready[0]].name+' wartet auf Bauplatz':next.production?.type?DEFS[next.production.type].name+' im Bau':next.next?'Plant: '+next.next:'Endausbau erreicht'}${next.sleepingFor?` · ruht noch ${next.sleepingFor} s`:''}`)),
    h('div',{class:'bot-city-stats'},h('span',`${civic.residents} / ${civic.capacity} Bewohner`),h('span',`${civic.employed} Arbeitsplätze besetzt`),h('span',`${civic.qualified} Fachkräfte`),h('span',`${number(civic.credits)} Credits`)),
    h('p',`${civic.infrastructure.tier} · Versorgung ${civic.infrastructure.efficiency}% · erschlossene Gebäude ${civic.infrastructure.connected}/${civic.infrastructure.total}`),
    h('p',next.diplomacy.note??'Baut seine Stadt auf und sucht regionale Handelspartner.'),next.blocked?h('p',{role:'status'},next.blocked):h('span'))
  models=next.entities.map(e=>({ ...e,kind:'b',tx:e.x,ty:e.y,thead:e.heading,turret:e.heading,speed:0,samples:[],maxHp:DEFS[e.type].hp,visible:true,ghost:false,lastUpdate:0,seen:0,def:DEFS[e.type] }))
  if(changed)resize()
}
function resize(){
  if(cityHost.hidden)return
  const width=Math.max(200,cityHost.clientWidth),height=Math.max(200,cityHost.clientHeight)
  camera.resize(width,height);scene.resize(width,height)
  if(detail)camera.moveTo(detail.home.x,detail.home.y,Math.max(1,1000/width,1000/height))
}
async function refresh(){
  try{
    const [status,data]=await Promise.all([request<BotStatus>(''),request<{bots:BotPoint[]}>('/map')])
    points=data.bots;renderStatus(status);drawMap();await loadDetail()
    if(!status.error)message.textContent=`${number(status.decisions)} Entscheidungen verarbeitet. ${status.spawned? 'Karte und Stadtauswahl sind live.':'Bereit für den Start.'}`
  }catch(e){message.textContent=(e as Error).message}
}
async function poll(){await refresh();if(!stopped)setTimeout(()=>void poll(),2000)}
const g=background.getContext('2d')!;g.fillStyle='#284b50';g.fillRect(0,0,1200,600);drawMap()
void fetch('/data/landmask.rle').then(async r=>{if(!r.ok)throw new Error('Weltkarte konnte nicht geladen werden.');mask=LandMask.decode(new Uint8Array(await r.arrayBuffer()));g.fillStyle='#6b8270';for(let y=0;y<600;y++)for(let x=0;x<1200;x++)if(mask.isLandCell(Math.floor(x*mask.width/1200),Math.floor(y*mask.height/600)))g.fillRect(x,y,1,1);drawMap()}).catch(e=>{message.textContent=e.message})
setView(view);void poll()
let raf=0
const render=(time:number)=>{if(!document.hidden&&view==='city'&&detail&&mask)scene.render(camera,models,{ready:true,isLand:(x,y)=>mask!.isLandCell(cellX(x),cellY(y)),graphicsSnapshot:()=>({kind:'world',cuts:[]})},()=> '#9eb894',time/1000);raf=requestAnimationFrame(render)}
raf=requestAnimationFrame(render);addEventListener('resize',resize)
addEventListener('pagehide',()=>{stopped=true;cancelAnimationFrame(raf);scene.dispose();removeEventListener('resize',resize)},{once:true})

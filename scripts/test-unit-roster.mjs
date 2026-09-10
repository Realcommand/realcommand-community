import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { DEFS } from '../shared/data.ts'
import { GameState } from '../client/state.ts'
import { ownedUnits, selectableUnitIds, normalizeUnitIds, unitStatus, unitRosterNavigation } from '../client/ui/unit-roster.ts'
import { MAX_UNITS_PER_PLAYER } from '../shared/constants.ts'

const entity=(id,type,extra={})=>({id,type,kind:'u',owner:49,hp:DEFS[type].hp,maxHp:DEFS[type].hp,def:DEFS[type],state:'idle',visible:true,...extra})
const entities=[entity(10,'recon_drone'),entity(2,'recon_drone',{state:'guard',x:30e6,y:10e6}),
  entity(3,'rifleman',{inside:4,visible:false}),entity(4,'apc'),
  entity(5,'recon_drone',{owner:50}),entity(6,'recon_drone',{hp:0}),entity(7,'airfield',{kind:'b'}),
  entity(8,'recon_drone',{ghost:true})]
assert.equal(ownedUnits(entities,49).length,4)
assert.deepEqual(ownedUnits(entities,49,'aircraft').map(e=>e.id),[2,10],'stable ID order includes distant drones')
assert.deepEqual(ownedUnits(entities,49,'all','DROHNE #2').map(e=>e.id),[2])
assert.deepEqual(ownedUnits(entities,49,'infantry').map(e=>e.id),[3],'passengers remain in roster')
assert.deepEqual(ownedUnits(entities,49,'ship'),[])
assert.deepEqual(selectableUnitIds(entities,49,'aircraft','Drohne'),[2,10],'bulk action includes all matching distant drones, but no foreign/dead units')
assert.deepEqual(selectableUnitIds(entities,49,'infantry'),[],'passengers cannot receive bulk commands until unloaded')
assert.deepEqual(normalizeUnitIds([10,2,10,0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]),[2,10])
assert.equal(normalizeUnitIds(Array.from({length:MAX_UNITS_PER_PLAYER+100},(_,i)=>i+1)).length,MAX_UNITS_PER_PLAYER,'URL groups stay within the player unit cap')
assert.equal(unitStatus(entities[1]),'auf Wache')
assert.equal(unitStatus(entities[2]),'an Bord von #4')
assert.equal(unitStatus(entity(9,'recon_drone',{state:'rearm'})),'lädt Akku')
assert.equal(unitStatus(entity(9,'recon_drone',{state:'return'})),'fliegt zum Flugfeld')

const browser=Object.assign(new EventTarget(),{
  location:{href:'http://localhost:8091/?tab=aircraft&side=units&view=tactical#map'},
  history:{state:{keep:true},replaceState(state,_title,url){assert.deepEqual(state,{keep:true});browser.location.href=String(url)}},
})
let observed
const navigation=unitRosterNavigation(browser,route=>{observed=route})
navigation.set({filter:'aircraft',search:'Drohne',unit:2})
assert.deepEqual(observed,{filter:'aircraft',search:'Drohne',unit:2})
for(const [key,value] of Object.entries({tab:'aircraft',side:'units',view:'tactical',unitType:'aircraft',unitSearch:'Drohne',unit:'2'}))assert.equal(new URL(browser.location.href).searchParams.get(key),value)
assert.equal(new URL(browser.location.href).hash,'#map')
navigation.set({unit:undefined});assert.equal(new URL(browser.location.href).searchParams.has('unit'),false)
navigation.set({units:[10,2,10]})
assert.deepEqual(observed,{filter:'aircraft',search:'Drohne',unit:undefined,units:[2,10]})
assert.equal(new URL(browser.location.href).searchParams.get('units'),'2,10')
navigation.set({filter:'vehicle'})
assert.deepEqual(observed.units,[2,10],'changing filters does not silently replace the selected group')
navigation.set({unit:4})
assert.equal(new URL(browser.location.href).searchParams.has('units'),false,'single selection replaces the old bulk URL')
navigation.set({units:[2,10]})
assert.equal(new URL(browser.location.href).searchParams.has('unit'),false,'bulk selection replaces the old single URL')
navigation.set({unit:undefined,units:undefined})
assert.equal(new URL(browser.location.href).searchParams.has('units'),false,'deselect clears the group URL')
assert.equal(new URL(browser.location.href).searchParams.get('unitSearch'),'Drohne','deselect retains the search')
browser.location.href='http://localhost:8091/?units=10,2,10,0,-1,1.2,NaN,9007199254740992&unitType=aircraft'
browser.dispatchEvent(new Event('popstate'))
assert.deepEqual(observed,{filter:'aircraft',search:'',unit:undefined,units:[2,10]},'browser navigation restores only valid group IDs')
browser.location.href='http://localhost:8091/?unit=10&unitType=vehicle';browser.dispatchEvent(new Event('popstate'))
assert.deepEqual(observed,{filter:'vehicle',search:'',unit:10})
for(const invalid of ['-1','0','NaN','1.2','1e3','9007199254740992']){
  browser.location.href='http://localhost:8091/?unitType=invalid&unit='+invalid
  assert.deepEqual(navigation.current(),{filter:'all',search:'',unit:undefined})
}
navigation.dispose();browser.location.href='http://localhost:8091/';browser.dispatchEvent(new Event('popstate'))
assert.equal(observed.unit,10,'disposed listener does not fire')

// The same synchronized entities power roster and map; passengers stay hidden on the map.
const ctx=new Context(),state=new GameState(ctx)
state.myId=49
const wire={i:3,k:'u',ty:'rifleman',o:49,x:100,y:100,h:0,hp:60,s:'inside',inside:4}
const snapshot={t:'state',ents:[wire],gone:[],dead:[],evs:[]}
state.applyState(snapshot)
assert.equal(state.entities.get(3).visible,false)
assert.equal(ownedUnits(state.entities.values(),49).length,1)
state.select([3]);assert.equal(state.ownSelectedUnits().length,0,'cannot command a passenger directly')
state.applyState({...snapshot,ents:[{...wire,inside:undefined,s:'idle'}]})
assert.equal(state.entities.get(3).visible,true);assert.equal(state.ownSelectedUnits().length,1)
state.applyState({...snapshot,ents:[],dead:[3]})
assert.equal(ownedUnits(state.entities.values(),49).length,0);assert.equal(state.selected.size,0)
await ctx.fiber.dispose()
console.log('Einheitenliste: Besitz, Kategorien, Suche, Sortierung, Fernsicht, Passagiere, Status, URL-Restore, Auswahl und Entfernung bestanden.')

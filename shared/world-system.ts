export interface RebuildPlan { at:number, origin:{x:number,y:number}, buildings:{id:number,type:string,dx:number,dy:number,heading:number}[] }
export interface Alliance { id:number,name:string,leader:number,members:number[],applicants:number[],npc?:boolean }
export interface Conquest { id:number,at:number,attacker:number,victim:number,buildings:number,units:number,cash:number,civilianBuildings:number,allianceBreach:boolean }
export type Charge = 'civilian_seizure'|'alliance_breach'
export interface WarCase { id:number,at:number,reviewAt:number,evidence:Conquest,charge:Charge,statement:string,defense?:string,status:'open'|'convicted'|'dismissed',judges:number[],votes:Record<number,boolean> }
export interface War { id:number,at:number,attacker:number,defender:number,status:'declared'|'marching'|'battle'|'ended',nextAt:number,rounds:number,reason:string,result?:string,aggregate:boolean,peace?:number[] }
export interface WorldTrade { id:number,at:number,buyer:number,seller:number,good:'food'|'goods',quantity:number,credits:number }
export interface WorldSystem { nextId:number,alliances:Alliance[],conquests:Conquest[],cases:WarCase[],wars:War[],trades:WorldTrade[],tradeCount:number,warCount:number }
export const newWorldSystem=():WorldSystem=>({nextId:1,alliances:[],conquests:[],cases:[],wars:[],trades:[],tradeCount:0,warCount:0})
export interface WorldReport {
  me:{id:number,name:string,cash:number,bank:number,bankVersion:number,reputation:number,criminal:boolean,alliance?:number,rebuildBuildings:number,canRespawn:boolean}
  alliances:{id:number,name:string,leader:number,members:number,applicants:number[],joined:boolean,applied:boolean,npc:boolean}[]
  conquests:Conquest[]
  cases:WarCase[]
  wars:War[]
  trades:WorldTrade[]
  names:Record<number,string>
}

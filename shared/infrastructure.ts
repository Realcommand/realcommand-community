export const ROAD_RANGE=1200
export interface CityBuilding {id:number,type:string,x:number,y:number,size:number}
export interface Road {from:number,to:number,points:{x:number,y:number}[]}
export interface Infrastructure {capacity:number,connected:number,total:number,roads:Road[]}
export interface RoadSurface {x:number,y:number,width:number,depth:number}
export function roadSurfaces(roads:Road[],buildings:CityBuilding[]):RoadSurface[] {
  const sizes=new Map(buildings.map(e=>[e.id,e.size])),surfaces:RoadSurface[]=[]
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)
    const lo=i===1?(sizes.get(road.from)??0)+3:0,hi=len-(i===road.points.length-1?(sizes.get(road.to)??0)+3:0)
    if(hi<=lo)continue
    surfaces.push({x:a.x+dx*(lo+hi)/2/len,y:a.y+dy*(lo+hi)/2/len,width:dx===0?7:hi-lo,depth:dy===0?7:hi-lo})
  }
  return surfaces
}
/** Shared, deterministic local roads. Recomputed only when buildings change. */
export function cityNetwork(buildings:CityBuilding[],land:(x:number,y:number)=>boolean=()=>true,obstacles:CityBuilding[]=buildings):Infrastructure {
  const hubs=buildings.filter(b=>b.type==='transport_hub'),roads:Road[]=[]
  const clear=(a:{x:number,y:number},b:{x:number,y:number},from:number,to:number)=>{
    const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy
    for(let i=0,n=Math.max(1,Math.ceil(Math.sqrt(len2)/100));i<=n;i++)if(!land(a.x+dx*i/n,a.y+dy*i/n))return false
    return !obstacles.some(e=>{
      if(e.id===from||e.id===to)return false
      const t=len2?Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/len2)):0
      return (e.x-a.x-t*dx)**2+(e.y-a.y-t*dy)**2<(e.size+5)**2
    })
  }
  for(const b of buildings) {
    if(b.type==='transport_hub')continue
    const nearby=hubs.filter(h=>(h.x-b.x)**2+(h.y-b.y)**2<=ROAD_RANGE**2).sort((a,c)=>(a.x-b.x)**2+(a.y-b.y)**2-((c.x-b.x)**2+(c.y-b.y)**2))
    for(const h of nearby){
      const ways=[[{x:h.x,y:b.y}],[{x:b.x,y:h.y}],...[-80,80].flatMap(offset=>[[{x:b.x+offset,y:b.y},{x:b.x+offset,y:h.y}],[{x:b.x,y:b.y+offset},{x:h.x,y:b.y+offset}]])]
      for(const dx of [-80,80])for(const dy of [-80,80])ways.push(
        [{x:b.x,y:b.y+dy},{x:h.x+dx,y:b.y+dy},{x:h.x+dx,y:h.y}],
        [{x:b.x+dx,y:b.y},{x:b.x+dx,y:h.y+dy},{x:h.x,y:h.y+dy}])
      const path=ways.map(mid=>[b,...mid,h].filter((p,i,list)=>i===0||p.x!==list[i-1].x||p.y!==list[i-1].y)).find(points=>points.every((p,i)=>i===0||clear(points[i-1],p,b.id,h.id)))
      if(path){roads.push({from:b.id,to:h.id,points:path.map(({x,y})=>({x,y}))});break}
    }
  }
  return {capacity:80+300*hubs.length,connected:hubs.length+roads.length,total:buildings.length,roads}
}

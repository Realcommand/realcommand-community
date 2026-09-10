import * as THREE from 'three'
import type { GroundSurface } from './surface.ts'

export interface ShoreEdge { ax:number, ay:number, bx:number, by:number, height:number }
interface Vertex { x:number, y:number, h:number, land:boolean, normal?:number[], color?:THREE.Color }

/** Clip every coastal triangle against the authoritative shoreline. This keeps
 * diagonal and curved shores smooth without changing land/water game rules. */
export function terrainGeometry(ax:number,ay:number,size:number,n:number,surface:GroundSurface,colorAt:(x:number,y:number,land:boolean)=>THREE.Color,hole=0,edge?:{step:number,offset:number}) {
  const step=size/n,positions:number[]=[],normals:number[]=[],colors:number[]=[],uv:number[]=[],walls:number[]=[],wallUV:number[]=[],shore:ShoreEdge[]=[]
  const vertices:Vertex[]=[],edges=new Map<string,Vertex>()
  const land=(x:number,y:number)=>surface.source.ready&&surface.source.isLand(x,y)
  const blendAt=(x:number,y:number)=>{
    if(!edge)return
    const band=Math.min(size/4,edge.step*2)
    const t=Math.max(0,Math.min(1,(Math.max(Math.abs(x-ax),Math.abs(y-ay))-size/2+band)/band))
    if(!t)return
    const ix=Math.floor((x-ax)/edge.step),iy=Math.floor((y-ay)/edge.step)
    const x0=ax+ix*edge.step,y0=ay+iy*edge.step,x1=x0+edge.step,y1=y0+edge.step
    if(!land(x0,y0)||!land(x1,y0)||!land(x0,y1)||!land(x1,y1))return
    const fx=(x-x0)/edge.step,fy=(y-y0)/edge.step
    const points=fx+fy<=1?[[x0,y0,1-fx-fy],[x1,y0,fx],[x0,y1,fy]]:[[x1,y0,1-fy],[x0,y1,1-fx],[x1,y1,fx+fy-1]]
    return { t:t*t*(3-2*t), points }
  }
  const height=(x:number,y:number)=>{
    const h=surface.height(x,y),blend=blendAt(x,y)
    if(!blend)return h
    const coarse=blend.points.reduce((sum,[px,py,weight])=>sum+surface.height(px,py)*weight,edge!.offset)
    return h+(coarse-h)*blend.t
  }
  const normalAt=(x:number,y:number)=>{
    const h=(px:number,py:number)=>land(px,py)?surface.height(px,py):surface.height(x,y)
    return new THREE.Vector3(h(x-1,y)-h(x+1,y),2,h(x,y-1)-h(x,y+1)).normalize()
  }
  for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++) {
    const x=ax-size/2+ix*step,y=ay-size/2+iz*step,onLand=land(x,y)
    vertices.push({x,y,h:onLand?height(x,y):0,land:onLand})
  }
  const intersection=(a:Vertex,b:Vertex)=>{
    const key=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)].join(':')
    let v=edges.get(key)
    if(v)return v
    let inside=a.land?a:b,outside=a.land?b:a
    for(let i=0;i<10;i++) {
      const x=(inside.x+outside.x)/2,y=(inside.y+outside.y)/2
      const mid={x,y,h:0,land:land(x,y)}
      if(mid.land)inside=mid;else outside=mid
    }
    v={x:inside.x,y:inside.y,h:height(inside.x,inside.y),land:true}
    edges.set(key,v);return v
  }
  const emit=(a:Vertex,b:Vertex,c:Vertex)=>{
    for(const v of [a,b,c]) {
      positions.push(v.x-ax,v.h,v.y-ay)
      if(!v.normal) {
        const normal=normalAt(v.x,v.y),tint=colorAt(v.x,v.y,true),blend=blendAt(v.x,v.y)
        if(blend){
          const coarseNormal=new THREE.Vector3(),coarseColor=new THREE.Color(0,0,0)
          for(const [x,y,weight] of blend.points){coarseNormal.addScaledVector(normalAt(x,y),weight);coarseColor.add(colorAt(x,y,true).multiplyScalar(weight))}
          normal.lerp(coarseNormal,blend.t);tint.lerp(coarseColor,blend.t)
        }
        v.normal=normal.toArray()
        v.color=tint
      }
      normals.push(...v.normal)
      colors.push(v.color!.r,v.color!.g,v.color!.b)
      uv.push((v.x-ax)/28,(v.y-ay)/28)
    }
  }
  const triangle=(a:Vertex,b:Vertex,c:Vertex)=>{
    const input=[a,b,c],polygon:Vertex[]=[],crossings:Vertex[]=[]
    for(let i=0;i<3;i++) {
      const p=input[i],q=input[(i+1)%3]
      if(p.land)polygon.push(p)
      if(p.land!==q.land){const v=intersection(p,q);polygon.push(v);crossings.push(v)}
    }
    for(let i=1;i<polygon.length-1;i++)emit(polygon[0],polygon[i],polygon[i+1])
    if(crossings.length===2) {
      const [p,q]=crossings,length=Math.hypot(p.x-q.x,p.y-q.y)
      shore.push({ax:p.x,ay:p.y,bx:q.x,by:q.y,height:(p.h+q.h)/2})
      const topP=[p.x-ax,p.h,p.y-ay],topQ=[q.x-ax,q.h,q.y-ay],bottomP=[p.x-ax,-4,p.y-ay],bottomQ=[q.x-ax,-4,q.y-ay]
      walls.push(...topP,...bottomP,...topQ,...topQ,...bottomP,...bottomQ)
      wallUV.push(0,p.h/14,0,0,length/14,q.h/14,length/14,q.h/14,0,0,length/14,0)
    }
  }
  for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++) {
    const a=iz*(n+1)+ix
    if(hole&&Math.abs(vertices[a].x+step/2-ax)<hole/2&&Math.abs(vertices[a].y+step/2-ay)<hole/2)continue
    triangle(vertices[a],vertices[a+n+1],vertices[a+1]);triangle(vertices[a+1],vertices[a+n+1],vertices[a+n+2])
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3))
  const cliffGeometry=new THREE.BufferGeometry()
  cliffGeometry.setAttribute('position',new THREE.Float32BufferAttribute(walls,3))
  cliffGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(wallUV,2));cliffGeometry.computeVertexNormals()
  return {geometry,cliffGeometry,shore}
}

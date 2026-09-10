import * as THREE from 'three'
import { hash2 } from '../../shared/math.ts'

/** Irregular overlapping branch whorls, authored once and instanced per tree. */
export function pineGeometry() {
  const positions: number[] = []
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c)
  for (let tier = 0; tier < 9; tier++) {
    const y = .13 + tier * .085, radius = .49 * (1 - tier / 10)
    const segments = 11, rotation = tier * 2.39996
    for (let j = 0; j < segments; j++) {
      const angle = rotation + j / segments * Math.PI * 2
      const next = rotation + (j + 1) / segments * Math.PI * 2
      const r = radius * (.78 + hash2(tier,j,713)*.22)
      const r2 = radius * (.78 + hash2(tier,j+1,713)*.22)
      const a = [Math.cos(angle)*r,y+hash2(j,tier,717)*.055,Math.sin(angle)*r]
      const b = [Math.cos(next)*r2,y+hash2(j+1,tier,717)*.055,Math.sin(next)*r2]
      triangle(a,[.015,y+.27,0],b)
      triangle(b,[0,y-.028,0],a)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3))
  geometry.computeVertexNormals()
  return geometry
}

export function rockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(.5, 1)
  const p = geometry.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i)
    // Equal positions receive equal displacement, keeping shared edges closed.
    const scale = .78 + .28 * Math.sin(x*13+y*19+z*23) ** 2
    p.setXYZ(i,x*scale,y*scale,z*scale)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Alpha-cut needle sprays arranged around a trunk, with no camera-facing planes. */
export function foliageGeometry() {
  const positions:number[]=[],uv:number[]=[]
  for(let tier=0;tier<9;tier++)for(let branch=0;branch<9;branch++) {
    const angle=branch/9*Math.PI*2+tier*2.39996
    const radius=(.49-tier*.045)*(.85+hash2(tier,branch,761)*.15)
    const y=.14+tier*.085
    const outward=new THREE.Vector3(Math.cos(angle),-.10,Math.sin(angle))
    const side=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle))
    for(const fan of [-.55,0,.55]) {
      const stem=new THREE.Vector3(Math.cos(angle+fan),.03,Math.sin(angle+fan))
      const base=new THREE.Vector3().copy(outward).multiplyScalar(radius*.15)
      base.y+=y
      const tip=base.clone().addScaledVector(stem,radius*.95)
      const a=base.clone().addScaledVector(side,-radius*.12)
      const b=base.clone().addScaledVector(side,radius*.12)
      const c=tip.clone().addScaledVector(side,-radius*.40)
      const d=tip.clone().addScaledVector(side,radius*.40)
      c.y+=radius*.12;d.y-=radius*.08
      for(const p of [a,c,b,b,c,d])positions.push(...p.toArray())
      // One branch from Poly Haven's fir twig atlas; omit its bark strips.
      uv.push(.27,.19,.27,.61,.65,.19,.65,.19,.27,.61,.65,.61)
    }
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  geometry.computeVertexNormals()
  return geometry
}

export function domeGeometry() {
  const geometry=new THREE.IcosahedronGeometry(.5,2)
  const count=geometry.getAttribute('position').count,barycentric=new Float32Array(count*3)
  for(let i=0;i<count;i++)barycentric[i*3+i%3]=1
  geometry.setAttribute('barycentric',new THREE.BufferAttribute(barycentric,3))
  geometry.computeVertexNormals()
  return geometry
}

/** Four crossed views baked from the full 2.2-million-triangle fir. The crown
 * keeps its fine branch coverage at distance while instanced 3D trunks remain. */
export function treeCrownGeometry() {
  const positions:number[]=[],uv:number[]=[],normals:number[]=[]
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle),u=(i%2)*.5,v=Math.floor(i/2)*.5
    for(const [x,y,tx,ty] of [[-.5,-.026,0,0],[.5,-.026,1,0],[-.5,.974,0,1],[-.5,.974,0,1],[.5,-.026,1,0],[.5,.974,1,1]]) {
      positions.push(x*c,y,x*s);uv.push(u+tx*.5,v+ty*.5)
      const normal=new THREE.Vector3(x*c,.35,x*s).normalize();normals.push(...normal.toArray())
    }
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3))
  return geometry
}

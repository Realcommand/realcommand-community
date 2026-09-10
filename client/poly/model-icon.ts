import * as THREE from 'three'
import { makeModel } from './models.ts'
import { primitiveGeometries } from './batch.ts'
import type { Def } from '../../shared/data.ts'

/** Canvas thumbnails project the same building and robot models as the world. */
export function drawModelIcon(g:CanvasRenderingContext2D,def:Def,color:string,w:number,h:number) {
  const geometries=primitiveGeometries(),part=new THREE.Object3D(),camera=new THREE.PerspectiveCamera()
  camera.position.set(4,3,5);camera.lookAt(0,0,0);camera.updateMatrixWorld()
  const faces:{points:THREE.Vector3[],depth:number,color:string}[]=[]
  const tint=new THREE.Color(),matrix=new THREE.Matrix4()
  for(const p of makeModel(def)) {
    part.position.fromArray(p.p);part.rotation.set(...p.r);part.scale.fromArray(p.s);part.updateMatrix()
    matrix.multiplyMatrices(camera.matrixWorldInverse,part.matrix)
    const geometry=geometries[p.shape],positions=geometry.getAttribute('position'),index=geometry.index
    for(let i=0;i<(index?.count??positions.count);i+=3) {
      const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(matrix))
      const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize()
      if(normal.z<=0)continue
      tint.set(p.color==='team'?color:p.color).multiplyScalar(.65+.35*Math.max(0,normal.dot(new THREE.Vector3(-.4,.7,.6).normalize())))
      faces.push({points,depth:points.reduce((sum,v)=>sum+v.z,0)/3,color:'#'+tint.getHexString()})
    }
  }
  const points=faces.flatMap(f=>f.points),xs=points.map(p=>p.x),ys=points.map(p=>p.y)
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
  const scale=Math.min(w*.82/(maxX-minX),h*.82/(maxY-minY))
  for(const face of faces.sort((a,b)=>a.depth-b.depth)) {
    g.fillStyle=face.color;g.beginPath()
    face.points.forEach((p,i)=>{const x=w/2+(p.x-(minX+maxX)/2)*scale,y=h/2-(p.y-(minY+maxY)/2)*scale;i?g.lineTo(x,y):g.moveTo(x,y)})
    g.closePath();g.fill()
  }
  for(const geometry of Object.values(geometries))geometry.dispose()
}

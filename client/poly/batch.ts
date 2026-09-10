import * as THREE from 'three'
import type { Shape } from './models.ts'
import { modelMaterial } from './materials.ts'
import { pineGeometry, rockGeometry, domeGeometry } from './nature.ts'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export const primitiveGeometries = (): Record<Shape, THREE.BufferGeometry> => ({
  box: new RoundedBoxGeometry(1, 1, 1, 1, .018),
  cone: new THREE.ConeGeometry(.5, 1, 12),
  cylinder: new THREE.CylinderGeometry(.5, .5, 1, 16),
  rock: rockGeometry(),
  pine: pineGeometry(),
  sphere: new THREE.IcosahedronGeometry(.5, 2),
  cliff: rockGeometry(),
  needles: new THREE.BufferGeometry(),
  dome: domeGeometry(),
  light: new THREE.BoxGeometry(1,1,1),
  disc: new THREE.CylinderGeometry(.5, .5, .015, 12),
})

/** One draw call per primitive, independent of the number of visible models. */
export class PrimitiveBatch {
  readonly group = new THREE.Group()
  private shapes = primitiveGeometries()
  private material = modelMaterial()
  private meshes = new Map<Shape, THREE.InstancedMesh>()
  private color = new THREE.Color()
  private counts = new Map<Shape, number>()
  private capacity: number
  private extraMaterials: THREE.Material[] = []
  constructor(capacity: number) {
    this.capacity = capacity
    for (const [shape, geometry] of Object.entries(this.shapes)) {
      const mesh = new THREE.InstancedMesh(geometry, this.material, capacity)
      mesh.name = shape
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
      // Culling is performed in world coordinates before insertion. Bounds on
      // moving instance matrices would otherwise have to be rebuilt each frame.
      mesh.frustumCulled = false
      mesh.castShadow = shape !== 'disc'
      mesh.receiveShadow = true
      this.meshes.set(shape as Shape, mesh)
      this.group.add(mesh)
    }
    const dome=new THREE.MeshStandardMaterial({color:'#c3c4b5',roughness:.88})
    dome.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 barycentric; varying vec3 vBarycentric;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvBarycentric=barycentric;')
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vBarycentric;')
        .replace('#include <color_fragment>','#include <color_fragment>\nvec3 edge=smoothstep(vec3(0.0),fwidth(vBarycentric)*1.1,vBarycentric); diffuseColor.rgb*=.65+.35*min(edge.x,min(edge.y,edge.z));')
    }
    const lamp=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false})
    this.meshes.get('dome')!.material=dome
    this.meshes.get('light')!.material=lamp
    this.meshes.get('light')!.castShadow=false
    this.extraMaterials.push(dome,lamp)
  }
  clear() { this.counts.clear() }
  replace(shape: Shape, geometry: THREE.BufferGeometry, material: THREE.Material) {
    const mesh=this.meshes.get(shape)!
    mesh.geometry.dispose(); mesh.geometry=geometry
    this.shapes[shape]=geometry
    mesh.material=material
    this.extraMaterials.push(material)
  }
  add(shape: Shape, matrix: THREE.Matrix4, color: string | THREE.Color): boolean {
    const mesh = this.meshes.get(shape)!
    const i = this.counts.get(shape) ?? 0
    if (i >= this.capacity) return false
    mesh.setMatrixAt(i, matrix)
    mesh.setColorAt(i, typeof color === 'string' ? this.color.set(color) : color)
    this.counts.set(shape, i + 1)
    return true
  }
  flush() {
    for (const [shape, mesh] of this.meshes) {
      mesh.count = this.counts.get(shape) ?? 0
      if(!mesh.count)continue
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0,mesh.count*16)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,mesh.count*3)
        mesh.instanceColor.needsUpdate = true
      }
    }
  }
  snapshot() {
    return [...this.meshes].filter(([,m])=>m.count).map(([shape,m])=>({shape,count:m.count,matrix:Float32Array.from(m.instanceMatrix.array.slice(0,m.count*16)),color:Float32Array.from(m.instanceColor!.array.slice(0,m.count*3))}))
  }
  restore(instances:ReturnType<PrimitiveBatch['snapshot']>) {
    this.clear()
    for(const data of instances) {
      const mesh=this.meshes.get(data.shape)!
      if(data.count>this.capacity)throw new Error('Landscape instance budget exceeded')
      mesh.instanceMatrix.array.set(data.matrix)
      if(!mesh.instanceColor)mesh.setColorAt(0,this.color)
      mesh.instanceColor!.array.set(data.color);this.counts.set(data.shape,data.count)
    }
    this.flush()
  }
  get count() { return [...this.counts.values()].reduce((a, b) => a + b, 0) }
  dispose() {
    for (const mesh of this.meshes.values()) mesh.dispose()
    for (const geometry of Object.values(this.shapes)) geometry.dispose()
    this.material.dispose()
    for(const material of this.extraMaterials)material.dispose()
    this.group.clear()
  }
}

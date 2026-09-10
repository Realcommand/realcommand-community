import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { foliageGeometry,treeCrownGeometry } from './nature.ts'

const root='/world-assets/'
/** Assets are local, pinned, CC0 files. Runtime never contacts an asset service. */
export async function loadWorldAssets() {
  const loader=new THREE.TextureLoader()
  const load=async(name:string,color=false)=>{
    const texture=await loader.loadAsync(root+name)
    texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace
    texture.anisotropy=4
    return texture
  }
  const [needles,alpha,needleNormals,bark,ground,groundNormals,rock,treeAsset,crown]=await Promise.all([
    load('fir_tree_01_twig_diff.jpg',true),load('fir_tree_01_twig_alpha.jpg'),load('fir_tree_01_twig_nor_gl.jpg'),
    load('fir_tree_01_bark_diff.jpg',true),load('rocky_terrain_diffuse.jpg',true),load('rocky_terrain_nor_gl.jpg'),
    new GLTFLoader().loadAsync(root+'coast-rock.glb'),
    new GLTFLoader().loadAsync(root+'fir-tree.glb'),
    load('fir-canopy.webp',true),
  ])
  const foliage=new THREE.MeshStandardMaterial({map:needles,alphaMap:alpha,normalMap:needleNormals,
    alphaTest:.38,alphaToCoverage:true,side:THREE.DoubleSide,roughness:.96,metalness:0,color:'#c6cbbb'})
  foliage.normalScale.set(.4,.4)
  bark.wrapS=bark.wrapT=THREE.RepeatWrapping;bark.repeat.set(1,3)
  const trunk=new THREE.MeshStandardMaterial({map:bark,color:'#aaa18e',roughness:1})
  for(const t of [ground,groundNormals])t.wrapS=t.wrapT=THREE.RepeatWrapping
  let rockMesh:THREE.Mesh|undefined
  rock.scene.updateMatrixWorld(true)
  rock.scene.traverse(object=>{if((object as THREE.Mesh).isMesh)rockMesh=object as THREE.Mesh})
  if(!rockMesh)throw new Error('Coastal rock asset contains no mesh')
  const geometry=rockMesh.geometry.clone().applyMatrix4(rockMesh.matrixWorld)
  geometry.computeBoundingBox()
  const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
  geometry.translate(-center.x,-center.y,-center.z)
  geometry.scale(1/size.x,1/size.y,1/size.z)
  const rockMaterial=rockMesh.material as THREE.MeshStandardMaterial
  rockMaterial.roughness=.95
  treeAsset.scene.updateMatrixWorld(true)
  const treeBounds=new THREE.Box3().setFromObject(treeAsset.scene),treeSize=treeBounds.getSize(new THREE.Vector3()),treeCenter=treeBounds.getCenter(new THREE.Vector3())
  const trees:{geometry:THREE.BufferGeometry,material:THREE.MeshStandardMaterial}[]=[]
  treeAsset.scene.traverse(object=>{
    const mesh=object as THREE.Mesh
    if(!mesh.isMesh)return
    if((mesh.material as THREE.MeshStandardMaterial).name==='fir_tree_01_twig') {
      mesh.geometry.dispose()
      const material=mesh.material as THREE.MeshStandardMaterial
      for(const t of [material.map,material.normalMap,material.roughnessMap,material.aoMap,material.metalnessMap])t?.dispose()
      material.dispose();return
    }
    const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    geometry.translate(-treeCenter.x,-treeBounds.min.y,-treeCenter.z)
    geometry.scale(1/treeSize.x,1/treeSize.y,1/treeSize.z)
    const material=mesh.material as THREE.MeshStandardMaterial
    material.roughness=.92;material.metalness=0;material.side=THREE.DoubleSide
    trees.push({geometry,material})
    mesh.geometry.dispose()
  })
  const crownMaterial=new THREE.MeshStandardMaterial({map:crown,roughness:1,metalness:0,side:THREE.DoubleSide,alphaTest:.32,alphaToCoverage:true,color:'#c1c7af'})
  crownMaterial.name='fir-canopy'
  trees.push({geometry:treeCrownGeometry(),material:crownMaterial})
  return {foliage,foliageGeometry:foliageGeometry(),trunk,ground,groundNormals,rockGeometry:geometry,rockMaterial,
    trees,
    dispose(){
      for(const texture of [needles,alpha,needleNormals,bark,ground,groundNormals,rockMaterial.map,rockMaterial.normalMap,rockMaterial.roughnessMap,rockMaterial.metalnessMap,rockMaterial.aoMap])texture?.dispose()
      rock.scene.traverse(object=>{if((object as THREE.Mesh).isMesh)(object as THREE.Mesh).geometry.dispose()})
      const textures=new Set<THREE.Texture>()
      for(const tree of trees){
        for(const t of [tree.material.map,tree.material.normalMap,tree.material.roughnessMap,tree.material.aoMap,tree.material.metalnessMap])if(t)textures.add(t)
        tree.geometry.dispose();tree.material.dispose()
      }
      textures.forEach(t=>t.dispose())
    },
  }
}

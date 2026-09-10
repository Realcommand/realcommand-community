import * as THREE from 'three'

// A shared multiple of the 4096 m noise period and the 28 m ground texture.
export const TERRAIN_TEXTURE_PERIOD = 28672

// World-space procedural detail has no bitmap repetition or network dependency.
// Anchors are reduced modulo 4096 before upload to retain precision on Earth.
const noise = /* glsl */`
float grain(vec3 p) { return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float field(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(grain(i),grain(i+vec3(1,0,0)),f.x),mix(grain(i+vec3(0,1,0)),grain(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(grain(i+vec3(0,0,1)),grain(i+vec3(1,0,1)),f.x),mix(grain(i+vec3(0,1,1)),grain(i+vec3(1,1,1)),f.x),f.y),f.z);
}`
export function terrainMaterial(anchor = new THREE.Vector2()) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 })
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceAnchor = { value: anchor }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurface;\nuniform vec2 surfaceAnchor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = position; vSurface.y += modelMatrix[3].y;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv += surfaceAnchor / 28.0;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv += surfaceAnchor / 28.0;
        #endif
      `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurface;\nuniform vec2 surfaceAnchor;\n' + noise)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuse, diffuseColor.rgb, .35);')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 worldSurface = vec3(mod(vSurface.x + surfaceAnchor.x, 4096.0), vSurface.y, mod(vSurface.z + surfaceAnchor.y, 4096.0));
        float broad = field(worldSurface * .035);
        float stone = field(worldSurface * .32);
        float fine = field(worldSurface * 2.8);
        diffuseColor.rgb *= .71 + broad * .32 + stone * .18 + fine * .10;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.23,.215,.185), smoothstep(.73,.91,stone) * .14);
      `)
  }
  material.customProgramCacheKey = () => 'reco-ground-v2'
  return material
}

export function modelMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: .82, metalness: .12 })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetail;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetail = position;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetail;\n' + noise)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wear = field(vDetail * 32.0);
        diffuseColor.rgb *= .86 + wear * .20;
        diffuseColor.rgb *= .88 + .12 * smoothstep(-.5,.0,vDetail.y);
      `)
  }
  material.customProgramCacheKey = () => 'reco-material-v1'
  return material
}

export function waterMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#173b40', roughness: .34, metalness: .18, transparent: true, opacity: .97, envMapIntensity: .55 })
  const uniforms = { clock: { value: 0 }, anchor: { value: new THREE.Vector2() }, coastMask: { value: new THREE.Texture() },coastScale:{value:1} }
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSea; varying vec2 vShoreUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = (modelMatrix * vec4(position,1.0)).xyz; vShoreUV=vec2(uv.x,1.0-uv.y);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float clock; uniform vec2 anchor; uniform sampler2D coastMask; uniform float coastScale; varying vec3 vSea; varying vec2 vShoreUV;\n' + noise)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wave = (vSea.xz + anchor) * .075;
        float n = field(vec3(wave,clock*.09));
        float a = field(vec3(wave*2.2+vec2(clock*.16,0.0),.3));
        float b = field(vec3(wave*4.7-vec2(0.0,clock*.11),.6));
        normal = normalize(normal + vec3((a-.5)*.22,(b-.5)*.18,(n-.5)*.12));
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float chop = field(vec3((vSea.xz+anchor)*.28,clock*.09));
        float swell = field(vec3((vSea.xz+anchor)*.025,clock*.04));
        diffuseColor.rgb *= .78 + swell * .48;
        diffuseColor.rgb += vec3(.15,.22,.22) * pow(chop, 12.0) * .42;
        vec2 shoreUV=(vShoreUV-.5)*coastScale+.5;
        float inside=step(0.0,shoreUV.x)*step(shoreUV.x,1.0)*step(0.0,shoreUV.y)*step(shoreUV.y,1.0);
        float shore=texture2D(coastMask,shoreUV).r*inside;
        float foam=smoothstep(.04,.65,shore) * (.35+chop*.65);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.63,.59),foam*.78);
      `)
  }
  material.customProgramCacheKey = () => 'reco-sea-v1'
  return { material, uniforms }
}

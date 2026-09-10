import { militaryArchitecture } from './architecture.ts'
import { isCivic } from '../../shared/civic.ts'
import { civilModel } from './civil-models.ts'
import { modelAuthor } from './author.ts'
import { robotModel } from './robot-models.ts'
import type { Def } from '../../shared/data.ts'
import { Euler,Vector3 } from 'three'

export type Shape = 'box' | 'cone' | 'cylinder' | 'rock' | 'disc' | 'pine' | 'sphere' | 'cliff' | 'needles' | 'dome' | 'light'
export type Motion = 'strideL' | 'strideR' | 'rotor' | 'radar' | 'turret' | 'barrel'
export interface Part {
  shape: Shape
  p: [number, number, number]
  s: [number, number, number]
  color: string
  r: [number, number, number]
  motion?: Motion
  /** Emission surface, retained through the same normalization as the geometry. */
  exhaust?: 'steam' | 'smoke'
}
export type Model = Part[]
const steel = '#535b43', dark = '#28312c', rubber = '#1c211e', glass = '#3e575a', trim = '#9c9777'
/** Unit geometry is authored once, in local metres / definition size. */
export function makeModel(def: Def): Model {
  const model = authoredModel(def)
  // A rotation-independent bound includes roof overhangs, crates and barrels.
  // Definition.size is also the collision radius; authored geometry must fit it.
  const vertex=new Vector3(),rotation=new Euler()
  const radius = Math.max(...model.map(p => {
    rotation.set(...p.r)
    let horizontal=0
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]) {
      vertex.set(x*p.s[0],y*p.s[1],z*p.s[2]).applyEuler(rotation)
      horizontal=Math.max(horizontal,Math.hypot(vertex.x,vertex.z))
    }
    return Math.hypot(p.p[0],p.p[2])+horizontal+(p.motion==='strideL'||p.motion==='strideR'?.3:0)
  }))
  return model.map(p=>({...p,p:p.p.map(n=>n/radius) as Part['p'],s:p.s.map(n=>n/radius) as Part['s']}))
}
function authoredModel(def: Def): Model {
  const robot = robotModel(def.id)
  if (robot) return robot
  if (def.kind === 'building' && isCivic(def.id)) return civilModel(def.id)
  const { parts: a, part, box } = modelAuthor()
  const id = def.id
  if (def.kind === 'building') return militaryArchitecture(def)
  if (def.category === 'infantry') {
    for (const [z, motion] of [[-.2, 'strideL'], [.2, 'strideR']] as const) {
      box(.04, .13, z, .42, .2, .27, rubber, motion)
      box(0, .48, z, .25, .65, .24, dark, motion)
      box(.16, 1.06, z * 2.15, .23, .62, .22, steel, motion)
    }
    box(0, 1.13, 0, .55, .66, .65, 'team')
    box(.29, 1.15, 0, .12, .47, .5, dark)
    box(-.34, 1.18, 0, .23, .5, .48, id === 'medic' ? '#ece8d8' : '#8f9874')
    part('rock', [0, 1.66, 0], [.45, .48, .45], '#cba586')
    part('rock', [-.03, 1.86, 0], [.57, .35, .59], id === 'worker' ? '#654d3b' : id === 'engineer' ? '#e4b64a' : steel)
    box(.23, 1.74, 0, .05, .1, .43, glass)
    if (id === 'worker') {
      box(.15, .68, .46, .34, .29, .15, '#b48f58')
    } else if (id === 'medic') {
      box(-.467, 1.19, 0, .02, .28, .09, '#249dc1')
      box(-.468, 1.19, 0, .02, .09, .28, '#249dc1')
    } else if (id === 'engineer') {
      box(.45, .9, .3, .36, .3, .22, '#dba737')
    } else {
      box(.53, 1.04, .28, id === 'sniper' ? 1.55 : .9, .13, .13, rubber)
      box(.31, .89, .28, .16, .26, .13, dark)
      if (id === 'sniper') { part('cone', [-.13, 1.04, 0], [.82, 1.25, .85], '#536452'); box(.53, 1.18, .28, .38, .1, .1, dark) }
      if (id === 'rocketeer') part('cylinder', [.15, 1.38, -.45], [.3, 1.15, .3], dark, [0, 0, Math.PI / 2])
    }
    return a
  }
  if (def.domain === 'air') {
    part('rock', [0, .55, 0], [1.85, .6, .68], steel)
    part('rock', [.55, .67, 0], [.68, .4, .57], glass)
    const heli = id.includes('heli') || id === 'gunship'
    box(-.84, .58, 0, .9, .16, .17, steel)
    box(-1.16, .85, 0, .24, .5, .1, 'team')
    if (heli) {
      box(0, 1.01, 0, .09, .38, .09, dark)
      part('box', [0, 1.19, 0], [2.7, .035, .13], rubber, [0, 0, 0], 'rotor')
      part('box', [0, 1.195, 0], [.13, .035, 2.7], rubber, [0, 0, 0], 'rotor')
      for (const z of [-.4, .4]) { box(0, .06, z, 1.3, .07, .07, dark); box(0, .25, z, .08, .4, .07, steel) }
    } else {
      part('box', [-.05, .45, -.66], [.72, .075, 1.1], steel, [0, -.3, 0])
      part('box', [-.05, .45, .66], [.72, .075, 1.1], steel, [0, .3, 0])
      box(-1, .61, 0, .3, .065, 1, 'team')
      for (const z of [-.56, .56]) part('cylinder', [-.3, .32, z], [.16, .6, .16], dark, [0, 0, Math.PI / 2])
    }
    return a
  }
  if (def.domain === 'sea') {
    part('rock', [0, .15, 0], [2.6, .58, .87], dark)
    box(-.1, .35, 0, 1.94, .2, .6, steel)
    if (id === 'submarine') {
      part('rock', [0, .28, 0], [2.65, .48, .61], steel)
      box(-.2, .62, 0, .4, .57, .25, steel)
      box(-.2, .97, 0, .04, .35, .04, dark)
    } else {
      box(-.18, .65, 0, .67, .47, .46, steel)
      box(-.05, .94, 0, .41, .13, .5, glass)
      box(-.22, 1.22, 0, .04, .54, .04, dark)
      part('box', [-.22, 1.46, 0], [.44, .12, .03], trim, [0, 0, 0], 'radar')
      box(.72, .61, 0, .34, .23, .33, trim, 'turret')
      box(1.02, .65, 0, .6, .065, .065, dark, 'barrel')
      box(-.78, .51, 0, .35, .18, .47, trim)
    }
    return a
  }
  const wheeled = ['scout', 'apc', 'samtruck', 'extractor', 'mlrs'].includes(id)
  box(0, .49, 0, 1.75, .46, 1.05, steel)
  box(.75, .56, 0, .28, .33, 1.08, steel)
  for (const z of [-.61, .61]) {
    if (!wheeled) box(0, .25, z, 1.97, .44, .32, rubber)
    for (const x of [-.65, 0, .65]) {
      const outer = wheeled ? z : z * 1.3
      part('cylinder', [x, .27, outer], [.43, .16, .43], wheeled ? rubber : '#52645b', [Math.PI / 2, 0, 0])
      part('cylinder', [x, .27, outer + Math.sign(z) * .09], [.2, .04, .2], trim, [Math.PI / 2, 0, 0])
    }
  }
  for (const z of [-.39, .39]) box(.91, .54, z, .025, .13, .14, '#ffdc8d')
  box(-.77, .76, 0, .26, .07, .65, dark)
  if (id === 'extractor' || id === 'crawler') {
    box(.49, .98, 0, .58, .53, .75, steel)
    box(.79, 1.04, 0, .03, .3, .64, glass)
    box(-.3, .88, 0, .85, .45, .84, '#d5aa53')
    if (id === 'crawler') box(1.15, .22, 0, .12, .55, 1.6, '#d5aa53')
    else part('rock', [-.3, 1.17, 0], [.68, .4, .6], '#979184')
  } else if (id === 'apc' || id === 'scout') {
    box(.15, .96, 0, 1.15, .53, .85, steel)
    box(.737, 1.02, 0, .025, .27, .74, glass)
    box(-.05, 1.28, 0, .42, .1, .44, 'team')
  } else if (id === 'mlrs' || id === 'samtruck' || id === 'aa') {
    part('box', [-.12, 1.02, 0], [1.14, .52, .83], dark, [0, 0, .22], 'turret')
    for (const z of [-.27, 0, .27]) part('cylinder', [.03, 1.16, z], [.15, 1.34, .15], trim, [0, 0, -Math.PI / 2 + .22], 'turret')
  } else {
    box(-.06, .98, 0, .87, .44, .77, steel, 'turret')
    box(-.08, 1.24, 0, .4, .08, .4, 'team', 'turret')
    const length = id === 'artillery' ? 1.7 : 1.12
    box(.7, 1.03, 0, length, .13, .16, dark, 'barrel')
    box(-.24, 1.49, -.31, .027, .62, .027, dark, 'turret')
  }
  return a
}

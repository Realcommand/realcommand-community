import type { CivicId } from '../../shared/civic.ts'
import { modelAuthor } from './author.ts'

export function civilModel(id: CivicId) {
  const { parts, part, box } = modelAuthor()
  const cream = '#e5dcca', brick = '#b78368', glass = '#789f9d', dark = '#334c49', roof = '#71837d'
  box(0, .06, 0, 2.2, .12, 2, '#c6c4af')
  box(0, .14, .83, 2, .06, .18, '#e9e1c8')
  const floor = (x: number, y: number, z: number, w: number, d: number, color: string) => {
    box(x, y, z, w, .39, d, color)
    box(x, y + .12, z + d / 2 + .008, w * .86, .16, .02, glass)
    box(x + w / 2 + .008, y + .12, z, .02, .16, d * .83, glass)
    box(x, y + .23, z, w + .06, .065, d + .06, cream)
  }
  const entrance = (x: number, z: number) => {
    box(x, .3, z, .26, .32, .025, dark)
    box(x, .5, z + .1, .47, .065, .3, '#cfaa67')
  }
  if (id === 'housing') {
    for (const x of [-.5, .5]) {
      for (let f = 0; f < 3; f++) floor(x, .37 + f * .48, -.05, .84, 1.24, x < 0 ? brick : cream)
      part('cone', [x, 1.92, -.05], [.74, .43, .98], '#7c8582', [0, Math.PI / 4, 0])
      entrance(x, .59)
    }
  } else if (id === 'farm') {
    box(-.53, .38, -.44, .78, .5, .7, brick)
    part('cone', [-.53, .87, -.44], [.67, .44, .6], '#7b8c79', [0, Math.PI / 4, 0])
    entrance(-.53, -.08)
    box(.36, .16, 0, .86, .07, 1.42, '#8c7852')
    for (let z = -.59; z < .7; z += .22) box(.36, .22, z, .8, .12, .09, '#b4ba64')
    part('cylinder', [-.58, .42, .43], [.35, .56, .35], '#c8b989')
  } else if (id === 'market_hall') {
    box(0, .38, -.23, 1.75, .5, .99, cream)
    part('cone', [0, .88, -.23], [1.32, .56, .83], '#738f81', [0, Math.PI / 4, 0])
    for (const x of [-.65, -.22, .22, .65]) {
      box(x, .46, .38, .37, .12, .48, x < 0 ? '#c5926c' : '#809867')
      box(x, .23, .48, .32, .18, .21, '#ba9e6e')
      for (const dx of [-.13, .13]) box(x + dx, .3, .56, .025, .35, .025, dark)
      part('rock', [x, .35, .49], [.22, .12, .17], '#e4bd6c')
    }
  } else if (id === 'school') {
    floor(0, .36, -.3, 1.8, .8, cream)
    floor(-.58, .85, -.3, .62, .8, brick)
    part('cone',[-.58,1.32,-.3],[.74,.3,.94],roof)
    entrance(0, .12)
    box(.25, .16, .56, .85, .02, .4, '#8da490')
    for (const x of [-.8, -.53]) box(x, .24, .54, .2, .14, .12, '#c5a577')
    box(-.87, .78, .55, .022, 1.22, .022, dark)
    box(-.73, 1.28, .55, .27, .17, .015, '#d4ad5a')
  } else if (id === 'training_center') {
    // A practical teaching hall: sawtooth skylights and an outdoor exercise yard.
    box(-.29,.46,-.28,1.3,.66,1.04,brick)
    for(const x of [-.73,-.29,.15]) {
      part('box',[x,.86,-.28],[.46,.06,1.11],roof,[0,0,.3])
      box(x+.21,.86,-.28,.025,.18,1.02,glass)
      box(x,.46,.25,.3,.45,.025,dark)
      box(x,.67,.268,.3,.1,.018,glass)
    }
    floor(.68,.36,-.44,.41,.73,cream)
    entrance(.68,-.06)
    box(.05,.16,.58,1.56,.025,.43,'#8da490')
    for(const x of [-.56,-.06,.44]) {
      for(const dx of [-.13,.13])box(x+dx,.3,.59,.028,.27,.028,dark)
      box(x,.42,.59,.3,.035,.04,'#c5a577')
    }
    box(-.31,.28,.272,.19,.09,.025,'#d4ad5a')
  } else if (id === 'civic_workshop') {
    box(0, .4, -.15, 1.8, .55, 1.2, brick)
    for (const x of [-.56, 0, .56]) {
      box(x, .38, .46, .41, .42, .025, dark)
      part('cone', [x, .86, -.15], [.48, .38, 1.05], roof, [0, Math.PI / 4, 0])
    }
    for (const x of [-.48, -.18, .14]) box(x, .25, .73, .24, .23, .23, '#c2aa76')
    box(-.84, .82, -.5, .12, 1.3, .12, '#827c6d')
  } else if(id==='transport_hub') {
    box(0,.12,.25,2,.05,1.2,'#53635f')
    box(-.65,.5,-.5,.6,.7,.6,cream)
    for(const x of [-.35,.35]){
      box(x,.72,0,.08,1,.08,dark);box(x,.9,.15,.6,.1,1.15,'#b4c6b7')
      box(x,.3,.25,.28,.25,.65,'#c5a862');box(x,.39,.49,.25,.12,.04,glass)
    }
    for(const x of [-.85,0,.85])box(x,.16,.55,.05,.02,.55,cream)
  } else if(id==='office') {
    // Stepped office terraces keep a broad, low profile beside the tower.
    floor(0,.37,-.12,1.8,1.35,cream)
    for(let f=0;f<3;f++)floor(-.27,.82+f*.43,-.27,1.25-f*.22,1.05-f*.1,'#a6b8b0')
    for(const [x,y,z] of [[.7,.75,.07],[.38,1.18,-.03],[.18,1.61,-.14]]) {
      box(x,y,z,.18,.11,.59,cream)
      box(x,y+.07,z,.13,.08,.52,'#78916c')
    }
    box(-.34,2.02,-.32,.41,.1,.39,roof)
    entrance(.55,.57)
  } else if(id==='skyscraper') {
    const floors = 10
    for (let f = 0; f < floors; f++) {
      const upper = f > 6
      floor(upper ? -.15 : 0, .38 + f * .43, -.12, upper ? 1 : 1.5, upper ? 1.02 : 1.36, f % 2 ? '#bcc9bc' : '#a6b8b0')
    }
    const top = .68 + floors * .43
    box(-.16, top, -.15, .68, .19, .65, roof)
    box(-.25, top + .32, -.15, .035, .5, .035, dark)
    entrance(0, .59)
    box(.57, .22, .79, .4, .2, .15, '#91a282')
  }
  // Small landscaped forecourt, shared instance geometry with the landscape.
  box(.87, .22, .7, .22, .22, .22, '#aab194')
  part('rock', [.87, .43, .7], [.34, .35, .34], '#78916c')
  return parts
}

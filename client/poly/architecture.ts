import type { BuildingDef } from '../../shared/data.ts'
import { modelAuthor } from './author.ts'

/** Concrete service architecture from the coastal world-concept reference. */
export function militaryArchitecture(def: BuildingDef) {
  const { parts, part, box } = modelAuthor()
  const concrete='#85877b', pale='#b0afa0', roof='#50574d', dark='#242d2b', olive='#51583b', yellow='#ba983d', glass='#364f53'
  const chimney=(x:number,base:number,z:number,top:number,diameter:number,kind:'steam'|'smoke')=>{
    part('cylinder',[x,(base+top)/2,z],[diameter,top-base,diameter],roof)
    part('cylinder',[x,top-.014,z],[diameter*1.12,.028,diameter*1.12],pale)
    part('cylinder',[x,top,z],[diameter*.72,.012,diameter*.72],dark)
    parts[parts.length-1].exhaust=kind
  }
  const windows=(x:number,y:number,z:number,count:number)=>{
    for(let i=0;i<count;i++) {
      box(x+i*.24,y,z,.17,.12,.012,dark)
      part(i%4===0?'light':'box',[x+i*.24,y+.01,z+.008],[.135,.085,.009],i%4===0?'#af904e':glass)
    }
  }
  const vents=(y:number)=>{
    for(const x of [-.47,.14]) {
      box(x,y,0,.34,.11,.22,roof)
      for(const z of [-.07,0,.07])box(x,y+.059,z,.27,.012,.025,dark)
    }
  }
  const railing=(y:number)=>{
    for(const z of [-.64,.64]) {
      box(0,y,z,1.68,.025,.025,roof)
      for(const x of [-.78,-.26,.26,.78])box(x,y-.09,z,.022,.2,.022,roof)
    }
  }
  const crate=(x:number,y:number,z:number,w=.17)=>{
    box(x,y,z,w,w*.8,w*.85,'#777356')
    for(const dx of [-w*.32,w*.32])box(x+dx,y,z+w*.435,.009,w*.8,.009,dark)
    box(x,y-w*.42,z,w*1.05,.022,w*.94,roof)
  }
  const lamp=(x:number,y:number,z:number)=>{
    box(x,y-.028,z,.10,.045,.06,dark)
    part('light',[x,y-.055,z+.01],[.072,.018,.042],'#e5c280')
  }
  const ladder=(x:number,z:number,base:number,height:number)=>{
    for(const dx of [-.035,.035])box(x+dx,base+height/2,z,.009,height,.014,roof)
    for(let y=base;y<base+height;y+=.065)box(x,y,z+.012,.08,.009,.018,pale)
  }
  const infrastructure=(height:number)=>{
    // Recessed panels, expansion seams, coping, gutters and service equipment
    // add real geometry at multiple scales instead of a painted flat façade.
    for(const x of [-.85,.85]) {
      for(let z=-.56;z<.65;z+=.22) {
        box(x,.15+height*.42,z,.017,height*.73,.17,'#949485')
        box(x*1.015,.15+height*.42,z-.09,.012,height*.77,.012,dark)
      }
      box(x*1.04,height+.13,0,.034,.035,1.50,pale)
      box(x*1.035,height*.55,-.56,.025,height+.11,.025,roof)
    }
    for(let x=-.76;x<.82;x+=.28)for(const z of [-.692,.692]) {
      box(x,.15,z,.18,.10,.018,'#686f60')
      box(x,.08,z,.015,.07,.027,dark)
    }
    for(const z of [-.73,.73])box(0,height+.13,z,1.77,.038,.036,pale)
    for(const x of [-.72,-.38,.02,.4,.74])box(x,height+.17,-.65,.025,.09,.025,roof)
    box(0,height+.21,-.65,1.5,.017,.017,roof)
    for(let z=-.45;z<.52;z+=.11)box(.41,height+.132,z,.45,.006,.005,'#768073')
    box(.67,height+.21,-.39,.22,.15,.29,'#858a7b')
    for(let z=-.48;z<-.28;z+=.035)box(.79,height+.22,z,.007,.1,.012,dark)
    part('cylinder',[-.15,height+.21,-.46],[.12,.18,.12],roof)
    part('cylinder',[-.15,height+.32,-.46],[.17,.032,.17],pale)
    ladder(.79,.746,.10,height+.19)
    lamp(-.62,height-.06,.76);lamp(.35,height-.06,.76)
    for(const [x,z] of [[-.82,.88],[-.57,.88],[.4,-.87],[.65,-.87]])crate(x,.16,z)
    for(const x of [-.92,.92])for(const z of [-.78,.8]) {
      part('cylinder',[x,.145,z],[.028,.22,.028],yellow)
      part('cylinder',[x,.18,z],[.03,.04,.03],dark)
    }
    for(let i=0;i<4;i++)box(.49,.013+i*.018,.85-i*.035,.31,.025,.13,concrete)
    box(-.35,height+.147,.30,.55,.018,.33,'#344344')
    for(let x=-.57;x<-.1;x+=.10)box(x,height+.158,.30,.005,.005,.33,'#8b958c')
  }
  box(0,.025,0,2.08,.05,1.84,'#69716a')
  if(def.role==='defense') {
    // Each emplacement reads by function even without its faction colour.
    const pedestal=(width:number,height:number)=>{
      part('cylinder',[0,.06+height/2,0],[width,height,width],concrete)
      part('cylinder',[0,.07+height,0],[width+.07,.06,width+.07],roof)
    }
    if(def.id==='bunker') {
      box(0,.24,0,1.42,.38,1.13,concrete)
      box(0,.46,0,1.65,.14,1.35,pale)
      for(const z of [-.576,.576])box(0,.30,z,.95,.075,.025,dark)
      box(.718,.3,0,.025,.075,.72,dark)
      box(-.72,.22,0,.024,.27,.27,roof)
      for(const z of [-.75,.75])for(const x of [-.6,-.2,.2,.6]) {
        part('rock',[x,.16,z],[.39,.2,.21],olive)
      }
      box(.79,.3,0,.2,.035,.05,dark,'barrel')
    } else if(def.id==='turret') {
      pedestal(1.12,.43)
      part('rock',[-.06,.72,0],[.91,.46,.79],olive,[0,0,0],'turret')
      box(.58,.76,0,1.08,.09,.12,dark,'barrel')
      box(1.08,.76,0,.15,.15,.19,roof,'barrel')
      box(-.2,.97,0,.29,.07,.3,pale,'turret')
      ladder(-.38,.51,.1,.38)
    } else if(def.id==='aagun') {
      pedestal(1.36,.15)
      box(0,.4,0,.42,.46,.38,olive,'turret')
      for(const z of [-.24,.24]) {
        part('box',[.38,.72,z],[1.02,.065,.065],dark,[0,0,.55],'barrel')
        box(-.25,.45,z,.37,.25,.17,roof,'turret')
      }
      box(-.37,.84,0,.035,.58,.035,roof,'turret')
      part('box',[-.37,1.11,0],[.12,.27,.49],pale,[0,0,-.3],'turret')
      for(const z of [-.67,.67])box(-.15,.2,z,.85,.28,.1,concrete)
    } else if(def.id==='sam') {
      pedestal(.82,.24)
      box(-.05,.52,0,.27,.5,.49,roof,'turret')
      for(const z of [-.38,0,.38]) {
        part('box',[.06,.83,z],[1.25,.25,.27],olive,[0,0,.62],'turret')
        part('box',[.54,1.175,z],[.055,.21,.23],pale,[0,0,.62],'turret')
        part('box',[-.44,.475,z],[.04,.21,.23],dark,[0,0,.62],'turret')
      }
      box(-.8,.29,-.47,.29,.44,.55,concrete)
      box(-.8,.7,-.47,.025,.47,.025,dark)
      box(-.8,.96,-.47,.33,.12,.08,pale)
    } else if(def.id==='coastal') {
      pedestal(1.66,.28)
      box(-.1,.57,0,1.13,.52,.97,olive,'turret')
      box(-.18,.86,0,1.12,.09,1.01,pale,'turret')
      for(const z of [-.27,.27]) {
        box(.74,.66,z,1.38,.13,.16,dark,'barrel')
        box(1.39,.66,z,.13,.18,.23,roof,'barrel')
      }
      for(const z of [-.76,.76])box(-.17,.24,z,1.38,.35,.15,concrete)
      ladder(-.72,.43,.1,.7)
    }
    for(const x of [-.88,-.65])crate(x,.14,.74,.19)
    box(-.55,.095,-.79,.28,.025,.12,'team')
    return parts
  }
  if(def.role==='refinery') {
    // Receiving bunker, inclined conveyor and a separate processing silo.
    box(-.45,.32,-.35,.96,.54,.92,concrete)
    box(-.45,.62,-.35,1.02,.08,.99,roof)
    windows(-.78,.37,.12,3)
    part('cylinder',[.53,.68,-.46],[.56,1.25,.56],olive)
    part('cone',[.53,1.44,-.46],[.6,.28,.6],pale)
    for(const y of [.26,.76,1.22])part('cylinder',[.53,y,-.46],[.58,.04,.58],yellow)
    box(.51,.37,.45,.71,.58,.59,roof)
    box(.51,.68,.45,.81,.09,.69,yellow)
    for(const x of [.22,.47,.71])part('rock',[x,.73,.45],[.24,.19,.28],'#989084')
    part('box',[-.19,.51,.43],[1.18,.1,.34],dark,[0,0,-.27])
    for(const z of [.24,.62])part('box',[-.19,.60,z],[1.22,.045,.035],yellow,[0,0,-.27])
    for(const x of [-.67,-.27,.1])box(x,.24,.43,.045,.34,.37,roof)
    for(const z of [-.25,-.04])box(.17,.46,z,.52,.07,.07,pale)
    ladder(.86,-.2,.1,.91)
    lamp(-.52,.57,.19)
    box(-.44,.43,.12,.2,.05,.02,'team')
    for(const x of [-.83,-.57])crate(x,.16,.8)
    return parts
  }
  if(def.role==='tech') {
    // Three laboratory wings around a glazed central atrium.
    for(const x of [-.64,.64]) {
      box(x,.39,-.06,.48,.65,1.42,pale)
      box(x,.75,-.06,.54,.07,1.48,roof)
      box(x,.49,.656,.36,.22,.019,glass)
      for(const dx of [-.12,.12])box(x+dx,.49,.67,.017,.23,.018,pale)
      for(const z of [-.56,-.27,.02,.31,.56])box(x+Math.sign(x)*.247,.48,z,.018,.22,.19,glass)
      for(const z of [-.45,.13])box(x,.83,z,.28,.09,.27,roof)
    }
    box(0,.3,-.54,.82,.46,.42,concrete)
    box(0,.39,0,.78,.64,.71,glass)
    part('cone',[0,.93,0],[1.05,.55,1.05],glass,[0,Math.PI/4,0])
    for(const x of [-.37,0,.37])box(x,.42,.365,.027,.64,.03,pale)
    box(0,.2,.53,.5,.28,.3,dark)
    box(0,.37,.61,.64,.065,.47,pale)
    box(0,.41,.81,.25,.025,.025,'team')
    for(const x of [-.71,.71]) {
      box(x,.14,.82,.32,.16,.18,concrete)
      part('rock',[x,.27,.82],[.28,.18,.15],olive)
      lamp(x,.69,.68)
    }
    return parts
  }
  if(def.role==='repair') {
    // A pitched service shed and an open vehicle lift, unlike the factory hall.
    box(-.48,.37,-.15,.8,.64,1.22,concrete)
    for(const side of [-1,1])part('box',[-.48+side*.23,.80,-.15],[.55,.065,1.34],roof,[0,0,-side*.42])
    box(-.48,.31,.468,.59,.49,.022,dark)
    for(const x of [-.75,-.21])box(x,.36,.49,.045,.63,.06,yellow)
    box(.44,.085,.02,.77,.07,1.53,dark)
    for(const x of [.14,.74]) {
      box(x,.49,.08,.09,.87,.14,yellow)
      box(x,.28,.18,.25,.055,.76,roof)
      box(x,.93,.08,.15,.06,.21,pale)
    }
    for(const z of [-.51,.59])box(.44,.11,z,.6,.035,.05,yellow)
    box(-.46,.57,-.77,.58,.16,.02,glass)
    box(-.48,.64,.49,.22,.05,.02,'team')
    for(const z of [-.46,-.12,.22])crate(-.93,.16,z,.15)
    lamp(-.48,.63,.53)
    return parts
  }
  // A small faction plaque leaves the silhouette's materials independent of owner colour.
  if(def.role==='airfield') {
    box(.12,.057,.08,1.48,.012,1.46,dark)
    for(const x of [-.13,.37])box(x,.066,.08,.025,.009,.64,yellow)
    box(.12,.066,.08,.52,.009,.035,yellow)
    for(const z of [-.65,.8])for(let i=0;i<6;i++)box(-.53+i*.22,.067,z,.10,.01,.025,pale)
    box(-.85,.31,-.1,.31,.5,1.45,concrete)
    box(-.85,.58,-.1,.35,.05,1.5,roof)
    box(-.687,.35,-.12,.012,.22,.58,dark)
    box(-.85,.55,.63,.19,.06,.012,'team')
    for(const z of [-.65,.72])part('cylinder',[.91,.12,z],[.04,.13,.04],yellow)
    for (const p of parts) if (p.p[1] < .075) { p.p[1] *= .01; p.s[1] *= .01 }
    for(let z=-.56;z<.58;z+=.14){box(-.683,.32,z,.008,.17,.095,glass);box(-.85,.53,z,.32,.018,.009,pale)}
    ladder(-.66,-.60,.09,.49)
    lamp(-.65,.49,.53)
    for(const x of [-.62,.78])for(const z of [-.62,.7])part('light',[x,.035,z],[.045,.025,.045],'#e6be72')
    return parts
  }
  if(def.role==='radar') {
    box(0,.16,0,1.65,.3,1.47,concrete)
    box(0,.34,0,1.73,.065,1.55,roof)
    box(.13,.78,0,.60,.84,.60,pale)
    for(const x of [-.2,.46])box(x,.72,0,.09,.78,.71,concrete)
    box(.13,1.22,0,.88,.08,.88,roof)
    box(.13,1.15,0,.92,.07,.92,yellow)
    part('dome',[.13,1.69,0],[.96,.96,.96],'#e1e1d5')
    for(const x of [-.29,.55])for(const z of [-.42,.42])box(x,1.34,z,.018,.19,.018,roof)
    for(const z of [-.42,.42])box(.13,1.435,z,.86,.018,.018,roof)
    for(const x of [-.29,.55])box(x,1.435,0,.018,.018,.85,roof)
    for(const x of [-.77,-.58])box(x,.97,-.38,.035,1.7,.035,dark)
    for(const y of [.45,.74,1.03,1.32,1.61])box(-.675,y,-.38,.22,.025,.025,roof)
    box(-.77,1.54,-.38,.37,.22,.035,olive,'radar')
    windows(-.53,.22,.742,5)
    box(.73,.24,.742,.2,.27,.02,dark)
    box(.13,1.19,.467,.28,.035,.012,'team')
    for(const x of [-.17,.04,.26,.46]) {
      box(x,.97,.31,.13,.13,.018,glass)
      box(x,1.045,.322,.15,.016,.019,dark)
    }
    for(const y of [.42,.60,.78,.96])box(.13,y,.366,.68,.011,.026,'#747c6d')
    ladder(.47,.402,.39,.83)
    for(let y=.52;y<1.7;y+=.18)part('box',[-.676,y,-.38],[.23,.014,.015],roof,[0,0,.68])
    for(const x of [-.65,-.4,.64])crate(x,.45,-.5,.16)
    for(const z of [-.73,.73])for(let x=-.77;x<.8;x+=.2) {
      box(x,.43,z,.015,.18,.015,roof)
      box(x,.51,z,.22,.016,.016,roof)
    }
    for(const x of [-.69,.69])lamp(x,.31,.78)
    for(let i=0;i<5;i++)box(.6,.02+i*.023,.82-i*.04,.25,.03,.15,concrete)
    for(const z of [-.55,-.27,.01,.29,.57])for(const x of [-.82,.82])box(x,.14,z,.04,.25,.04,'#5f685b')
    return parts
  }
  if(def.role==='shipyard') {
    // A working quay, drydock apron, mooring furniture and gantry replace the
    // generic factory silhouette. Geometry remains inside the building radius.
    box(0,.08,0,1.96,.16,1.7,concrete)
    box(.42,.38,-.43,.89,.58,.65,concrete)
    box(.42,.69,-.43,.94,.055,.70,roof)
    for(let x=.05;x<.9;x+=.13)box(x,.41,-.095,.082,.20,.014,glass)
    for(const x of [-.84,.02]) {
      box(x,.65,.16,.065,1.2,.075,yellow)
      box(x,.14,.16,.19,.05,.6,roof)
      for(const z of [-.10,.42])part('cylinder',[x,.13,z],[.1,.1,.1],dark,[Math.PI/2,0,0])
      part('box',[x,.83,.33],[.045,.84,.045],yellow,[.28,0,0])
    }
    box(-.41,1.25,.16,1.08,.10,.15,yellow)
    box(-.36,1.18,.16,.25,.12,.22,roof)
    for(const x of [-.41,-.32])box(x,.85,.16,.007,.65,.007,dark)
    box(-.365,.52,.16,.13,.055,.09,yellow)
    for(let x=-.88;x<.98;x+=.19) {
      box(x,.18,.77,.10,.017,.035,yellow)
      part('cylinder',[x,.08,.866],[.07,.16,.07],dark)
      box(x,.07,-.86,.13,.12,.04,dark)
    }
    for(const [x,z] of [[.4,.25],[.68,.28],[.66,.55]])crate(x,.29,z,.23)
    for(let x=-.9;x<.98;x+=.15)box(x,.17,-.82,.016,.03,.04,pale)
    ladder(.91,-.1,.17,.55);lamp(.15,.58,-.06)
    return parts
  }
  const tall=def.role==='factory'
  const h=tall?.66:.44
  box(0,h/2+.075,0,1.7,h,1.36,concrete)
  box(0,h+.092,0,1.82,.065,1.48,roof)
  for(const z of [-.69,.69])box(0,h-.025,z,1.72,.035,.025,yellow)
  for(const x of [-.87,.87])box(x,h*.52+.07,0,.075,h+.10,1.41,'#777b70')
  if(tall) {
    for(const x of [-.56,.48])chimney(x,.81,-.46,1.28,.12,'smoke')
    for(const x of [-.49,.34]) {
      box(x,.30,.691,.60,.43,.018,dark)
      for(let y=.17;y<.53;y+=.065)box(x,y,.705,.57,.018,.015,'#414944')
      box(x,.53,.715,.66,.035,.04,pale)
    }
    for(const x of [-.55,0,.55])box(x,h+.16,0,.31,.055,1.18,'#6a776c')
    windows(-.6,.44,-.685,6)
    for(const x of [-.94,.94])box(x,.73,.53,.055,1.4,.06,yellow)
    box(0,1.42,.53,1.97,.085,.10,yellow)
    box(.44,1.1,.53,.018,.55,.018,dark)
    box(.44,.81,.53,.10,.065,.06,roof)
  } else if(def.role==='power') {
    for(const x of [-.45,.31]) {
      part('cylinder',[x,.81,.14],[.44,1.1,.44],olive)
      part('cylinder',[x,.9,.14],[.45,.075,.45],yellow)
      part('cylinder',[x,1.35,.14],[.45,.035,.45],pale)
      chimney(x,1.37,.14,1.49,.10,'steam')
    }
    for(const x of [-.72,.65])box(x,.96,-.4,.105,1.25,.11,dark)
    box(-.03,.66,-.39,.76,.09,.10,roof)
    windows(-.55,.23,.687,4)
  } else if(def.role==='command') {
    box(-.35,.79,-.10,.73,.61,.80,concrete)
    box(-.35,.97,-.1,.78,.18,.85,glass)
    box(-.35,1.10,-.1,.86,.065,.92,roof)
    box(-.56,1.36,-.26,.018,.52,.018,dark)
    box(-.38,1.26,-.26,.4,.045,.025,pale)
    windows(-.55,.30,.689,5)
    box(.67,.25,.704,.23,.33,.032,dark)
    vents(h+.18)
  } else {
    windows(-.62,.31,.687,6)
    windows(-.62,.31,-.687,6)
    box(.62,.23,.709,.23,.30,.035,dark)
    box(.62,.415,.80,.38,.03,.21,roof)
    vents(h+.17)
  }
  box(-.7,h-.03,.708,.17,.035,.012,'team')
  // Logistics details: cargo, ducts, bollards and roof rails use shared geometry.
  for(const [x,z] of [[-.75,.82],[-.42,.83]]) {
    box(x,.16,z,.24,.25,.21,'#7c7958')
    box(x,.16,z+.108,.025,.24,.012,'#413e2e')
  }
  if(!tall&&def.role!=='power')railing(h+.25)
  infrastructure(h)
  return parts
}

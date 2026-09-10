import { BUILDINGS, DEFS, UNITS } from '../../shared/data.ts'
import type { ClientEntity } from '../state.ts'
import { hash2 } from '../../shared/math.ts'
export const DEMO_X = 22_100_000, DEMO_Y = 5_200_000
export const SCENES = [
  { id: 'concept', title: 'Die Konzeptwelt', description: 'Felsige Küste, Nadelwald, Hafen und Radarstation im Abendlicht. Interaktive Referenzszene mit demselben Renderer und denselben Modellen wie das Spiel.', mpp: .55, x: 0, y: 0 },
  { id: 'robotics', title: 'Robotik 2026', description: 'Serviceroboter für Wartung, Roboterhunde für Bodenaufklärung und Kameradrohnen mit Akku und Rückkehr zum Flugfeld. Produzierbare Einheiten für alle Fraktionen.', mpp: .025, x: 0, y: 0 },
  { id: 'city', title: 'Die zivile Stadt', description: 'Wohnquartiere, Markt und Landwirtschaft. Schulen und Ausbildung versorgen Büros mit Fachkräften. Eine kleine Skyline für eine wachsende Welt.', mpp: .75, x: 0, y: 0 },
  { id: 'buildings', title: 'Gebäude im Vergleich', description: 'Alle Gebäudetypen mit eigenen Silhouetten. Gleiche Blickrichtung und Fraktion machen Architektur und Funktion direkt vergleichbar.', mpp: 1.3, x: 0, y: 0 },
  { id: 'outpost', title: 'Der Außenposten', description: 'Kommandozentrale, Versorgung und ein Verband auf Patrouille. Eine gemeinsame Formsprache für die gesamte Spielwelt.', mpp: .52, x: 0, y: 0 },
  { id: 'characters', title: 'Menschen mit Aufgaben', description: 'Sanitäter, Pionier, Schütze, Panzerabwehr und Scharfschütze. Ausrüstung und Silhouette machen ihre Aufgabe erkennbar.', mpp: .08, x: 0, y: 0 },
  { id: 'vehicles', title: 'Stahl in Bewegung', description: 'Panzer, Transporter, Artillerie und Versorgung. Bewegliche Türme, Helikopterrotoren und klare Fraktionsfarben.', mpp: .28, x: 0, y: 0 },
  { id: 'coast', title: 'Über die Küste hinaus', description: 'Eine Marinegruppe vor der Küste. Land, Wasser und Vegetation entstehen lokal aus einer reproduzierbaren Welt.', mpp: .5, x: 0, y: 0 },
  { id: 'crowd', title: 'Ein großer Verband', description: '2.000 lokale Modelle prüfen die grafischen Detailstufen. Dies ist ein Grafiktest und kein Mehrspieler-Lasttest.', mpp: .9, x: 0, y: 0 },
] as const
export type DemoScene = typeof SCENES[number]['id']
export function demoEntities(scene: DemoScene): ClientEntity[] {
  const entities: ClientEntity[] = []
  const add = (type: string, x: number, y: number, owner = 1, heading = -.3) => {
    const def = DEFS[type]
    const id = entities.length + 1
    entities.push({ id, kind: def.kind === 'building' ? 'b' : 'u', type, owner, x: DEMO_X + x, y: DEMO_Y + y,
      tx: DEMO_X + x, ty: DEMO_Y + y, heading, thead: heading, turret: heading, speed: 0, samples: [], hp: def.hp, maxHp: def.hp,
      visible: true, ghost: false, lastUpdate: 0, seen: 0, def })
  }
  if (scene === 'concept') {
    add('radar',210,-135,1,0)
    add('command',105,-290,1,0)
    add('barracks',55,-65,1,0)
    add('factory',205,90,1,0)
    add('power',370,140,1,0)
    add('airfield',360,-130,1,0)
    add('shipyard',-130,180,1,0)
    add('workshop',80,245,1,0)
    add('transport_hub',105,10,1,0)
    add('housing',370,-350,1,0)
    add('farm',220,-465,1,0)
    add('patrol',-250,205,1,-.2)
    add('destroyer',-370,-45,1,-.4)
    for(let i=0;i<12;i++)add(['scout','apc','mbt','extractor'][i%4],60+i*21,165+(i%2)*13,1,.08)
    for(let i=0;i<12;i++)add('rifleman',175+(i%4)*6,205+Math.floor(i/4)*8,1,0)
    add('gunship',350,-140,1,-.6)
  } else if (scene === 'robotics') {
    for (const [i,type] of ['service_robot','robot_dog','recon_drone'].entries()) {
      add(type,(i-1)*8,0,1,-.55)
      add(type,(i-1)*8,7,2,-.55)
    }
  } else if (scene === 'city') {
    add('farm', -230, 45, 1, 0)
    add('market_hall', -120, 25, 1, 0)
    add('school', -20, 25, 1, 0)
    add('training_center', 80, 25, 1, 0)
    add('transport_hub',190,25,1,0)
    add('civic_workshop', -220, -85, 1, 0)
    add('office', -110, -85, 1, 0)
    add('office', -15, -95, 1, 0)
    add('skyscraper', 85, -100, 1, 0)
    add('skyscraper', 180, -90, 1, 0)
    for (const x of [-115, -15, 85, 185]) add('housing', x, 125, 1, 0)
    for (let i = 0; i < 36; i++) add('worker', -155 + i % 12 * 31, i < 12 ? 78 : i < 24 ? -26 : 180, i % 3 + 1, -.4)
    add('service_robot',-194,-26); add('robot_dog',12,78); add('recon_drone',220,78)
  } else if (scene === 'buildings') {
    BUILDINGS.forEach((def,i)=>add(def.id,(i%6-2.5)*200,(Math.floor(i/6)-1.5)*200,1,0))
  } else if (scene === 'characters') {
    for (const [i, type] of ['rifleman', 'engineer', 'medic', 'rocketeer', 'sniper'].entries()) {
      add(type, (i - 2) * 13, 0, i === 4 ? 3 : 1, -.55)
      add(type, (i - 2) * 13, 17, 2, -.55)
    }
  } else if (scene === 'vehicles') {
    const types = ['mbt', 'heavytank', 'lighttank', 'apc', 'scout', 'mlrs', 'artillery', 'aa', 'extractor', 'crawler', 'gunship', 'interceptor']
    types.forEach((type, i) => add(type, (i % 4 - 1.5) * 47, (Math.floor(i / 4) - 1) * 45, i % 3 + 1, -.4))
  } else if (scene === 'coast') {
    add('shipyard', -175, -85)
    ;['cruiser', 'destroyer', 'submarine', 'patrol', 'landingship'].forEach((type, i) => add(type, i * 58 - 55, i % 2 * 65 - 25, i % 3 + 1, -.6))
    add('cargoheli', 45, 65)
  } else if (scene === 'crowd') {
    const types = UNITS.filter(d => d.domain === 'land').map(d => d.id)
    for (let i = 0; i < 2000; i++) add(types[i % types.length], (i % 50 - 24.5) * 18, (Math.floor(i / 50) - 19.5) * 18, i % 3 + 1, -.3)
  } else {
    add('command', -135, -60)
    add('barracks', 32, -100)
    add('radar', 137, -100)
    add('power', -220, 105)
    add('factory', 178, 80)
    ;['mbt', 'lighttank', 'apc', 'scout', 'extractor', 'artillery'].forEach((type, i) => add(type, i * 28 - 75, 42 + i % 2 * 35))
    for (let i = 0; i < 16; i++) add(['rifleman', 'engineer', 'medic', 'sniper'][i % 4], i % 8 * 9 - 72, 120 + Math.floor(i / 8) * 10)
    add('gunship', 60, -5); add('cargoheli', 140, 140, 2)
  }
  return entities
}
export function demoLand(scene: DemoScene, x: number, y: number) {
  if (scene === 'concept') return x - DEMO_X > -180 + Math.sin((y-DEMO_Y)/150)*65 + Math.sin((y-DEMO_Y)/57)*23
  return scene !== 'coast' || x - DEMO_X < -100 + Math.sin((y - DEMO_Y) / 140) * 40
}
export function animateDemo(entities: ClientEntity[], time: number, motion: boolean) {
  for (const e of entities) {
    if (e.def?.kind !== 'unit') continue
    const infantry = e.def.category === 'infantry' || e.type === 'service_robot' || e.type === 'robot_dog'
    const phase = time * (infantry ? .55 : .2) + hash2(e.id, 0, 5) * 6
    const radius = infantry ? 1.1 : .6
    e.x = e.tx + (motion ? Math.sin(phase) * radius : 0)
    e.y = e.ty
    e.speed = motion && infantry ? .8 : 0
    e.turret = e.heading + (motion ? Math.sin(time * .25 + e.id) * .22 : 0)
  }
}

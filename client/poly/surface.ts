import { valueNoise } from '../../shared/math.ts'

export interface GroundSource {
  roads?: readonly { x: number, y: number, width: number, depth: number }[]
  ready: boolean
  revision?: number
  isLand(x: number, y: number): boolean
  cutAt?(x: number, y: number): number
  graphicsSnapshot?(): {kind:'world',cuts:[number,number][]}|{kind:'demo',scene:string}
}
export interface Footprint { x: number, y: number, radius: number, waterfront?:boolean }

/** Visual relief in metres. The simulation's geographic coordinates stay intact. */
export function groundHeight(x: number, y: number) {
  const ridge = 1 - Math.abs(valueNoise(x / 1150, y / 1150, 607) * 2 - 1)
  const massif=Math.max(0,valueNoise(x/4200,y/4200,619)-.42)*2.8
  return 24 + ridge ** 3 * 90 + massif**2*360 + valueNoise(x / 410, y / 410, 601) * 30
    + valueNoise(x / 135, y / 135, 603) * 13 + valueNoise(x / 38, y / 38, 609) * 3
}

/** The same surface anchors geometry, selection and pointer projection. */
export class GroundSurface {
  private cells = new Map<string, Footprint[]>()
  private elevations=new Map<string,number>()
  readonly source: GroundSource
  constructor(source: GroundSource, footprints: Footprint[]) {
    this.source = source
    for (const f of footprints) {
      const r = f.radius * 1.45
      for (let y = Math.floor((f.y - r) / 128); y <= (f.y + r) / 128; y++)
        for (let x = Math.floor((f.x - r) / 128); x <= (f.x + r) / 128; x++) {
          const key = `${x}:${y}`, items = this.cells.get(key) ?? []
          items.push(f); this.cells.set(key, items)
        }
    }
  }
  height = (x: number, y: number): number => {
    if (!this.source.ready || !this.source.isLand(x, y)) return 0
    let height = this.elevation(x, y)
    let nearest: Footprint | undefined, distance = Infinity
    for (const f of this.cells.get(`${Math.floor(x / 128)}:${Math.floor(y / 128)}`) ?? []) {
      const d = Math.hypot(x - f.x, y - f.y) / f.radius
      if (d < distance) { nearest = f; distance = d }
    }
    if (nearest && distance < 1.45) {
      const t = Math.max(0, Math.min(1, (distance - 1) / .45))
      const blend = t * t * (3 - 2 * t)
      height = (nearest.waterfront?2:this.elevation(nearest.x, nearest.y)) * (1 - blend) + height * blend
    }
    return height
  }
  private elevation(x: number, y: number) {
    const key=`${x}:${y}`,cached=this.elevations.get(key)
    if(cached!==undefined)return cached
    const height = groundHeight(x,y)
    let nearest=160
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for (const distance of [48,144]) if (!this.source.isLand(x+dx*distance,y+dy*distance)) {
        let lo=0,hi=distance
        for(let i=0;i<8;i++) {
          const mid=(lo+hi)/2
          if(this.source.isLand(x+dx*mid,y+dy*mid))lo=mid;else hi=mid
        }
        nearest=Math.min(nearest,(lo+hi)/2);break
      }
    }
    const t=nearest/160
    // Preserve a raised coastal shelf. Vertical shoreline faces join it to sea
    // level; the previous ten-metre ramp erased the concept's rocky headlands.
    const shelf=36+valueNoise(x/110,y/110,613)*22
    const result=shelf+(height-shelf)*t*t*(3-2*t)
    if(this.elevations.size>8192)this.elevations.clear()
    this.elevations.set(key,result);return result
  }
}

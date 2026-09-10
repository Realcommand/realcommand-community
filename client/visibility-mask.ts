export interface SightCircle {x:number,y:number,r:number}
/** A fully opaque inner sight disc already clears every smaller disc inside
 * it. Removing only those discs preserves the feathered visibility boundary. */
export function visibleSightDiscs(circles:SightCircle[],verticalScale:number):SightCircle[] {
  const kept:SightCircle[]=[]
  for(const circle of [...circles].sort((a,b)=>b.r-a.r)) {
    if(!kept.some(outer=>Math.hypot(circle.x-outer.x,(circle.y-outer.y)/verticalScale)+circle.r<=outer.r*.85))kept.push(circle)
  }
  return kept
}
export function sightClearsViewport(circle:SightCircle,width:number,height:number,verticalScale:number) {
  return [[0,0],[width,0],[0,height],[width,height]].every(([x,y])=>Math.hypot(x-circle.x,(y-circle.y)/verticalScale)<=circle.r*.85)
}

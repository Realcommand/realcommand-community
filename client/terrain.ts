import { Context, Service } from 'cordis'
import {worldGroundSource,worldLandAt} from './poly/world-ground.ts'
import { LandMask } from '../shared/landmask.ts'
import { CELL, GRID_W, GRID_H, WORLD_W, WORLD_H } from '../shared/constants.ts'
import { cellX, cellY } from '../shared/geo.ts'
import { clamp, hash2 } from '../shared/math.ts'
import { biomeAt, treeCanopy } from '../shared/biome.ts'
import { PATCH, PATCH_W, isPocket, patchKey, patchResources, type IsWater, type PatchInfo } from '../shared/nodes.ts'
import { CANOPY_MPP, NODE_MPP, nearestSpot, patchNodeSpots, sortSpots, type NodeSpot } from './terrain-worker.ts'
import type { Camera } from './camera.ts'

declare module 'cordis' {
  interface Context {
    terrain: Terrain
  }
  interface Events {
    'terrain/ready'(): void
  }
}

const TILE = 256
const MAX_TILES = 700
const MAX_INFLIGHT_PER_WORKER = 3
const MAX_APPLY_PER_FRAME = 10
/** Kacheln werden neu angefordert, wenn sich der Abholzungsgrad eines Patches um mindestens so viel geändert hat. */
const CUT_INVALIDATE = 0.05
/** Rand (m) um einen Patch, den Baumkronen benachbarter Zellen noch berühren können. */
const PATCH_MARGIN = 12

interface Tile { canvas: HTMLCanvasElement, lastUse: number }
interface Request { key: string, bucket: number, tx: number, ty: number, mpp: number, px: number, priority: number }

/** Berührter Patch, wie ihn der Server sendet (PatchWire §5): Schlüssel, Ressource, Vorrat (null außerhalb der Sicht), Abholzungsgrad. */
export interface PatchTouched { k: number, rs: string, rm: number | null, ct?: number }

/** Ressourcenknoten unter dem Zeiger (Ergebnis von resourceAt), für Auswahl und Cursor. */
export interface PickedNode extends PatchInfo {
  /** Vorrat laut Server (Kapazität, solange der Patch unberührt ist; null = außerhalb eigener Sicht). */
  remaining: number | null
  /** Abholzungsgrad 0..1 (nur Holz). */
  cut: number
  /** Mittelpunkt des getroffenen Knotens (Baum bzw. Knoten), z. B. für Markierungen. */
  nx: number
  ny: number
}

/**
 * Gelände: Land/Wasser-Maske für Abfragen auf dem Hauptthread, Kacheln werden in Web Workern gerendert
 * und hier nur noch eingeblendet. Nicht gerenderte Kacheln zeigen vorübergehend gröbere Kacheln.
 * Hält außerdem die Schnittkarte (cut je Patch), entdeckte Erztaschen und die berührten Patches des Servers
 * (gespiegelt aus `state.pt`/`state.ptGone` über applyPatch/removePatch) und spiegelt sie in die Worker.
 */
export class Terrain extends Service {
  static inject = []
  mask?: LandMask
  ready = false
  revision = 0
  private tiles = new Map<string, Tile>()
  private inflight = new Map<string, number>()
  private workerLoad: number[] = []
  private workers: Worker[] = []
  private results: { key: string, px: number, buffer: ArrayBuffer }[] = []
  private minimap?: HTMLCanvasElement
  private minimapRequested = false
  private workerReady: boolean[] = []
  private frame = 0
  private radarId=0
  private radarJobs=new Map<number,(image:ImageData|undefined)=>void>()
  private wanted = new Set<string>()
  /** Kacheln, die mit veralteter Schnittkarte/Entdeckung gerendert wurden und neu angefordert werden. */
  private dirty = new Set<string>()
  /** Abholzungsgrad 0..1 je Patch-Schlüssel (Holz), an alle Worker gespiegelt. */
  private cuts = new Map<number, number>()
  /** Abholzungsgrad, mit dem die Kacheln zuletzt invalidiert wurden (Schwelle CUT_INVALIDATE). */
  private cutRendered = new Map<number, number>()
  /** Entdeckte Erztaschen (Patch-Schlüssel), nur diese werden gezeichnet und sind anklickbar. */
  private discovered = new Set<number>()
  /** Berührte Patches des Servers nach `${key}:${resource}` (ein Patch kann mehrere Ressourcen tragen). */
  private touched = new Map<string, PatchTouched>()

  constructor(ctx: Context) {
    super(ctx, 'terrain')
  }

  async [Service.init]() {
    const res = await fetch('/data/landmask.rle')
    if (!res.ok) throw new Error('Weltkarte konnte nicht geladen werden')
    const buf = new Uint8Array(await res.arrayBuffer())
    this.mask = LandMask.decode(buf)
    this.startWorkers()
    this.ready = true
    this.ctx.emit('terrain/ready')
    return () => { for (const w of this.workers) w.terminate();for(const resolve of this.radarJobs.values())resolve(undefined);this.radarJobs.clear() }
  }

  private startWorkers() {
    const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2))
    for (let i = 0; i < count; i++) {
      const w = new Worker('/terrain-worker.js')
      this.workerLoad.push(0)
      this.workerReady.push(false)
      w.onmessage = (ev: MessageEvent) => {
        const msg = ev.data
        if (msg.type === 'ready') {
          this.workerReady[i] = true
        } else if (msg.type === 'tile') {
          this.workerLoad[i]--
          this.inflight.delete(msg.key)
          this.results.push({ key: msg.key, px: msg.px ?? TILE, buffer: msg.buffer })
        } else if (msg.type === 'minimap') {
          const canvas = document.createElement('canvas')
          canvas.width = msg.w; canvas.height = msg.h
          canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(msg.buffer), msg.w, msg.h), 0, 0)
          this.minimap = canvas
        } else if(msg.type==='radar') {
          this.radarJobs.get(msg.id)?.(new ImageData(new Uint8ClampedArray(msg.buffer),msg.w,msg.h))
          this.radarJobs.delete(msg.id)
        } else if (msg.type === 'error') {
          if(msg.id!==undefined){this.radarJobs.get(msg.id)?.(undefined);this.radarJobs.delete(msg.id)}
          if (msg.key) { this.workerLoad[i]--; this.inflight.delete(msg.key) }
          else this.minimapRequested = false
          this.ctx.logger.warn('Gelände-Worker: %s', msg.message)
        }
      }
      w.onerror = (ev) => this.ctx.logger.error('Gelände-Worker-Fehler: %s', ev.message)
      w.postMessage({ type: 'init', url: new URL('/data/landmask.rle', location.href).href })
      // Bereits bekannte Schnittkarte und Entdeckungen nachreichen (Zustand kann vor dem Gelände eintreffen).
      for (const [key, cut] of this.cuts) w.postMessage({ t: 'cut', key, cut })
      if (this.discovered.size) w.postMessage({ t: 'discover', keys: [...this.discovered] })
      this.workers.push(w)
    }
  }

  private postAll(msg: unknown) {
    for (const w of this.workers) w.postMessage(msg)
  }

  isLand(wx: number, wy: number) {
    return worldLandAt(this.mask,wx,wy)
  }

  isCoast(wx: number, wy: number) {
    if (!this.mask) return false
    return this.mask.isCoastCell(clamp(Math.floor(wx / CELL), 0, GRID_W - 1), clamp(Math.floor(wy / CELL), 0, GRID_H - 1))
  }

  /** Wasserabfrage in Landmaskenzellen, identisch mit world.isWater auf dem Server (für shared/nodes.ts). */
  isWater: IsWater = (x, y) => !!this.mask && !this.mask.isLandCell(cellX(x), cellY(y))

  // ---------------------------------------------------------------------------------------------------------------
  // Patches: Schnittkarte, Entdeckungen, Vorräte

  /** Berührten Patch aus `state.pt` übernehmen: Vorrat merken, Schnittkarte (Holz) und Entdeckung (Erztasche) weiterreichen. */
  applyPatch(p: PatchTouched) {
    this.touched.set(`${p.k}:${p.rs}`, p)
    if (p.rs === 'wood') this.setCut(p.k, p.ct ?? 0)
    if (isPocket(p.rs)) this.discover(p.k)
  }

  /** Patch aus `state.ptGone` entfernen; die Schnittkarte bleibt (der Wald wächst sichtbar erst mit neuen Daten nach). */
  removePatch(key: number, resource?: string) {
    if (resource !== undefined) { this.touched.delete(`${key}:${resource}`); return }
    const prefix = `${key}:`
    for (const k of this.touched.keys()) if (k.startsWith(prefix)) this.touched.delete(k)
  }

  /** Abholzungsgrad eines Patches setzen (Nachricht {t:'cut', key, cut} an die Worker) und betroffene Kacheln neu anfordern. */
  setCut(key: number, cut: number) {
    cut = clamp(cut, 0, 1)
    if ((this.cuts.get(key) ?? 0) === cut) return
    this.revision++
    if (cut > 0) this.cuts.set(key, cut); else this.cuts.delete(key)
    this.postAll({ t: 'cut', key, cut })
    if (Math.abs(cut - (this.cutRendered.get(key) ?? 0)) >= CUT_INVALIDATE) {
      if (cut > 0) this.cutRendered.set(key, cut); else this.cutRendered.delete(key)
      this.invalidatePatch(key, CANOPY_MPP)
    }
  }

  /** Abholzungsgrad 0..1 des Patches an einer Weltkoordinate. */
  cutAt(wx: number, wy: number): number {
    return this.cuts.get(patchKey(wx, wy)) ?? 0
  }
  graphicsSnapshot() { return {kind:'world' as const,cuts:[...this.cuts.entries()]} }
  /** Capture plain terrain data once per frame. Surface sampling must not
   * traverse the service proxy for every particle and coastline probe. */
  graphicsSource() {
    return worldGroundSource(this.mask,this.cuts,this.revision)
  }
  radarImage(x0:number,y0:number,width:number,height:number,w:number,h:number):Promise<ImageData|undefined> {
    const worker=this.workerReady.findIndex(Boolean)
    if(worker<0)return Promise.resolve(undefined)
    const id=++this.radarId
    return new Promise(resolve=>{this.radarJobs.set(id,resolve);this.workers[worker].postMessage({type:'radar',id,x0,y0,width,height,w,h})})
  }

  /** Erztasche als entdeckt markieren (Nachricht {t:'discover', keys}), danach wird sie gezeichnet und ist anklickbar. */
  discover(key: number) {
    if (this.discovered.has(key)) return
    this.discovered.add(key)
    this.postAll({ t: 'discover', keys: [key] })
    this.invalidatePatch(key, NODE_MPP)
  }

  isDiscovered(key: number) { return this.discovered.has(key) }

  /** Vorrat eines Patches laut Server: Kapazität für unberührte Patches, null außerhalb eigener Sicht. */
  remainingOf(p: PatchInfo): number | null {
    const t = this.touched.get(`${p.key}:${p.resource}`)
    return t ? t.rm : p.cap
  }

  /** Ressourcen des Patches an einer Weltkoordinate (Erztaschen nur, wenn entdeckt). */
  patchResourcesAt(wx: number, wy: number): PatchInfo[] {
    const key = patchKey(wx, wy)
    return patchResources(wx, wy, this.isWater).filter((p) => !isPocket(p.resource) || this.discovered.has(key))
  }

  /**
   * Ressourcenknoten unter (wx, wy) zum Anklicken: Baum (Kronendach mit Schnittkarte, wie gezeichnet) oder Knoten
   * (Aufschluss, Busch, Tonbank, Schilf, Sand, Ripples, entdeckte Erztasche) innerhalb `tolerance` (m).
   * Vorrat aus den vom Server gesendeten Patches (applyPatch), sonst Kapazität.
   */
  resourceAt(wx: number, wy: number, tolerance = 2): PickedNode | undefined {
    if (!this.mask || wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) return undefined
    const pick = (p: PatchInfo, nx: number, ny: number): PickedNode => ({ ...p, remaining: this.remainingOf(p), cut: this.cuts.get(p.key) ?? 0, nx, ny })
    // Bäume: Kronendach exakt wie im Worker (Dichte aus dem Biom, Ausdünnung über die Schnittkarte).
    if (!this.isWater(wx, wy)) {
      const density = biomeAt(wx, wy).forestDensity
      if (density > 0 && treeCanopy(wx, wy, density, hash2, this.cutAt(wx, wy)) > 0) {
        const wood = patchResources(wx, wy, this.isWater).find((p) => p.resource === 'wood')
        if (wood) return pick(wood, wx, wy)
      }
    }
    // Knoten der 3x3 umliegenden Patches (Toleranz kann über die Patchgrenze reichen).
    const ix = Math.floor(wx / PATCH), iy = Math.floor(wy / PATCH)
    const maxRow = Math.ceil(WORLD_H / PATCH) - 1
    const spots: NodeSpot[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = ix + dx, py = iy + dy
        if (px < 0 || py < 0 || px >= PATCH_W || py > maxRow) continue
        for (const s of patchNodeSpots(py * PATCH_W + px, this.isWater, this.discovered)) spots.push(s)
      }
    }
    const hit = nearestSpot(sortSpots(spots), wx, wy, tolerance)
    if (!hit) return undefined
    const info = patchResources(hit.x, hit.y, this.isWater).find((p) => p.resource === hit.resource)
    return info ? pick(info, hit.x, hit.y) : undefined
  }

  /** Kacheln, die einen Patch berühren und feiner als `maxMpp` gerendert wurden, zum Neurendern vormerken. */
  private invalidatePatch(key: number, maxMpp: number) {
    const iy = Math.floor(key / PATCH_W), ix = key - iy * PATCH_W
    const x0 = ix * PATCH - PATCH_MARGIN, y0 = iy * PATCH - PATCH_MARGIN
    const x1 = x0 + PATCH + 2 * PATCH_MARGIN, y1 = y0 + PATCH + 2 * PATCH_MARGIN
    const check = (tileKey: string) => {
      if (this.dirty.has(tileKey)) return
      const [bucket, tx, ty, px] = tileKey.split(':').map(Number)
      const tileMpp = Math.pow(2, bucket)
      if (tileMpp * TILE / px >= maxMpp) return
      const size = TILE * tileMpp
      const tx0 = tx * size, ty0 = ty * size
      if (tx0 < x1 && tx0 + size > x0 && ty0 < y1 && ty0 + size > y0) this.dirty.add(tileKey)
    }
    for (const tileKey of this.tiles.keys()) check(tileKey)
    for (const tileKey of this.inflight.keys()) check(tileKey)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Kacheln

  /** Fertige Kacheln aus den Workern übernehmen (begrenzt pro Frame). */
  private applyResults() {
    let n = 0
    while (this.results.length && n < MAX_APPLY_PER_FRAME) {
      const { key, px, buffer } = this.results.shift()!
      n++
      const canvas = document.createElement('canvas')
      canvas.width = px; canvas.height = px
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(buffer), px, px), 0, 0)
      this.tiles.set(key, { canvas, lastUse: this.frame })
      if (this.tiles.size > MAX_TILES) this.evict()
    }
  }

  private dispatch(requests: Request[]) {
    requests.sort((a, b) => a.priority - b.priority)
    for (const r of requests) {
      if (this.inflight.has(r.key)) continue
      let best = -1, bestLoad = MAX_INFLIGHT_PER_WORKER
      for (let i = 0; i < this.workers.length; i++) if (this.workerReady[i] && this.workerLoad[i] < bestLoad) { best = i; bestLoad = this.workerLoad[i] }
      if (best < 0) return
      this.workerLoad[best]++
      this.inflight.set(r.key, best)
      // Die neue Anforderung sieht die aktuelle Schnittkarte (Nachrichten kommen in Reihenfolge an).
      this.dirty.delete(r.key)
      this.workers[best].postMessage({ type: 'tile', key: r.key, tx: r.tx, ty: r.ty, mpp: r.mpp, px: r.px })
    }
  }

  /** Zeichnet das Gelände für die aktuelle Kamera. */
  draw(g: CanvasRenderingContext2D, cam: Camera) {
    this.frame++
    if (!this.ready) {
      g.fillStyle = '#1b2530'
      g.fillRect(0, 0, cam.width, cam.height)
      return
    }
    this.applyResults()
    const bucket = Math.floor(Math.log2(cam.mpp))
    const tileMpp = Math.pow(2, bucket)
    const tileWorld = TILE * tileMpp
    // Auf Retina-Displays im Nahbereich doppelt aufgelöste Kacheln rendern.
    const px = (window.devicePixelRatio || 1) > 1.3 && cam.mpp < 60 ? 512 : TILE
    const view = cam.viewRect()
    const tx0 = Math.max(0, Math.floor(view.x0 / tileWorld)), tx1 = Math.min(Math.ceil(WORLD_W / tileWorld) - 1, Math.floor(view.x1 / tileWorld))
    const ty0 = Math.max(0, Math.floor(view.y0 / tileWorld)), ty1 = Math.min(Math.ceil(WORLD_H / tileWorld) - 1, Math.floor(view.y1 / tileWorld))
    g.fillStyle = '#05080c'
    g.fillRect(0, 0, cam.width, cam.height)
    const scale = tileMpp / cam.mpp
    g.imageSmoothingEnabled = scale < 1
    const missing: Request[] = []
    const cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2
    this.wanted.clear()
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${bucket}:${tx}:${ty}:${px}`
        this.wanted.add(key)
        const tile = this.tiles.get(key)
        const [sx, sy] = cam.worldToScreen(tx * tileWorld, ty * tileWorld)
        const size = TILE * scale
        if (tile) {
          tile.lastUse = this.frame
          g.drawImage(tile.canvas, Math.floor(sx), Math.floor(sy), Math.ceil(size) + 1, Math.ceil(size) + 1)
          // Veraltete Kachel weiter zeigen, aber neu anfordern.
          if (this.dirty.has(key)) missing.push({ key, bucket, tx, ty, mpp: tileMpp, px, priority: (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy) + 1e6 })
        } else {
          this.drawFallback(g, bucket, tx, ty, Math.floor(sx), Math.floor(sy), Math.ceil(size) + 1)
          missing.push({ key, bucket, tx, ty, mpp: tileMpp, px, priority: (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy) })
        }
      }
    }
    if (missing.length) this.dispatch(missing)
    g.imageSmoothingEnabled = true
  }

  /** Ersatz aus gröberen (oder feineren) Kacheln, bis die passende Kachel fertig ist. */
  private findTile(bucket: number, tx: number, ty: number) {
    return this.tiles.get(`${bucket}:${tx}:${ty}:512`) ?? this.tiles.get(`${bucket}:${tx}:${ty}:256`)
  }

  private drawFallback(g: CanvasRenderingContext2D, bucket: number, tx: number, ty: number, sx: number, sy: number, size: number) {
    const other = this.findTile(bucket, tx, ty)
    if (other) { g.drawImage(other.canvas, sx, sy, size, size); return }
    for (let b = bucket + 1; b <= bucket + 6; b++) {
      const factor = Math.pow(2, b - bucket)
      const tile = this.findTile(b, Math.floor(tx / factor), Math.floor(ty / factor))
      if (!tile) continue
      const part = tile.canvas.width / factor
      const px = (tx % factor) * part, py = (ty % factor) * part
      g.drawImage(tile.canvas, px, py, part, part, sx, sy, size, size)
      return
    }
    // Feinere Kacheln (nach dem Herauszoomen) zusammensetzen.
    const fine = this.findTile(bucket - 1, tx * 2, ty * 2)
    if (fine) {
      const half = size / 2
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const t = this.findTile(bucket - 1, tx * 2 + dx, ty * 2 + dy)
        if (t) g.drawImage(t.canvas, sx + dx * half, sy + dy * half, half + 1, half + 1)
      }
      return
    }
    g.fillStyle = '#243026'
    g.fillRect(sx, sy, size, size)
  }

  private evict() {
    const entries = [...this.tiles.entries()].filter(([key]) => !this.wanted.has(key)).sort((a, b) => a[1].lastUse - b[1].lastUse)
    const remove = this.tiles.size - Math.floor(MAX_TILES * 0.75)
    for (let i = 0; i < Math.min(remove, entries.length); i++) { this.tiles.delete(entries[i][0]); this.dirty.delete(entries[i][0]) }
  }

  /** Miniaturkarte der Welt (720 x 360), wird einmalig im Worker gerendert. */
  minimapImage(): HTMLCanvasElement | undefined {
    if (this.minimap) return this.minimap
    if (!this.minimapRequested) {
      const i = this.workerReady.findIndex(Boolean)
      if (i >= 0) {
        this.minimapRequested = true
        this.workers[i].postMessage({ type: 'minimap', w: 720, h: 360 })
      }
    }
    return undefined
  }
}

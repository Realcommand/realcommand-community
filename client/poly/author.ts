import type { Model, Part, Shape, Motion } from './models.ts'
/** Shared primitive authoring for military and civilian silhouettes. */
export function modelAuthor() {
  const parts: Model = []
  const part = (shape: Shape, p: Part['p'], s: Part['s'], color = '#64726b', r: Part['r'] = [0, 0, 0], motion?: Motion) => parts.push({ shape, p, s, color, r, motion })
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color = '#64726b', motion?: Motion) => part('box', [x, y, z], [w, h, d], color, [0, 0, 0], motion)
  return { parts, part, box }
}

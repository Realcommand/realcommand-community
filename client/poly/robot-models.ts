import { modelAuthor } from './author.ts'
import type { Model } from './models.ts'

/** Three silhouettes, using the same instanced primitives and local animation. */
export function robotModel(id: string): Model | undefined {
  if (!['service_robot', 'robot_dog', 'recon_drone'].includes(id)) return
  const { parts, box, part } = modelAuthor()
  const shell = '#d7dfda', joint = '#27353a', sensor = '#50daca', safety = '#e6ad45'
  if (id === 'service_robot') {
    for (const [z, motion] of [[-.18, 'strideL'], [.18, 'strideR']] as const) {
      box(.1, .08, z, .35, .13, .22, joint, motion)
      box(0, .35, z, .15, .43, .17, shell, motion)
      part('cylinder', [0, .58, z], [.19, .18, .19], joint, [Math.PI / 2, 0, 0], motion)
      box(-.04, .8, z, .2, .35, .21, shell, motion)
      box(.02, 1.24, z * 2.4, .18, .34, .18, shell, motion)
      box(.14, 1.04, z * 2.4, .18, .22, .16, joint, motion)
    }
    box(0, .99, 0, .34, .14, .48, joint)
    box(0, 1.25, 0, .38, .45, .56, 'team')
    box(.2, 1.27, 0, .04, .2, .33, shell)
    box(-.22, 1.26, 0, .13, .3, .38, safety)
    box(0, 1.56, 0, .12, .12, .13, joint)
    box(.02, 1.73, 0, .3, .25, .32, shell)
    box(.178, 1.76, 0, .025, .08, .27, joint)
    box(.196, 1.76, 0, .014, .035, .18, sensor)
    box(.24, .96, .43, .13, .16, .2, safety)
  } else if (id === 'robot_dog') {
    box(0, .62, 0, .95, .24, .4, 'team')
    box(.43, .65, 0, .18, .19, .34, shell)
    box(.535, .68, 0, .035, .09, .26, joint)
    for (const z of [-.085, .085]) box(.556, .68, z, .018, .04, .045, sensor)
    box(-.12, .83, 0, .28, .19, .3, safety)
    part('cylinder', [-.12, .97, 0], [.19, .1, .19], joint)
    for (const x of [-.34, .34]) for (const z of [-.26, .26]) {
      const motion = x * z > 0 ? 'strideL' : 'strideR'
      part('cylinder', [x, .59, z], [.17, .13, .17], joint, [Math.PI / 2, 0, 0], motion)
      part('box', [x - .055, .4, z], [.12, .34, .12], shell, [0, 0, -.35], motion)
      part('box', [x - .04, .17, z], [.08, .26, .08], joint, [0, 0, .4], motion)
      box(x + .02, .04, z, .14, .07, .12, joint, motion)
    }
  } else {
    box(0, .33, 0, .57, .22, .42, 'team')
    box(-.05, .47, 0, .36, .12, .32, shell)
    for (const x of [-.61, .61]) for (const z of [-.61, .61]) {
      part('box', [x / 2, .33, z / 2], [.85, .08, .09], shell, [0, x * z > 0 ? -Math.PI / 4 : Math.PI / 4, 0])
      part('cylinder', [x, .4, z], [.13, .18, .13], joint)
      box(x, .515, z, .72, .025, .06, joint, 'rotor')
      box(x, .09, z, .06, .22, .06, joint)
      box(x, .37, z + Math.sign(z) * .075, .055, .04, .025, x > 0 ? sensor : safety)
    }
    part('rock', [.27, .18, 0], [.23, .21, .23], joint)
    box(.39, .18, 0, .02, .09, .13, sensor)
  }
  return parts
}

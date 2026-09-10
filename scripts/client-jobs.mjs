// Die Einstiegspunkte des Browser-Clients an einer Stelle. Der Build des
// Monorepos und der Build des öffentlichen UI-Repos lesen dieselbe Liste,
// damit ein neuer Einstiegspunkt nicht in einem der beiden fehlt.
export const clientEntryPoints = [
  ['client/main.ts', 'app.js'],
  ['client/terrain-worker.ts', 'terrain-worker.js'],
  ['client/poly/landscape-worker.ts', 'landscape-worker.js'],
  ['client/poly/preview.ts', 'engine-preview.js'],
  ['client/debug-bots.ts', 'debug-bots.js'],
]

/** esbuild-Aufträge für alle Client-Bündel. `prod` verkleinert und lässt die Quellkarte weg. */
export function clientJobs({ publicDir = 'public', prod = false } = {}) {
  return clientEntryPoints.map(([entry, out]) => ({
    entryPoints: [entry],
    bundle: true,
    outfile: `${publicDir}/${out}`,
    platform: 'browser',
    format: 'iife',
    target: ['es2022'],
    sourcemap: !prod,
    minify: prod,
    logLevel: 'info',
  }))
}

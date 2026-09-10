// Builds the browser bundles with esbuild. `--prod` minifies and drops the
// source map; `--watch` rebuilds while the development server runs.
import * as esbuild from 'esbuild'
import { existsSync, rmSync } from 'node:fs'
import { clientEntryPoints, clientJobs } from './client-jobs.mjs'

const watch = process.argv.includes('--watch')
const prod = process.argv.includes('--prod') || process.env.NODE_ENV === 'production'
const jobs = clientJobs({ prod })

// A source map left over from a development build would otherwise be served
// alongside a production bundle.
if (prod) for (const [, name] of clientEntryPoints) {
  const map = `public/${name}.map`
  if (existsSync(map)) { rmSync(map); console.log('removed', map) }
}

if (watch) {
  for (const options of jobs) await (await esbuild.context(options)).watch()
  console.log('esbuild: watching...')
} else {
  for (const options of jobs) await esbuild.build(options)
}

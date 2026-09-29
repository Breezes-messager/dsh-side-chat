#!/usr/bin/env node
/**
 * Install dsh-side-chat into one DeepSeek Harness profile.
 *
 * Three steps, all idempotent: link this checkout into the profile's
 * `node_modules`, declare it in the profile manifest, and add the Loader row to
 * the profile's patch layer. The Harness watches that patch file for live
 * profiles, but the browser half joins `window.__DSH_BOOT__` at page load, so a
 * window reload is still the last step.
 *
 * Usage: node scripts/install.mjs [--profile <name>] [--home <dir>] [--no-build]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-side-chat'
const ROW_ID = 'side-chat'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Read one `--flag value` pair. */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const profile = flag('--profile') ?? 'desktop'
const dshHome = resolve(flag('--home') ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const profileDir = join(dshHome, 'profiles', profile)
const skipBuild = process.argv.includes('--no-build')

if (!existsSync(join(profileDir, 'package.json'))) {
  console.error(`dsh-side-chat: no profile at ${profileDir}`)
  process.exit(1)
}

if (!skipBuild) {
  console.log('dsh-side-chat: building…')
  execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
}

for (const artifact of ['lib/index.js', 'lib/client.js']) {
  if (!existsSync(join(ROOT, artifact))) {
    console.error(`dsh-side-chat: ${artifact} is missing; run "pnpm build" first`)
    process.exit(1)
  }
}

console.log(`dsh-side-chat: linking into ${profileDir}`)
try {
  execFileSync('pnpm', ['add', `link:${ROOT}`], {
    cwd: profileDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} catch {
  console.warn('dsh-side-chat: pnpm could not link the package; add the dependency by hand')
}

const packagePath = join(profileDir, 'package.json')
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
manifest.dependencies = { ...(manifest.dependencies ?? {}), [PACKAGE_NAME]: `link:${ROOT}` }
writeFileSync(packagePath, `${JSON.stringify(manifest, undefined, 2)}\n`)
console.log(`dsh-side-chat: declared ${PACKAGE_NAME} in ${packagePath}`)

const patchPath = join(profileDir, 'cordis.patch.yml')
const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
if (patch.includes(`id: ${ROW_ID}`)) {
  console.log('dsh-side-chat: the Loader row is already present')
} else {
  const row = `${patch.endsWith('\n') ? '' : '\n'}\n- insert:\n    - id: ${ROW_ID}\n      name: ${PACKAGE_NAME}\n`
  writeFileSync(patchPath, patch + row)
  console.log(`dsh-side-chat: added the Loader row to ${patchPath}`)
}

console.log('\ndsh-side-chat: installed. Reload the Harness window to pick up the browser half.')

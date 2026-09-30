#!/usr/bin/env node
/**
 * Install dsh-side-chat-plugin into one DeepSeek Harness profile.
 *
 * This is the from-a-checkout path. Someone installing the published package
 * does not need it: the package ships a bundle patch (`dsh.bundle.patch`), so
 * the in-app plugin manager installs and enables it in one step. Use this script
 * when the plugin is not on a registry yet, or when developing it.
 *
 * Three steps, all idempotent: build the artifacts, link this checkout into the
 * profile's `node_modules`, and make the Loader load the plugin — either by
 * noting that the profile already selects it as a bundle, or by adding the row
 * to the profile's patch layer. The Harness watches that patch file for live
 * profiles, but the browser half joins `window.__DSH_BOOT__` at page load, so a
 * window reload is still the last step.
 *
 * Usage: node scripts/install.mjs [--profile <name>] [--home <dir>] [--no-build]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-side-chat-plugin'
const ROW_ID = 'dsh-side-chat-plugin'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Read one `--flag value` pair. */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/**
 * Parse a profile manifest.
 *
 * Editors on Windows happily save `package.json` with a UTF-8 BOM; npm tolerates
 * it but `JSON.parse` throws on it, so a profile created that way would make
 * this script fail before it wrote anything.
 */
function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

/** Fail with one actionable line instead of continuing into a half-install. */
function abort(message, hint) {
  console.error(`${PACKAGE_NAME}: ${message}`)
  if (hint !== undefined) console.error(`               ${hint}`)
  process.exit(1)
}

const dshHome = resolve(flag('--home') ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const profilesDir = join(dshHome, 'profiles')
const skipBuild = process.argv.includes('--no-build')

/** Profile directories that look like a profile: a package.json marks one. */
function profileNames() {
  try {
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(profilesDir, entry.name, 'package.json')))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/** Whether a profile already points at this checkout. */
function linksThisCheckout(dir) {
  const dependency = readManifest(join(dir, 'package.json')).dependencies?.[PACKAGE_NAME]
  if (typeof dependency !== 'string' || !dependency.startsWith('link:')) return false
  return resolve(dependency.slice('link:'.length)) === ROOT
}

/**
 * Pick the profile to install into: the explicit flag, then `$DSH_PROFILE`, then
 * the only profile, then the only one already linking this checkout.
 */
function pickProfile() {
  const explicit = flag('--profile') ?? process.env.DSH_PROFILE
  if (explicit !== undefined) return join(profilesDir, explicit)

  const names = profileNames()
  if (names.length === 1) return join(profilesDir, names[0])

  const linked = names.filter((name) => linksThisCheckout(join(profilesDir, name)))
  if (linked.length === 1) return join(profilesDir, linked[0])

  if (names.length === 0) {
    abort(`no profile under ${profilesDir}`,
      'pass --home <dir> and --profile <name>, or set DSH_HOME; the Harness creates a profile on first boot')
  }
  abort(`several profiles found under ${profilesDir}: ${names.join(', ')}`, 're-run with --profile <name> (or set DSH_PROFILE)')
}

const profileDir = pickProfile()
if (!existsSync(join(profileDir, 'package.json'))) {
  abort(`no profile at ${profileDir}`, `profiles found: ${profileNames().join(', ') || 'none'}`)
}

/**
 * The package manager, or undefined when it is not installed.
 *
 * `npm_execpath` is set when this script runs through a package manager, which
 * keeps the exact pnpm that invoked the script; otherwise the PATH is searched.
 * A Windows `.cmd` shim is never spawned through a shell: the pnpm entry point
 * beside it is used instead, which keeps argument quoting out of the picture.
 */
function findPnpm() {
  const execpath = process.env.npm_execpath
  if (execpath !== undefined && /pnpm/i.test(execpath) && existsSync(execpath)) {
    return { command: process.execPath, prefix: [execpath] }
  }
  const pathExt = (process.env.PATHEXT ?? '.CMD;.EXE;.BAT').split(';')
  const names = process.platform === 'win32'
    ? pathExt.flatMap((ext) => [`pnpm${ext.toLowerCase()}`, `pnpm${ext.toUpperCase()}`])
    : ['pnpm']
  for (const dir of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (dir.length === 0) continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (!existsSync(candidate)) continue
      if (/\.(cmd|bat)$/i.test(candidate)) {
        const entry = join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
        if (existsSync(entry)) return { command: process.execPath, prefix: [entry] }
        // Last resort: the shim itself, through the command processor that
        // knows how to run it. Never `shell: true`, which Node deprecates with
        // arguments and which would quote them for us unpredictably.
        return {
          command: process.env.ComSpec ?? 'cmd.exe',
          prefix: ['/d', '/s', '/c'],
          shim: `"${candidate}"`,
        }
      }
      return { command: candidate, prefix: [] }
    }
  }
  return undefined
}

/** Quote one argument for a `cmd.exe` command line. */
function quoteForCmd(value) {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Run one package-manager command with the terminal attached. */
function run(pnpm, args, cwd) {
  const argv = pnpm.shim === undefined
    ? [...pnpm.prefix, ...args]
    : [...pnpm.prefix, `${pnpm.shim} ${args.map(quoteForCmd).join(' ')}`]
  return execFileSync(pnpm.command, argv, { cwd, stdio: 'inherit' })
}

// ------------------------------------------------------------------ 1. build

if (!skipBuild) {
  console.log(`${PACKAGE_NAME}: building…`)
  try {
    // The local build tool, not a global one: this works under pnpm, npm and
    // a bare `node scripts/install.mjs`.
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } catch {
    abort('the build failed', `run "pnpm install" in ${ROOT} first, or pass --no-build`)
  }
}

for (const artifact of ['lib/index.js', 'lib/client.js']) {
  if (!existsSync(join(ROOT, artifact))) {
    abort(`${artifact} is missing`, `run "pnpm build" in ${ROOT} first, or drop --no-build`)
  }
}

// ------------------------------------------------------------ 2. link + declare

const pnpm = findPnpm()
if (pnpm === undefined) {
  abort('pnpm was not found on PATH, so the package cannot be linked into the profile',
    `install pnpm (https://pnpm.io/installation), or run it yourself: cd "${profileDir}" && pnpm add "link:${ROOT}"`)
}

console.log(`${PACKAGE_NAME}: linking into ${profileDir}`)
try {
  run(pnpm, ['add', `link:${ROOT}`], profileDir)
} catch {
  abort(`pnpm could not link the package into ${profileDir}`,
    `run it yourself to see the error: cd "${profileDir}" && pnpm add "link:${ROOT}"`)
}

const packagePath = join(profileDir, 'package.json')
const manifest = readManifest(packagePath)
manifest.dependencies = { ...(manifest.dependencies ?? {}), [PACKAGE_NAME]: `link:${ROOT}` }
writeFileSync(packagePath, `${JSON.stringify(manifest, undefined, 2)}\n`)
console.log(`${PACKAGE_NAME}: declared ${PACKAGE_NAME} in ${packagePath}`)

// ------------------------------------------------- 3. make the Loader load it

// A pre-rename profile still carries `- id: side-chat / name: dsh-side-chat`.
// That row loads nothing now (the old package name is not installed here), and
// the npm package that *does* own `dsh-side-chat` inserts the same id — two rows
// sharing one id in a profile crash on load. Removing it here, before adding the
// current row, is what keeps a migrated profile from ending up with both.
const LEGACY_ROW_ID = 'side-chat'
const LEGACY_NAME = 'dsh-side-chat'
{
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const lines = patch.split('\n')
  const isLegacyRow = (index) =>
    new RegExp(`^\\s*-?\\s*id:\\s*${LEGACY_ROW_ID}\\s*$`).test(lines[index] ?? '')
    && new RegExp(`${LEGACY_NAME}\\s*$`).test(lines[index + 1] ?? '')
  const removedAt = new Set()
  const removedHeaders = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    if (!isLegacyRow(index)) continue
    removedAt.add(index)
    removedAt.add(index + 1)
    // Drop the `- insert:` header only when this row was the last child of its
    // block. Tearing the header off a block that still has other rows would
    // leave them indented under nothing — YAML rejects that, so the profile
    // would stop loading. Measured: taking the header with the first of two rows
    // produced exactly that.
    let header = index - 1
    while (header >= 0 && (lines[header] ?? '').trim() === '') header -= 1
    if (!/^\s*-?\s*insert:\s*$/.test(lines[header] ?? '')) continue
    const indent = (lines[header] ?? '').length - (lines[header] ?? '').trimStart().length
    let hasSibling = false
    for (let probe = header + 1; probe < lines.length; probe += 1) {
      const text = lines[probe] ?? ''
      if (text.trim() === '') continue
      const probeIndent = text.length - text.trimStart().length
      // A row at column 0 starts the next root entry, so the block has ended.
      if (probeIndent <= indent) break
      if (/^\s*-\s*(id|insert):/.test(text) && !removedAt.has(probe)) { hasSibling = true; break }
    }
    if (!hasSibling) removedHeaders.add(header)
  }
  if (removedAt.size > 0) {
    const kept = lines.filter((_, index) => !removedAt.has(index) && !removedHeaders.has(index))
    writeFileSync(patchPath, kept.join('\n').replace(/\n{3,}/g, '\n\n'))
    console.log(`${PACKAGE_NAME}: removed ${removedAt.size / 2} leftover ${LEGACY_NAME} Loader row(s) from ${patchPath}`)
  }
}

if (Array.isArray(manifest.dsh?.profile?.bundles) && manifest.dsh.profile.bundles.includes(PACKAGE_NAME)) {
  console.log(`${PACKAGE_NAME}: the profile selects this package as a bundle; its rows come from the bundle patch`)
} else {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const row = `- insert:\n    - id: ${ROW_ID}\n      name: ${PACKAGE_NAME}\n`
  // A freshly initialized profile's patch is the literal empty root `[]`; a
  // second YAML root node after it would make the whole file unparseable, so
  // that placeholder is replaced rather than appended to.
  const emptyRoot = /^[ \t]*\[[ \t]*\][ \t]*$/m
  if (new RegExp(`^\\s*-?\\s*id:\\s*${ROW_ID}\\s*$`, 'm').test(patch)) {
    console.log(`${PACKAGE_NAME}: the Loader row is already present`)
  } else if (emptyRoot.test(patch)) {
    writeFileSync(patchPath, patch.replace(emptyRoot, row).replace(/\n{3,}/g, '\n\n'))
    console.log(`${PACKAGE_NAME}: replaced the empty patch root in ${patchPath} with the Loader row`)
  } else {
    // Append, never replace: this file holds the user's own overrides (an API
    // key reference, a model pin, a permission preset) and losing them would be
    // silent and unrecoverable.
    writeFileSync(patchPath, `${patch}${patch.endsWith('\n') ? '' : '\n'}\n${row}`)
    console.log(`${PACKAGE_NAME}: added the Loader row to ${patchPath}`)
  }
  // Whatever branch ran, the patch must still contain everything it started with.
  const written = readFileSync(patchPath, 'utf8')
  if (!written.startsWith(patch) && !emptyRoot.test(patch)) {
    console.error(`${PACKAGE_NAME}: refused to finish — ${patchPath} would have lost existing content`)
    process.exit(1)
  }
}

console.log(`\n${PACKAGE_NAME}: installed. Reload the Harness window to pick up the browser half.`)
console.log(`${PACKAGE_NAME}: check the result any time with "node ${join(ROOT, 'scripts', 'verify.mjs')}"`)

// A running Harness keeps the Host half it booted with: plugin *code* is not
// hot-reloaded, so a fresh install only shows up after a restart. Saying so now
// beats a user wondering why nothing changed. The check is a single loopback
// connect and never fails the install.
{
  const port = Number(process.env.DSH_PORT ?? 19387)
  const running = await new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.setTimeout(500, () => { socket.destroy(); resolve(false) })
  })
  if (running) {
    console.log(`${PACKAGE_NAME}: a Harness appears to be listening on 127.0.0.1:${port} — restart it`
      + ' (and reload the window) so the new Host half is the one that loads.')
  }
}

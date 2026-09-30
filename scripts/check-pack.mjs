#!/usr/bin/env node
/**
 * Check one packed tarball without installing it.
 *
 * The published file list is a contract: too few files and the plugin cannot
 * load, too many and the download carries things nobody needs. This script
 * unpacks a `.tgz` in memory, compares its exact file list against the list
 * below, and then proves the two halves are what DeepSeek Harness expects — the
 * Node half imports as an ES module, and the browser half registers through
 * `window.__ModuleLoader__.load()` with the package name as its id.
 *
 * Zero dependencies: gzip comes from `node:zlib`, and the small tar reader lives
 * here because the published archive is written by npm/pnpm as plain ustar.
 *
 * Usage:
 *   node scripts/check-pack.mjs [<tarball>] [--verbose]
 *
 * With no argument the newest `dsh-side-chat-plugin-*.tgz` next to the repository
 * root is used. Exit code 0 means every check passed, 1 means something failed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const PACKAGE_NAME = 'dsh-side-chat-plugin'
/**
 * The Loader row id the bundle patch inserts.
 *
 * Deliberately the package name: the unrelated npm package `dsh-side-chat`
 * (someone else's plugin) already inserts `id: side-chat`, and two rows sharing
 * one id inside a profile register twice and crash. Keeping id equal to the
 * package name is also what the client module table needs — it attaches a
 * package's browser half to the row whose specifier is exactly the package name.
 */
const ROW_ID = PACKAGE_NAME
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VERBOSE = process.argv.includes('--verbose')

/**
 * Every file the tarball must carry, and nothing else.
 *
 * README.md, README.zh.md, LICENSE and package.json are added by the packer
 * itself; the rest is the `files` whitelist plus the two artifacts the browser
 * half needs at runtime: its source map and the user-facing self-check.
 */
const EXPECTED = [
  'package/LICENSE',
  'package/README.md',
  'package/README.zh.md',
  'package/cordis.patch.yml',
  'package/icon.svg',
  'package/lib/client.js',
  'package/lib/client.js.map',
  'package/lib/index.d.ts',
  'package/lib/index.js',
  'package/lib/protocol.d.ts',
  'package/lib/protocol.js',
  'package/locale/en.json',
  'package/locale/zh.json',
  'package/package.json',
  'package/scripts/verify.mjs',
].sort()

const failures = []
const notes = []
function check(ok, message) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
  if (!ok) failures.push(message)
}
function note(message) {
  notes.push(message)
  if (VERBOSE) console.log(`      ${message}`)
}

/** NUL-terminated UTF-8 field out of a tar header. */
function field(block, start, end) {
  const slice = block.subarray(start, end)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul < 0 ? slice.length : nul).toString('utf8')
}

/** Read a plain ustar archive into [{ path, data }]. */
function readTar(buffer) {
  const entries = []
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512)
    const name = field(header, 0, 100)
    if (name === '') break
    const size = parseInt(field(header, 124, 136).trim() || '0', 8)
    const type = field(header, 156, 157)
    const prefix = field(header, 345, 500)
    const path = prefix === '' ? name : `${prefix}/${name}`
    const dataStart = offset + 512
    // 'x'/'g' are pax metadata entries: npm does not emit them for these short
    // paths, and skipping them keeps the comparison about real files.
    if (type !== 'x' && type !== 'g' && type !== '5') {
      entries.push({ path, data: buffer.subarray(dataStart, dataStart + size) })
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

// ------------------------------------------------------------------- the input

const argument = process.argv.slice(2).find((value) => !value.startsWith('--'))
let tarball = argument
if (tarball === undefined) {
  // A fresh `pnpm pack` lands in the repository root; the committed release
  // artifact lives in `dist/`. Prefer the newest of the two, so checking right
  // after packing validates what was just built.
  const candidates = [ROOT, join(ROOT, 'dist')].flatMap((directory) => {
    try {
      return readdirSync(directory)
        .filter((name) => name.startsWith(`${PACKAGE_NAME}-`) && name.endsWith('.tgz'))
        .map((name) => join(directory, name))
    } catch {
      return []
    }
  }).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
  if (candidates.length === 0) {
    console.error(`${PACKAGE_NAME}: no tarball given and none found in the repository root or dist/`)
    console.error('               build one with: pnpm pack')
    process.exit(1)
  }
  tarball = candidates[candidates.length - 1]
}
if (!existsSync(tarball)) {
  console.error(`${PACKAGE_NAME}: no such tarball: ${tarball}`)
  process.exit(1)
}
console.log(`${PACKAGE_NAME}: checking ${tarball} (${statSync(tarball).size} bytes)\n`)

const entries = readTar(gunzipSync(await readFile(tarball)))
const paths = entries.map((entry) => entry.path).sort()
const files = new Map(entries.map((entry) => [entry.path, entry.data]))

// ------------------------------------------------------------------ 1. file list

const missing = EXPECTED.filter((path) => !files.has(path))
const extra = paths.filter((path) => !EXPECTED.includes(path))
check(missing.length === 0 && extra.length === 0,
  `tarball carries exactly the ${EXPECTED.length} expected files`)
if (missing.length > 0) note(`missing: ${missing.join(', ')}`)
if (extra.length > 0) note(`unexpected: ${extra.join(', ')}`)

// ------------------------------------------------------------- 2. Node-half import

const scratch = mkdtempSync(join(tmpdir(), 'dsh-side-chat-plugin-pack-'))
try {
  for (const [path, data] of files) {
    const target = join(scratch, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
  const packageDir = join(scratch, 'package')
  // Bare specifiers of a future Host half resolve against the checkout's own
  // node_modules, exactly as they would inside a profile.
  if (existsSync(join(ROOT, 'node_modules'))) {
    try {
      symlinkSync(join(ROOT, 'node_modules'), join(scratch, 'node_modules'), 'junction')
    } catch {
      note('could not link node_modules into the scratch directory; bare imports would fail')
    }
  }

  const host = await import(pathToFileURL(join(packageDir, 'lib/index.js')).href)
  check(typeof host.apply === 'function' && host.name !== undefined,
    `lib/index.js imports as ESM and exports apply()${host.name === undefined ? '' : ` (name="${host.name}")`}`)

  // ---------------------------------------------------- 3. browser-half shape

  const clientSource = files.get('package/lib/client.js').toString('utf8')
  let registered
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (row) => { registered = row } } }
  try {
    new Function(clientSource)()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  check(registered?.id === PACKAGE_NAME && typeof registered?.factory === 'function',
    `lib/client.js registers id "${registered?.id}" with a factory function`)
  check(/\/\/# sourceMappingURL=client\.js\.map\s*$/.test(clientSource) && files.has('package/lib/client.js.map'),
    'the browser half keeps its source-map reference and the map ships with it')

  // ------------------------------------------------------- 4. bundle + manifest

  const patch = files.get('package/cordis.patch.yml').toString('utf8')
  check(new RegExp(`^\\s*-?\\s*id:\\s*${ROW_ID}\\s*$`, 'm').test(patch)
    && new RegExp(`^\\s*-?\\s*name:\\s*${PACKAGE_NAME}\\s*$`, 'm').test(patch),
    `cordis.patch.yml inserts the row id=${ROW_ID} name=${PACKAGE_NAME}`)

  // Some editors save JSON with a UTF-8 BOM; npm tolerates it, `JSON.parse`
  // does not, so strip it before judging the manifest.
  const parseJson = (buffer) => JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''))
  const packed = parseJson(files.get('package/package.json'))
  check(packed.dsh?.bundle?.patch !== undefined, 'package.json declares dsh.bundle.patch (in-app installable)')
  check(packed.dsh?.client?.platform === 'web', 'package.json declares dsh.client.platform=web')

  const declared = typeof packed.icon === 'string' && files.has(join('package', packed.icon).replace(/\\/g, '/'))
  check(declared, `package.json icon "${packed.icon}" ships in the tarball`)
  if (typeof packed.icon === 'string' && files.has(join('package', packed.icon).replace(/\\/g, '/'))) {
    check(files.get(`package/${packed.icon.replace(/^\.\//, '')}`).length <= 256 * 1024, 'icon is inside the 256 KiB limit')
  }

  for (const [subpath, record] of Object.entries(packed.exports ?? {})) {
    if (subpath.includes('*') || subpath === './package.json') continue
    const target = typeof record === 'string' ? record : record.default
    const types = typeof record === 'string' ? undefined : record.types
    check(files.has(join('package', target).replace(/\\/g, '/')), `exports["${subpath}"] -> ${target} exists`)
    if (types !== undefined) {
      check(files.has(join('package', types).replace(/\\/g, '/')), `exports["${subpath}"].types -> ${types} exists`)
    }
  }
  // Zero runtime dependencies is the invariant, not merely "Harness-provided".
  // Everything the Host half needs at run time — including Schemastery for the
  // Config schema — is inlined into `lib/index.js`, and the browser half resolves
  // React from the shell's module table. A declared dependency would be installed
  // into someone's profile and would have to be fetched from a registry, which
  // breaks installing this tarball on a machine with no network. Measured: adding
  // `@deepseek-ai/schemastery` to `dependencies` made `pnpm install --offline`
  // fail with ERR_PNPM_NO_OFFLINE_META, while the built artifact imports nothing
  // external either way — so the declaration bought nothing and cost the offline
  // path. Keep this check strict.
  const runtime = Object.keys(packed.dependencies ?? {})
  check(runtime.length === 0, `no runtime dependencies${runtime.length === 0 ? '' : ` (found ${runtime.join(', ')})`}`)
  if (runtime.length > 0) note(`remove these from dependencies and inline them instead: ${runtime.join(', ')}`)


  // ------------------------------------------------------------ 5. metadata

  for (const language of ['en', 'zh']) {
    const locale = parseJson(files.get(`package/locale/${language}.json`))
    check(typeof locale.meta?.title === 'string' && typeof locale.meta?.description === 'string',
      `locale/${language}.json carries meta.title and meta.description`)
  }

  try {
    execFileSync(process.execPath, ['--check', join(packageDir, 'scripts/verify.mjs')], { stdio: 'inherit' })
    check(true, 'scripts/verify.mjs parses as an ES module')
  } catch {
    check(false, 'scripts/verify.mjs parses as an ES module')
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log('')
if (failures.length === 0) {
  console.log(`${PACKAGE_NAME}: packed tarball is good (${EXPECTED.length} files).`)
  process.exit(0)
}
console.log(`${PACKAGE_NAME}: ${failures.length} pack check${failures.length === 1 ? '' : 's'} failed.`)
process.exit(1)

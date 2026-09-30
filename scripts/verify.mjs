#!/usr/bin/env node
/**
 * dsh-side-chat-plugin self-check.
 *
 * Answers one question for someone who just installed this plugin: is it really
 * wired up? It reads the pieces that have to agree — this package's build
 * artifacts and manifest, the bundle patch that declares the Loader row, the
 * DeepSeek Harness profile that is supposed to load it — and, when a Harness web
 * port answers, asks that port whether the Side chat route exists.
 *
 * Zero dependencies, cross-platform, no writes anywhere: safe to run against a
 * live installation.
 *
 * Usage:
 *   node scripts/verify.mjs [--profile <name>] [--home <dir>] [--port <number>]
 *                           [--json] [--quiet]
 *
 * Exit codes:
 *   0  every required check passed (warnings are still printed)
 *   1  at least one required check failed
 *   2  bad usage
 *
 * The package directory is derived from this file's own location, never from the
 * current working directory, so the same script works from a source checkout
 * (`node scripts/verify.mjs`) and from an installed package
 * (`node <profile>/node_modules/dsh-side-chat-plugin/scripts/verify.mjs`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE_NAME = 'dsh-side-chat-plugin'
const ROW_ID = 'dsh-side-chat-plugin'
const FALLBACK_ROUTE = '/side-chat/ask'
/** Ports a local Harness web surface commonly listens on. */
const PORT_CANDIDATES = [19387, 3000, 5173, 8080]

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const args = process.argv.slice(2)
const json = args.includes('--json')
const quiet = args.includes('--quiet')

/** Read one `--flag value` pair. */
function flag(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

for (const known of ['--profile', '--home', '--port']) {
  if (args.includes(known) && (flag(known) === undefined || flag(known).startsWith('--'))) {
    console.error(`${PACKAGE_NAME}: ${known} needs a value`)
    process.exit(2)
  }
}
const portFlag = flag('--port')
if (portFlag !== undefined && !/^\d+$/.test(portFlag)) {
  console.error(`${PACKAGE_NAME}: --port must be a number, got "${portFlag}"`)
  process.exit(2)
}

const results = []
/** Record one check. `level` is 'pass', 'warn' or 'fail'. */
function record(level, area, message) {
  results.push({ level, area, message })
  if (json || quiet) return
  const mark = level === 'pass' ? 'ok  ' : level === 'warn' ? 'warn' : 'FAIL'
  console.log(`${mark}  ${area.padEnd(9)}  ${message}`)
}

/** Read JSON, or undefined when the file is absent or malformed. */
function readJson(path) {
  try {
    // Editors may save a UTF-8 BOM; npm tolerates it, `JSON.parse` does not.
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return undefined
  }
}

/** Read text, or '' when the file is absent. */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- package side

const manifestPath = join(ROOT, 'package.json')
const manifest = readJson(manifestPath)
if (manifest === undefined) {
  record('fail', 'package', `no readable package.json at ${manifestPath}`)
}

const requiredArtifacts = ['lib/index.js', 'lib/protocol.js', 'lib/client.js']
const optionalArtifacts = ['lib/index.d.ts', 'lib/protocol.d.ts', 'lib/client.js.map']
const missingRequired = requiredArtifacts.filter((file) => !existsSync(join(ROOT, file)))
if (missingRequired.length === 0) {
  record('pass', 'package', `build artifacts present in ${ROOT}`)
} else {
  record('fail', 'package', `missing ${missingRequired.join(', ')} — run "pnpm build" (or reinstall the published package)`)
}
const missingOptional = optionalArtifacts.filter((file) => !existsSync(join(ROOT, file)))
if (missingOptional.length > 0) {
  record('warn', 'package', `missing ${missingOptional.join(', ')} (types or debug source map)`)
}

if (manifest !== undefined) {
  if (manifest.name === PACKAGE_NAME) {
    record('pass', 'manifest', `name ${manifest.name}@${manifest.version ?? '?'}`)
  } else {
    record('fail', 'manifest', `package name is "${manifest.name}", expected "${PACKAGE_NAME}"`)
  }

  const client = manifest.dsh?.client
  if (client?.platform === 'web') {
    const inject = Array.isArray(client.inject) ? client.inject : []
    record('pass', 'manifest', `dsh.client.platform=web, inject=[${inject.join(', ')}]`)
  } else {
    record('fail', 'manifest', `dsh.client.platform must be "web", found ${JSON.stringify(client?.platform)}`)
  }

  const bundle = manifest.dsh?.bundle?.patch
  const patches = typeof bundle === 'string' ? [bundle] : Array.isArray(bundle) ? bundle : []
  if (patches.length === 0) {
    record('fail', 'manifest', 'no dsh.bundle.patch: the in-app plugin manager refuses a package without it ("not-bundle")')
  } else {
    const absent = patches.filter((patch) => !existsSync(resolve(ROOT, patch)))
    if (absent.length === 0) {
      record('pass', 'manifest', `dsh.bundle.patch -> ${patches.join(', ')}`)
    } else {
      record('fail', 'manifest', `dsh.bundle.patch names a missing file: ${absent.join(', ')}`)
    }
  }

  const clientExport = manifest.exports?.['./client']
  const clientTarget = typeof clientExport === 'string' ? clientExport : clientExport?.default
  if (clientTarget !== undefined && existsSync(resolve(ROOT, clientTarget))) {
    record('pass', 'manifest', `exports["./client"] -> ${clientTarget}`)
  } else {
    record('fail', 'manifest', 'exports["./client"] must resolve to the built browser bundle')
  }

  if (manifest.icon !== undefined) {
    const iconPath = resolve(ROOT, manifest.icon)
    if (!existsSync(iconPath)) {
      record('fail', 'manifest', `icon "${manifest.icon}" does not exist`)
    } else if (statSync(iconPath).size > 256 * 1024) {
      record('fail', 'manifest', `icon "${manifest.icon}" is larger than the 256 KiB limit`)
    } else {
      record('pass', 'manifest', `icon ${manifest.icon}`)
    }
  }
}

// The browser bundle must be the closure factory `window.__ModuleLoader__`
// accepts; a plain ESM output would silently never register.
const clientBundlePath = join(ROOT, 'lib/client.js')
if (existsSync(clientBundlePath)) {
  const head = readText(clientBundlePath).slice(0, 400)
  if (head.includes('window.__ModuleLoader__.load(') && head.includes(PACKAGE_NAME)) {
    record('pass', 'client', 'lib/client.js is a window.__ModuleLoader__ closure factory')
  } else {
    record('fail', 'client', 'lib/client.js does not register through window.__ModuleLoader__.load()')
  }
}

// ----------------------------------------------------------------- bundle row

for (const patch of manifest?.dsh?.bundle?.patch !== undefined
  ? (typeof manifest.dsh.bundle.patch === 'string' ? [manifest.dsh.bundle.patch] : manifest.dsh.bundle.patch)
  : []) {
  const body = readText(resolve(ROOT, patch))
  const namesPackage = new RegExp(`^\\s*-?\\s*name:\\s*['"]?${PACKAGE_NAME}['"]?\\s*$`, 'm').test(body)
  const hasRowId = new RegExp(`^\\s*-?\\s*id:\\s*['"]?${ROW_ID}['"]?\\s*$`, 'm').test(body)
  if (namesPackage && hasRowId) {
    record('pass', 'bundle', `${patch} inserts row ${ROW_ID} -> ${PACKAGE_NAME}`)
  } else {
    record('fail', 'bundle', `${patch} must insert a row with id ${ROW_ID} and the bare name ${PACKAGE_NAME}`)
  }
}

// --------------------------------------------------------------- profile side

const dshHome = resolve(flag('--home') ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const profilesDir = join(dshHome, 'profiles')
const explicitProfile = flag('--profile') ?? process.env.DSH_PROFILE

/** All profile directories that look like a profile (a package.json marks one). */
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

/** Whether one profile mentions this plugin at all. */
function mentionsPlugin(dir) {
  if (existsSync(join(dir, 'node_modules', PACKAGE_NAME))) return true
  const pkg = readJson(join(dir, 'package.json'))
  if (pkg?.dependencies?.[PACKAGE_NAME] !== undefined) return true
  if (Array.isArray(pkg?.dsh?.profile?.bundles) && pkg.dsh.profile.bundles.includes(PACKAGE_NAME)) return true
  return new RegExp(`^\\s*-?\\s*name:\\s*['"]?${PACKAGE_NAME}['"]?\\s*$`, 'm').test(readText(join(dir, 'cordis.patch.yml')))
}

let profileDir
if (explicitProfile !== undefined) {
  profileDir = join(profilesDir, explicitProfile)
} else {
  const names = profileNames()
  const matching = names.filter((name) => mentionsPlugin(join(profilesDir, name)))
  if (matching.length === 1) profileDir = join(profilesDir, matching[0])
  else if (names.length === 1) profileDir = join(profilesDir, names[0])
  else if (matching.length > 1) {
    record('warn', 'profile', `several profiles use this plugin (${matching.join(', ')}); re-run with --profile <name>`)
  } else if (names.length > 1) {
    record('warn', 'profile', `several profiles exist (${names.join(', ')}); re-run with --profile <name>`)
  }
}

if (profileDir === undefined) {
  record('fail', 'profile', `not installed anywhere under ${profilesDir} — install it from the Plugins page, or run "node ${join(ROOT, 'scripts', 'install.mjs')}" from a checkout`)
} else if (!existsSync(join(profileDir, 'package.json'))) {
  record('fail', 'profile', `no profile at ${profileDir} (set DSH_HOME or pass --home)`)
} else {
  const profilePkg = readJson(join(profileDir, 'package.json'))
  const bundleSelected = Array.isArray(profilePkg?.dsh?.profile?.bundles)
    && profilePkg.dsh.profile.bundles.includes(PACKAGE_NAME)
  const manualRow = new RegExp(`^\\s*-?\\s*name:\\s*['"]?${PACKAGE_NAME}['"]?\\s*$`, 'm')
    .test(readText(join(profileDir, 'cordis.patch.yml')))

  if (bundleSelected) {
    record('pass', 'profile', `${profileDir} selects ${PACKAGE_NAME} in dsh.profile.bundles`)
  } else if (manualRow) {
    record('pass', 'profile', `${profileDir} enables the Loader row from its own cordis.patch.yml`)
  } else {
    // The two ways to wire this plugin are "select the bundle" and "declare the
    // row by hand". A profile that renamed the dependency but did neither is the
    // trap this message exists for: the plugin is installed and simply never
    // loads, with no error anywhere.
    record('fail', 'profile',
      `${profileDir} neither selects ${PACKAGE_NAME} in dsh.profile.bundles nor declares its Loader row.`
      + ' A bundle\'s patch layer only applies while the profile lists the package name,'
      + ` so add "${PACKAGE_NAME}" to dsh.profile.bundles in ${join(profileDir, 'package.json')}.`)
  }

  const installedDir = join(profileDir, 'node_modules', PACKAGE_NAME)
  if (!existsSync(installedDir)) {
    record('fail', 'profile', `${installedDir} is missing — the profile names the package but nothing is installed there`)
  } else {
    const installedManifest = readJson(join(installedDir, 'package.json'))
    const needed = ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']
    const absent = needed.filter((file) => !existsSync(join(installedDir, file)))
    if (absent.length > 0) {
      record('fail', 'installed', `${installedDir} is missing ${absent.join(', ')}; reinstall the package`)
    } else {
      record('pass', 'installed', `${installedDir} carries the Host half, the browser half and its bundle patch`)
    }
    if (manifest !== undefined && installedManifest?.version !== undefined && installedManifest.version !== manifest.version) {
      record('warn', 'installed', `installed version ${installedManifest.version} differs from this package ${manifest.version}`)
    }
  }
}

// ---------------------------------------------------------------- route probe

/** One HTTP request; resolves undefined when the port does not answer. */
function probe(port, path, method = 'GET', timeoutMs = 1500, body) {
  return new Promise((done) => {
    const headers = body === undefined ? {} : { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body) }
    const req = request({ host: '127.0.0.1', port, path, method, headers, timeout: timeoutMs }, (res) => {
      res.resume()
      done({ status: res.statusCode ?? 0 })
    })
    req.on('timeout', () => { req.destroy(); done(undefined) })
    req.on('error', () => done(undefined))
    req.end(body)
  })
}

/**
 * Statuses that prove the route exists and this plugin answered: acceptance,
 * a malformed request, the Host's trust check, a method refusal, or an
 * unsupported media type. 404 is the only status that means "not mounted".
 */
const MOUNTED = [200, 400, 401, 403, 405, 413, 415]

/** Why one status answers the question, for the printed line. */
function explain(status) {
  if (status === 405) return 'the plugin refused the method'
  // Either the Host's own trust check or the plugin's trust policy can refuse a
  // probe: `same-origin` (the default) also answers 401/403 to a request the
  // Host rejects. Say so rather than blaming one of the two.
  if (status === 401 || status === 403) {
    return 'mounted, refused — by the Host trust check or by the plugin\'s own trust policy'
  }
  if (status === 415 || status === 400 || status === 413) return 'the plugin rejected the probe body without calling a model'
  return 'the plugin answered'
}

const route = existsSync(join(ROOT, 'lib/protocol.js'))
  ? (await import(pathToFileURL(join(ROOT, 'lib/protocol.js')).href)).SIDE_CHAT_ROUTE ?? FALLBACK_ROUTE
  : FALLBACK_ROUTE

const explicitPort = portFlag !== undefined ? Number(portFlag) : undefined
const candidates = explicitPort !== undefined
  ? [explicitPort]
  : (process.env.DSH_WEB_PORT !== undefined && /^\d+$/.test(process.env.DSH_WEB_PORT)
    ? [Number(process.env.DSH_WEB_PORT), ...PORT_CANDIDATES.filter((port) => port !== Number(process.env.DSH_WEB_PORT))]
    : PORT_CANDIDATES)

let answered
for (const port of candidates) {
  const root = await probe(port, '/')
  if (root !== undefined) { answered = port; break }
}

if (answered === undefined) {
  record('warn', 'route', `no Harness web port answered on ${candidates.join(', ')}; pass --port <n> to probe a different one`)
} else {
  const base = `http://127.0.0.1:${answered}${route}`
  const judge = (method, status) => {
    if (MOUNTED.includes(status)) {
      record('pass', 'route', `${method} ${base} returned ${status} — ${explain(status)}`)
    } else {
      record('warn', 'route', `${method} ${base} returned ${status}; the route is present but answered unexpectedly`)
    }
  }
  const viaGet = await probe(answered, route, 'GET')
  if (viaGet === undefined) {
    record('warn', 'route', `port ${answered} stopped answering during the probe`)
  } else if (viaGet.status !== 404) {
    judge('GET', viaGet.status)
  } else {
    // A carrier that registers only the POST route can 404 a GET. One
    // text/plain POST separates "not mounted" from "mounted under another
    // method" without reaching a model: the plugin rejects a non-JSON body.
    const viaPost = await probe(answered, route, 'POST', 1500, 'probe')
    if (viaPost === undefined) {
      record('warn', 'route', `port ${answered} stopped answering during the probe`)
    } else if (viaPost.status === 404) {
      record('fail', 'route', `GET and POST ${base} both returned 404 — the Host half is not loaded in this profile`)
    } else {
      judge('POST', viaPost.status)
    }
  }
}

// -------------------------------------------------------------------- summary

const failures = results.filter((entry) => entry.level === 'fail')
const warnings = results.filter((entry) => entry.level === 'warn')

if (json) {
  console.log(JSON.stringify({ root: ROOT, dshHome, profile: profileDir, results, failures: failures.length, warnings: warnings.length }, undefined, 2))
} else {
  console.log('')
  if (failures.length === 0) {
    console.log(`${PACKAGE_NAME}: all required checks passed${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}.`)
  } else {
    console.log(`${PACKAGE_NAME}: ${failures.length} check${failures.length === 1 ? '' : 's'} failed.`)
    for (const failure of failures) console.log(`  - ${failure.area}: ${failure.message}`)
    console.log('Reload the Harness window after fixing the wiring; the Plugins page shows the bundle and its rows.')
  }
}

process.exit(failures.length === 0 ? 0 : 1)

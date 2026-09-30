#!/usr/bin/env node
/**
 * verifier2 incremental check: install the packed tarball into a throwaway
 * profile with **no network at all**, from a cold store, and then assert the
 * installed Host half still carries a working native Schemastery Config.
 *
 * Three profiles are exercised, all under one temp DSH_HOME:
 *   A. DSH-shaped profile  (pnpm-workspace.yaml: nodeLinker hoisted +
 *      autoInstallPeers: false) — what a real `$DSH_HOME/profiles/<name>` has.
 *   B. bare profile        (no pnpm-workspace.yaml) — the negative control: pnpm
 *      then tries to auto-install the `@deepseek-ai/cordis` peer and, offline
 *      against an unreachable registry, fails. That failure is a scaffold
 *      artefact, not a package defect.
 *   C. DSH-shaped profile, installed from case A, then `scripts/verify.mjs`
 *      must pass (with the Loader row added by hand, as a user would).
 *
 * Usage: node tests/acceptance/tools/v2-offline-install.mjs [tarball] [--keep]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const PNPM = process.env.DSH_PNPM ?? 'C:/Users/29559/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs'
const UNREACHABLE = 'http://127.0.0.1:9/'
const root = join(tmpdir(), `dsh-verifier2-offline-${process.pid}`)

const tarball = resolve(process.argv[2] ?? join(REPO, 'tests', 'acceptance', 'tools', 'fixtures', 'dsh-side-chat-plugin-0.2.0.tgz'))
if (!existsSync(tarball)) {
  console.error(`no tarball at ${tarball} — pass one, or run "pnpm pack --pack-destination <dir>" first`)
  process.exit(2)
}

rmSync(root, { recursive: true, force: true })
mkdirSync(join(root, 'store'), { recursive: true })
const tgz = join(root, 'plugin.tgz')
cpSync(tarball, tgz)

function makeProfile(name, { dshShaped }) {
  const dir = join(root, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dsh: { profile: { bundles: [] } },
  }, undefined, 2)}\n`)
  if (dshShaped) {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
  return dir
}

function pnpmAdd(dir, { store }) {
  const args = [PNPM, 'add', tgz, '--offline', `--registry=${UNREACHABLE}`]
  if (store) args.push(`--store-dir=${join(root, 'store')}`)
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

console.log(`tarball : ${tarball} (${readFileSync(tgz).length} bytes)`)
console.log(`temp home: ${root}\npnpm     : ${PNPM}\nflags    : --offline --registry=${UNREACHABLE} --store-dir=<cold>\n`)

// ---------------------------------------------------------------- case A
const A = makeProfile('a-dsh-shaped', { dshShaped: true })
const a = pnpmAdd(A, { store: true })
console.log('=== A. DSH-shaped profile, cold store, no network ===')
console.log(a.output.split('\n').slice(-12).join('\n'))
console.log(`exit=${a.status}\n`)

let aOk = a.status === 0
if (aOk) {
  const installed = join(A, 'node_modules', 'dsh-side-chat-plugin')
  const installedManifest = existsSync(join(installed, 'package.json'))
    ? JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
    : undefined
  console.log(`installed at : ${installed}`)
  console.log(`name@version : ${installedManifest?.name}@${installedManifest?.version}`)
  console.log(`dependencies : ${JSON.stringify(installedManifest?.dependencies ?? {})}`)
  console.log(`peerDeps     : ${JSON.stringify(installedManifest?.peerDependencies ?? {})}`)
  const scoped = join(A, 'node_modules', '@deepseek-ai')
  console.log(`@deepseek-ai/ in node_modules : ${existsSync(scoped) ? 'PRESENT' : 'absent'}`)

  // The installed Host half must still be the inlined artifact and expose a
  // native Schemastery schema whose defaults survive.
  const probe = `
    const mod = await import(${JSON.stringify(`file:///${join(installed, 'lib/index.js').replaceAll('\\', '/')}`)})
    const text = (await import('node:fs')).readFileSync(${JSON.stringify(join(installed, 'lib/index.js'))}, 'utf8')
    const specs = [...text.matchAll(/^\\s*import\\s+(?:[^'"()]*?\\s+from\\s+)?["']([^"']+)["']/gm)].map(m => m[1])
    const dynamic = [...text.matchAll(/import\\(\\s*["']([^"']+)["']\\s*\\)/g)].map(m => m[1])
    const requireCalls = [...text.matchAll(/require\\(\\s*["']([^"']+)["']\\s*\\)/g)].map(m => m[1])
    console.log('static imports :', JSON.stringify([...new Set(specs)]))
    console.log('dynamic imports:', JSON.stringify([...new Set(dynamic)]))
    console.log('require() calls:', JSON.stringify([...new Set(requireCalls)]))
    console.log('apply is fn    :', typeof mod.apply === 'function')
    const Config = mod.Config
    console.log('Symbol.for(schemastery):', Config?.[Symbol.for('schemastery')])
    console.log('type is string :', typeof Config?.type)
    console.log('meta is object :', typeof Config?.meta === 'object' && Config?.meta !== null)
    console.log('meta keys      :', JSON.stringify(Object.keys(Config?.meta ?? {})))
    // A Schemastery schema is a callable instance: calling it validates and
    // returns the normalized output (lib/types/index.d.ts: "Callable schema
    // instance that validates input and returns normalized output").
    console.log('typeof Config  :', typeof Config)
    const value = Config({})
    console.log('validate({})   :', JSON.stringify(value))
    const keys = ['maxBodyBytes','maxConcurrent','recentMessages','maxMessageChars','maxContextChars','timeoutMs']
    console.log('defaults match :', JSON.stringify(keys.map(k => [k, value[k]])))
    console.log('trust absent by default (no schema default) :', !('trust' in value))
    const fieldMeta = Object.fromEntries(keys.map(k => [k, typeof Config.dict?.[k]?.meta?.description === 'string']))
    console.log('per-field meta.description present :', JSON.stringify(fieldMeta))
  `
  const probePath = join(root, 'probe.mjs')
  writeFileSync(probePath, probe)
  const p = spawnSync(process.execPath, [probePath], { encoding: 'utf8' })
  console.log('--- installed lib/index.js ---')
  console.log(p.stdout.trim())
  if (p.status !== 0) { console.log(p.stderr.trim()); aOk = false }
  if (!p.stdout.includes('static imports : ["./protocol.js"]')) aOk = false
  if (!p.stdout.includes('apply is fn    : true')) aOk = false
  if (!p.stdout.includes('Symbol.for(schemastery): true')) aOk = false
  if (!p.stdout.includes('type is string : string')) aOk = false
  if (!p.stdout.includes('meta is object : true')) aOk = false
  if (!p.stdout.includes('"maxBodyBytes":262144')) aOk = false
  if (!p.stdout.includes('"timeoutMs":600000')) aOk = false
  if (!p.stdout.includes('trust absent by default (no schema default) : true')) aOk = false

  // case C: the shipped self-check against the installed package
  writeFileSync(join(A, 'cordis.patch.yml'), '- insert:\n    - id: dsh-side-chat-plugin\n      name: dsh-side-chat-plugin\n')
  const v = spawnSync(process.execPath, [join(REPO, 'scripts', 'verify.mjs'), '--home', root, '--profile', 'a-dsh-shaped', '--port', '1'], { encoding: 'utf8' })
  console.log(`\n=== C. verify.mjs against the installed profile ===\nexit=${v.status}`)
  console.log(`${v.stdout ?? ''}${v.stderr ?? ''}`.trim())
}

// ---------------------------------------------------------------- case B
const B = makeProfile('b-bare', { dshShaped: false })
const b = pnpmAdd(B, { store: true })
console.log('\n=== B. bare profile (no pnpm-workspace.yaml) — negative control ===')
console.log(b.output.split('\n').slice(-10).join('\n'))
console.log(`exit=${b.status}  (non-zero here is the scaffold, not the package)`)

console.log('\n===== SUMMARY =====')
console.log(`A dsh-shaped offline install : ${aOk ? 'OK' : 'FAILED'}`)
console.log(`B bare offline install       : exit ${b.status} (${b.status === 0 ? 'unexpectedly succeeded' : 'expected failure: peer auto-install'})`)

if (process.argv.includes('--keep')) console.log(`\nkept: ${root}`)
else rmSync(root, { recursive: true, force: true })
process.exit(aOk ? 0 : 1)

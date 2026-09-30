#!/usr/bin/env node
/**
 * verifier2 incremental check: what `scripts/install.mjs` does to a profile's
 * `cordis.patch.yml`.
 *
 * Case 1 — the pre-0.2.0 shape the migration path describes: an apiKey override,
 *          a ui-theme override and a hand-written legacy `id: side-chat /
 *          name: dsh-side-chat` insert row. Asserts the two overrides survive
 *          byte-for-byte, the legacy row is gone, the new row is appended, and
 *          the file is never truncated (this is also the regression test for the
 *          cleared-patch bug the previous report called D1).
 * Case 2 — over-deletion probe: the legacy row is the FIRST row of an insert
 *          block that also holds another plugin's row. Prints exactly what the
 *          other row becomes.
 * Case 3 — the legacy row is the second row of such a block: checks the other
 *          row survives untouched.
 *
 * Every profile is created under one temp DSH_HOME and removed afterwards.
 *
 * Usage: node tests/acceptance/tools/v2-install-legacy.mjs [--keep]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const root = join(tmpdir(), `dsh-verifier2-legacy-${process.pid}`)

const LEGACY = ['- insert:', '    - id: side-chat', '      name: dsh-side-chat']
const NEW_ROW = '- insert:\n    - id: dsh-side-chat-plugin\n      name: dsh-side-chat-plugin\n'

rmSync(root, { recursive: true, force: true })

function profile(name, patch) {
  const dir = join(root, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dsh: { profile: { bundles: [] } },
  }, undefined, 2)}\n`)
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  writeFileSync(join(dir, 'cordis.patch.yml'), patch)
  return dir
}

function install(dir, name) {
  const out = execFileSync(process.execPath, [join(REPO, 'scripts', 'install.mjs'), '--home', root, '--profile', name, '--no-build'], {
    cwd: REPO, encoding: 'utf8',
  })
  return out
}

let ok = true
const fail = (message) => { ok = false; console.log(`  FAIL  ${message}`) }
const pass = (message) => console.log(`  ok    ${message}`)

// ------------------------------------------------------------------ case 1
const P1 = `# my profile config
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-account
    model: deepseek-flash
- id: llm-deepseek
  name: "@deepseek-ai/dsh-llm-deepseek-api-key"
  config:
    apiKey: secret-value-must-survive
- id: ui-theme
  name: "@deepseek-ai/dsh-client-ui-theme"
  config:
    preference: system
${LEGACY.join('\n')}
`
const dir1 = profile('c1', P1)
const before1 = readFileSync(join(dir1, 'cordis.patch.yml'), 'utf8')
console.log(`=== case 1: legacy state (${Buffer.byteLength(before1)} bytes) ===`)
console.log(install(dir1, 'c1').trim().split('\n').filter((line) => line.includes('side-chat-plugin')).join('\n'))
const after1 = readFileSync(join(dir1, 'cordis.patch.yml'), 'utf8')
console.log(`--- cordis.patch.yml after (${Buffer.byteLength(after1)} bytes) ---`)
console.log(after1)

// Byte-for-byte expectation: the original minus the three legacy lines, then the new row.
const expected1 = P1.split('\n').filter((_, index, lines) => {
  const isLegacy = index >= lines.length - 4 && index < lines.length - 1
  return !isLegacy
}).join('\n') + '\n' + NEW_ROW
if (after1 === expected1) pass('result is byte-for-byte: original overrides + new row, nothing truncated')
else {
  fail('result differs from the byte-for-byte expectation')
  console.log('expected:\n' + JSON.stringify(expected1))
  console.log('actual:\n' + JSON.stringify(after1))
}
if (after1.includes('secret-value-must-survive') && after1.includes('preference: system')) pass('both overrides survived')
else fail('an override was lost')
if (!/^\s*-?\s*id:\s*side-chat\s*$/m.test(after1) && !after1.includes('name: dsh-side-chat\n')) pass('legacy row removed (no bare id: side-chat left)')
else fail('legacy row still present')
if (after1.includes('id: dsh-side-chat-plugin')) pass('new Loader row appended')
else fail('new row missing')
if (after1.split('\n').filter((line) => /^-\s*insert:\s*$/.test(line)).length === 1) pass('exactly one insert block')
else fail('unexpected number of insert blocks')

// ------------------------------------------------------------------ case 2
const P2 = `- insert:
    - id: side-chat
      name: dsh-side-chat
    - id: some-other-plugin
      name: some-other-plugin
`
const dir2 = profile('c2', P2)
console.log(`\n=== case 2: legacy row FIRST in a shared insert block ===`)
console.log(install(dir2, 'c2').trim().split('\n').filter((line) => line.includes('side-chat-plugin') || line.includes('removed')).join('\n'))
const after2 = readFileSync(join(dir2, 'cordis.patch.yml'), 'utf8')
console.log('--- cordis.patch.yml after ---')
console.log(after2)
if (/^\s*-\s*insert:\s*$/m.test(after2) && /id: some-other-plugin/.test(after2)) {
  const otherStillInsideInsert = /- insert:[\s\S]*?id: some-other-plugin/.test(after2)
  if (otherStillInsideInsert) pass('other plugin row still inside an insert block')
  else fail('other plugin row LOST its insert header (over-deletion)')
} else pass('other plugin row absent entirely')

// ------------------------------------------------------------------ case 3
const P3 = `- insert:
    - id: some-other-plugin
      name: some-other-plugin
    - id: side-chat
      name: dsh-side-chat
`
const dir3 = profile('c3', P3)
console.log(`\n=== case 3: legacy row SECOND in a shared insert block ===`)
install(dir3, 'c3')
const after3 = readFileSync(join(dir3, 'cordis.patch.yml'), 'utf8')
console.log(after3)
if (/- insert:\n    - id: some-other-plugin\n      name: some-other-plugin/.test(after3)) pass('other plugin row untouched')
else fail('other plugin row was damaged')

console.log(`\n===== SUMMARY: ${ok ? 'all assertions passed' : 'ASSERTIONS FAILED'} =====`)
if (process.argv.includes('--keep')) console.log(`kept: ${root}`)
else rmSync(root, { recursive: true, force: true })
process.exit(ok ? 0 : 1)

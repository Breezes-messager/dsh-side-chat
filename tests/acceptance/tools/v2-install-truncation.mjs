#!/usr/bin/env node
/**
 * verifier2 repro: `scripts/install.mjs` truncates the profile's cordis.patch.yml.
 *
 * Creates a throwaway DSH_HOME under the OS temp directory, gives the profile a
 * realistic patch layer (two config overrides plus an unrelated insert row), runs
 * the repository's install script against it, and prints the file before/after.
 * Writes nothing outside the temp home it creates.
 *
 * Usage: node tests/acceptance/tools/v2-install-truncation.mjs [--keep]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const home = join(tmpdir(), `dsh-verifier2-truncation-${process.pid}`)
const profile = join(home, 'profiles', 'web')
const PATCH = `# my profile config
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-account
    model: deepseek-flash
- id: llm-deepseek
  name: "@deepseek-ai/dsh-llm-deepseek-api-key"
  config:
    apiKey: secret-value-must-survive
- insert:
    - id: something-else
      name: some-other-plugin
`

rmSync(home, { recursive: true, force: true })
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'package.json'), `${JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
}, undefined, 2)}\n`)
writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
writeFileSync(join(profile, 'cordis.patch.yml'), PATCH)

const patchPath = join(profile, 'cordis.patch.yml')
const before = readFileSync(patchPath, 'utf8')

console.log(`temp DSH_HOME : ${home}`)
console.log(`patch before  : ${Buffer.byteLength(before)} bytes, ${before.split('\n').length} lines`)
console.log('running: node scripts/install.mjs --home <temp> --profile web --no-build\n')

execFileSync(process.execPath, [join(REPO, 'scripts', 'install.mjs'), '--home', home, '--profile', 'web', '--no-build'], {
  cwd: REPO,
  stdio: 'inherit',
})

const after = readFileSync(patchPath, 'utf8')
console.log(`\npatch after   : ${Buffer.byteLength(after)} bytes, ${after.split('\n').length} lines`)
console.log('--- after ---')
console.log(after)
const survived = after.includes('secret-value-must-survive') && after.includes('something-else')
console.log(`\neverything except the new row survived: ${survived ? 'YES' : 'NO — THE PATCH LAYER WAS REPLACED'}`)

if (process.argv.includes('--keep')) console.log(`\nkept: ${home}`)
else rmSync(home, { recursive: true, force: true })

process.exit(survived ? 0 : 1)

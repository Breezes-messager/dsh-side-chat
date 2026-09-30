#!/usr/bin/env node
/**
 * Verifier tool (outside the repo): independent artifact inspection.
 *
 * 1. every module specifier lib/index.js and lib/protocol.js import
 * 2. decideTrust / settingsOf behaviour, executed from the built artifact
 * 3. lib/client.js closure-factory shape, executed against a stubbed
 *    window.__ModuleLoader__ and require table
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = process.argv[2]
if (root === undefined) {
  console.error('usage: verify-artifacts.mjs <package-root>')
  process.exit(2)
}

const SPECIFIER = /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g

console.log('== 1. import specifiers in the Host artifacts ==')
for (const file of ['lib/index.js', 'lib/protocol.js']) {
  const text = readFileSync(resolve(root, file), 'utf8')
  const found = [...text.matchAll(SPECIFIER)].map((m) => m[1])
  const unique = [...new Set(found)]
  console.log(`${file}: ${unique.length} distinct specifiers -> ${JSON.stringify(unique)}`)
  console.log(`${file}: ${text.length} bytes, head=${JSON.stringify(text.slice(0, 60))}`)
}

console.log('\n== 2. Host module executes and decides trust ==')
const host = await import(pathToFileURL(resolve(root, 'lib/index.js')).href)
const protocol = await import(pathToFileURL(resolve(root, 'lib/protocol.js')).href)
console.log('exports:', Object.keys(host).sort().join(', '))
console.log('SIDE_CHAT_ROUTE =', JSON.stringify(protocol.SIDE_CHAT_ROUTE))
console.log('DEFAULT_TRUST =', JSON.stringify(host.DEFAULT_TRUST))
console.log('settingsOf({}) =', JSON.stringify(host.settingsOf({})))
console.log('settingsOf({trust:"host"}) =', JSON.stringify(host.settingsOf({ trust: 'host' })))
console.log('settingsOf({},{allowLoopback:true}) =', JSON.stringify(host.settingsOf({}, { allowLoopback: true })))
console.log('settingsOf({trust:"same-origin"},{allowLoopback:true}) =',
  JSON.stringify(host.settingsOf({ trust: 'same-origin' }, { allowLoopback: true })))

const cases = [
  ['desktop proxy: loopback, NO origin', { mode: 'same-origin', rejection: undefined, loopback: true, origin: undefined, host: '127.0.0.1:19387' }],
  ['browser page: loopback, matching origin', { mode: 'same-origin', rejection: undefined, loopback: true, origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' }],
  ['browser page: loopback, opaque origin', { mode: 'same-origin', rejection: undefined, loopback: true, origin: 'null', host: '127.0.0.1:19387' }],
  ['cross-site page: origin mismatch', { mode: 'same-origin', rejection: undefined, loopback: true, origin: 'https://evil.example', host: '127.0.0.1:19387' }],
  ['non-loopback peer: matching origin', { mode: 'same-origin', rejection: undefined, loopback: false, origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' }],
  ['host mode, no rejection', { mode: 'host', rejection: undefined, loopback: true, origin: undefined, host: '127.0.0.1:19387' }],
  ['host mode, rejection 401', { mode: 'host', rejection: 401, loopback: true, origin: undefined, host: '127.0.0.1:19387' }],
  ['open mode, no origin', { mode: 'open', rejection: undefined, loopback: false, origin: undefined, host: undefined }]
]
for (const [label, input] of cases) {
  console.log(`${label} ->`, JSON.stringify(host.decideTrust(input)))
}

console.log('\n== 3. browser bundle is a ModuleLoader closure factory ==')
const clientText = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
console.log('bytes:', clientText.length)
console.log('head:', JSON.stringify(clientText.slice(0, 90)))
console.log('tail:', JSON.stringify(clientText.slice(-60)))
const registrations = []
const moduleStub = { exports: {} }
const sandbox = {
  window: { __ModuleLoader__: { load: (spec) => { registrations.push(spec) } } },
  module: moduleStub,
  exports: moduleStub.exports,
  process: { env: { NODE_ENV: 'production' } },
}
const requireTable = new Proxy({}, { get: (_t, name) => {
  if (name === 'react') return { createElement: () => ({}), useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useMemo: (f) => f(), useCallback: (f) => f(), Fragment: 'fragment' }
  return new Proxy(function () {}, { get: () => ({}), apply: () => ({}) })
} })
const fn = new Function('window', 'module', 'exports', 'process', 'require', clientText)
fn(sandbox.window, sandbox.module, sandbox.exports, sandbox.process, requireTable)
console.log('load() calls:', registrations.length)
for (const spec of registrations) {
  console.log('  id:', JSON.stringify(spec.id), 'factory?', typeof spec.factory)
  try {
    const exported = spec.factory(requireTable)
    console.log('  factory() ->', exported === undefined ? 'undefined' : `object with keys ${JSON.stringify(Object.keys(exported).sort())}`)
  } catch (error) {
    console.log('  factory() threw:', String(error))
  }
}

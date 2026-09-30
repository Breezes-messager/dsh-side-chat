#!/usr/bin/env node
/**
 * verifier2 offline trust matrix.
 *
 * Imports the *built* Host half (`lib/index.js`) and prints what `decideTrust`
 * answers for every input class the docs talk about, plus the defaults
 * `settingsOf` resolves. Pure functions: no server, no model, no writes.
 *
 * Usage: node tests/acceptance/tools/v2-decide-matrix.mjs [repo-root]
 */
const repo = (process.argv[2] ?? new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).replace(/[\\/]+$/, '')
const mod = await import(`file:///${repo.replaceAll('\\', '/')}/lib/index.js`)
const protocol = await import(`file:///${repo.replaceAll('\\', '/')}/lib/protocol.js`)
const { decideTrust, settingsOf, normalizeTrust, DEFAULT_TRUST, TRUST_MODES } = mod

console.log('SIDE_CHAT_ROUTE                        =', protocol.SIDE_CHAT_ROUTE)
console.log('DEFAULT_TRUST                          =', DEFAULT_TRUST)
console.log('TRUST_MODES                            =', JSON.stringify(TRUST_MODES))
console.log('settingsOf({})                         =', settingsOf({}).trust, '/', settingsOf({}).trustSource)
console.log('settingsOf({ trust: "host" })           =', settingsOf({ trust: 'host' }).trust, '/', settingsOf({ trust: 'host' }).trustSource)
console.log('settingsOf({}, allowLoopback)          =', settingsOf({}, { allowLoopback: true }).trust, '/', settingsOf({}, { allowLoopback: true }).trustSource)
console.log('settingsOf({ trust: "host" }, allowLoopback) =', settingsOf({ trust: 'host' }, { allowLoopback: true }).trust)
console.log('settingsOf({ trust: "bogus" }, allowLoopback) =', settingsOf({ trust: 'bogus' }, { allowLoopback: true }).trust)
console.log('normalizeTrust("same-origin")          =', normalizeTrust('same-origin'))

const HOST = '127.0.0.1:19387'
const show = (d) => d.allowed ? `ALLOW  (${d.basis})` : `DENY   ${d.status} (${d.basis})`

console.log('\n--- same-origin, Host admitted (rejection=undefined), loopback ---')
for (const origin of [undefined, 'null', 'http://127.0.0.1:19387', 'https://127.0.0.1:19387', 'http://127.0.0.1', 'http://evil.example', 'dsh-app://app', '::::']) {
  console.log(`  origin=${String(origin).padEnd(26)} ${show(decideTrust({ mode: 'same-origin', rejection: undefined, loopback: true, origin, host: HOST }))}`)
}

console.log('\n--- the Host rejection outranks every mode ---')
for (const mode of ['same-origin', 'host']) {
  for (const rejection of [401, 403]) {
    console.log(`  mode=${mode.padEnd(11)} rejection=${rejection}  ${show(decideTrust({ mode, rejection, loopback: true, origin: 'http://evil.example', host: HOST }))}`)
  }
}

console.log('\n--- same-origin, caller off loopback ---')
console.log('  no origin        ', show(decideTrust({ mode: 'same-origin', rejection: undefined, loopback: false, origin: undefined, host: HOST })))
console.log('  matching origin  ', show(decideTrust({ mode: 'same-origin', rejection: undefined, loopback: false, origin: 'http://127.0.0.1:19387', host: HOST })))

console.log('\n--- host mode never reads Origin ---')
console.log('  cross-site origin', show(decideTrust({ mode: 'host', rejection: undefined, loopback: true, origin: 'http://evil.example', host: HOST })))
console.log('  remote, no origin', show(decideTrust({ mode: 'host', rejection: undefined, loopback: false, origin: undefined, host: HOST })))

console.log('\n--- open mode skips every check ---')
console.log('  rejection=403, cross-site', show(decideTrust({ mode: 'open', rejection: 403, loopback: false, origin: 'http://evil.example', host: HOST })))

console.log('\n--- same-origin comparison edges ---')
for (const [label, host, origin] of [
  ['Host absent', undefined, 'http://127.0.0.1:19387'],
  ['hostname localhost', 'localhost:19387', 'http://localhost:19387'],
  ['uppercase scheme', HOST, 'HTTP://127.0.0.1:19387'],
  ['trailing slash', HOST, 'http://127.0.0.1:19387/'],
  ['file:// origin', HOST, 'file:///tmp/x'],
  ['blob: origin', HOST, 'blob:http://127.0.0.1:19387'],
  ['scheme-relative', HOST, '//127.0.0.1:19387'],
  ['no scheme', HOST, '127.0.0.1:19387'],
  ['IPv6 literal', '[::1]:19387', 'http://[::1]:19387'],
  ['default port', '127.0.0.1:80', 'http://127.0.0.1'],
]) console.log(`  ${label.padEnd(20)} ${show(decideTrust({ mode: 'same-origin', rejection: undefined, loopback: true, origin, host }))}`)

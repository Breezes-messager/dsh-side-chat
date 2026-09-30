#!/usr/bin/env node
/**
 * verifier2 read-only trust probe against a running DSH web port.
 *
 * Sends only GETs, wrong content-types and invalid JSON that the route refuses
 * *before* any model call, so this never spends a model request. Use it to check
 * that the live port answers the way `decideTrust` in src/index.ts says it must.
 *
 * Note when reading the output: on DSH 0.2.0-rc.2 the Host's own check
 * (`connection.requestRejection` = Host/Origin fence, then browser-cookie auth)
 * already refuses a cross-site `Origin` with 403 and a cookie-less caller with
 * 401, so those statuses may come from the *Host* handed through by the plugin
 * rather than from the plugin's own comparison. The one case the Host admits and
 * the plugin still decides is a request with no `Origin` at all — which is what
 * the Electron desktop forwarder produces.
 *
 * Usage: node tests/acceptance/tools/v2-trust-probe.mjs [port]
 */
import { request } from 'node:http'

const port = Number(process.argv[2] ?? 19387)
const ROUTE = '/side-chat/ask'

function probe({ path, method = 'GET', headers = {}, body }) {
  return new Promise((done) => {
    const h = { ...headers }
    if (body !== undefined) h['content-length'] = Buffer.byteLength(body)
    const req = request({ host: '127.0.0.1', port, path, method, headers: h, timeout: 4000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => done({
        status: res.statusCode,
        contentType: res.headers['content-type'] ?? '(none)',
        length: Buffer.byteLength(text),
        body: text.replace(/\s+/g, ' ').slice(0, 100),
      }))
    })
    req.on('timeout', () => { req.destroy(); done({ status: 'TIMEOUT', contentType: '', length: 0, body: '' }) })
    req.on('error', (error) => done({ status: `ERR:${error.code}`, contentType: '', length: 0, body: '' }))
    req.end(body)
  })
}

const J = { 'content-type': 'application/json' }
const cases = [
  ['GET  no Origin', { path: ROUTE }],
  ['GET  Origin=http://127.0.0.1:<port> (same)', { path: ROUTE, headers: { origin: `http://127.0.0.1:${port}` } }],
  ['GET  Origin=https://127.0.0.1:<port> (same host)', { path: ROUTE, headers: { origin: `https://127.0.0.1:${port}` } }],
  ['GET  Origin=http://127.0.0.1 (port 80)', { path: ROUTE, headers: { origin: 'http://127.0.0.1' } }],
  ['GET  Origin=http://evil.example (cross-site)', { path: ROUTE, headers: { origin: 'http://evil.example' } }],
  ['GET  Origin=null (opaque)', { path: ROUTE, headers: { origin: 'null' } }],
  ['GET  Origin=dsh-app://app', { path: ROUTE, headers: { origin: 'dsh-app://app' } }],
  ['GET  Origin=:::: (unparsable)', { path: ROUTE, headers: { origin: '::::' } }],
  ['GET  sec-fetch-site: cross-site', { path: ROUTE, headers: { 'sec-fetch-site': 'cross-site' } }],
  ['GET  bogus cookie', { path: ROUTE, headers: { cookie: 'dsh_web_session=bogus' } }],
  ['POST text/plain, no Origin', { path: ROUTE, method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'probe' }],
  ['POST application/json, invalid body, no Origin', { path: ROUTE, method: 'POST', headers: J, body: '{' }],
  ['POST application/json, invalid body, cross-site Origin', { path: ROUTE, method: 'POST', headers: { ...J, origin: 'http://evil.example' }, body: '{' }],
  ['POST text/plain, cross-site Origin', { path: ROUTE, method: 'POST', headers: { 'content-type': 'text/plain', origin: 'http://evil.example' }, body: 'probe' }],
  ['GET  / (the app shell)', { path: '/' }],
]

console.log(`verifier2 trust probe — http://127.0.0.1:${port}${ROUTE} (no valid JSON body is ever sent)`)
for (const [label, spec] of cases) {
  const r = await probe(spec)
  console.log(`${label.padEnd(52)} -> ${String(r.status).padEnd(8)} ct=${String(r.contentType).padEnd(26)} len=${String(r.length).padEnd(4)} ${r.body}`)
}

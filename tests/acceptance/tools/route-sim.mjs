#!/usr/bin/env node
/**
 * Verifier harness (outside the repo): run the built Host half of dsh-side-chat
 * against a throwaway HTTP server, with a stubbed Cordis context. No model is
 * called: the stubbed `llm.stream` yields one text-delta and one finish frame.
 *
 * This reproduces the request shapes that reach the route in real deployments:
 *   - the desktop window (dsh-app://app, whose proxy strips Origin)
 *   - a browser page on the same origin as the Harness
 *   - a cross-site page, an opaque origin, and a bare local script
 *
 * usage: node route-sim.mjs <package-root> [trustMode]
 */
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = process.argv[2]
const trustArg = process.argv[3]
const plugin = await import(pathToFileURL(resolve(root, 'lib/index.js')).href)

const registered = new Map()
const webServer = { register: (route) => { registered.set(route.path, route.handler); return () => {} } }
const llm = {
  stream: async function* () {
    yield { type: 'text-delta', text: 'stub-answer' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  },
}
const connection = { requestRejection: () => undefined }
const ctx = {
  // Cordis exposes services as properties; the plugin reads webServer directly
  // and asks ctx.get() for the optional ones.
  webServer,
  llm,
  get: (name) => {
    if (name === 'webServer') return webServer
    if (name === 'llm') return llm
    if (name === 'connection') return connection
    return undefined
  },
  effect: (fn) => { const dispose = fn(); return dispose },
  logger: { info: (m) => console.log('[plugin log]', m), warn: (...a) => console.log('[plugin warn]', ...a) },
}

plugin.apply(ctx, trustArg === undefined ? {} : { trust: trustArg })
const handler = registered.get(plugin.SIDE_CHAT_ROUTE ?? '/side-chat/ask')
if (handler === undefined) {
  console.error('route was not registered')
  process.exit(1)
}

const server = createServer((req, res) => { handler(req, res) })
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const port = server.address().port
const url = `http://127.0.0.1:${port}/side-chat/ask`

/** One request, with a deliberately minimal body so a model is never reachable. */
async function probe(label, { headers = {}, body = JSON.stringify({ question: 'hi', history: [] }), method = 'POST' } = {}) {
  const response = await fetch(url, { method, headers, body: method === 'POST' ? body : undefined })
  let text = ''
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    text = (await response.text()).split('\n\n').filter(Boolean).slice(0, 2).join(' | ')
  } else {
    text = (await response.text()).slice(0, 200)
  }
  console.log(`${label}\n    -> ${response.status} ${JSON.stringify(text)}\n`)
}

console.log(`# trust mode: ${trustArg ?? 'default (same-origin)'}  listening on ${url}`)
console.log(`# registered routes: ${[...registered.keys()].join(', ')}\n`)

await probe('desktop window shape: Origin deleted by the dsh-app:// proxy', {
  headers: { 'content-type': 'application/json', cookie: 'host-cookie' },
})
await probe('same-origin browser page', {
  headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` },
})
await probe('cross-site page', {
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
})
await probe('opaque origin (file:// page or sandboxed frame)', {
  headers: { 'content-type': 'application/json', origin: 'null' },
})
await probe('bare local script with no Origin (curl/undici)', {
  headers: { 'content-type': 'application/json' },
})
await probe('GET (method refused before the body is read)', { method: 'GET' })
await probe('POST text/plain (refused before a model is reachable)', {
  headers: { 'content-type': 'text/plain' },
  body: 'probe',
})

server.close()

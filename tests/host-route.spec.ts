/**
 * The route end to end: a real HTTP server on an ephemeral loopback port, a
 * stubbed Host context (no Harness runtime), and the frames a browser half would
 * actually receive.
 *
 * These tests exist because the interesting failures live in the wiring — a
 * promise that never settles, a slot that never comes back, a frame written
 * after `end()` — and those are invisible to a unit test of the pure parts.
 */
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, decideTrust, DEFAULT_TRUST, type Config } from '../src/index.ts'
import { decodeFrames, SIDE_CHAT_ROUTE, type SideChatFrame } from '../src/protocol.ts'

/** One provider call this plugin made. */
interface Call {
  readonly provider: string
  readonly model: string
  readonly system?: string
  readonly messages: readonly unknown[]
  readonly sessionId?: string
  readonly signal?: AbortSignal
}

/** A stub Host the route can run against. */
interface Host {
  readonly port: number
  readonly calls: Call[]
  readonly logs: string[]
  /** How many provider calls saw their abort signal fire. */
  aborts(): number
  setScript(script: (call: Call) => AsyncIterable<unknown>): void
  close(): Promise<void>
}

interface HostOptions {
  readonly config?: Config
  readonly services?: Record<string, unknown>
  readonly script?: (call: Call) => AsyncIterable<unknown>
}

const running = new Set<Host>()

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const host of [...running]) await host.close()
  running.clear()
})

/** Resolve when the signal aborts; a caller that never aborts never resolves. */
function untilAborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal.aborted) {
      resolve()
      return
    }
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** One answer in two chunks. */
async function* answers(): AsyncIterable<unknown> {
  yield { type: 'text-delta', text: 'hello ' }
  yield { type: 'text-delta', text: 'world' }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** A turn that produces no text at all. */
async function* silent(): AsyncIterable<unknown> {
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** A provider refusal. */
async function* refuses(): AsyncIterable<unknown> {
  yield {
    type: 'finish',
    reason: { kind: 'error', failure: { message: 'invalid api key', code: 'unauthorized', status: 401 } },
  }
}

/** A provider call that only ever ends when it is aborted. */
async function* hangs(call: Call): AsyncIterable<unknown> {
  await untilAborted(call.signal)
}

/** A provider call that throws instead of failing politely. */
async function* explodes(): AsyncIterable<unknown> {
  throw new Error('provider exploded')
}

/** Text, then a provider that only ends when aborted. */
async function* partialThenHangs(call: Call): AsyncIterable<unknown> {
  yield { type: 'text-delta', text: 'partial' }
  await untilAborted(call.signal)
  yield { type: 'finish', reason: { kind: 'aborted' } }
}

/** Mount the plugin against a stub context, then serve its route for real. */
async function start(options: HostOptions = {}): Promise<Host> {
  const routes: { readonly path: string, readonly handler: (req: IncomingMessage, res: never) => void | Promise<void> }[] = []
  const logs: string[] = []
  const calls: Call[] = []
  let abortCount = 0
  let script = options.script ?? answers
  const record = (value: unknown): void => { logs.push(typeof value === 'string' ? value : String(value)) }
  const services: Record<string, unknown> = {
    llm: {
      stream(call: Call) {
        calls.push(call)
        call.signal?.addEventListener('abort', () => { abortCount += 1 }, { once: true })
        return script(call)
      },
    },
    ...options.services,
  }
  const ctx = {
    effect: (callback: () => unknown) => callback(),
    webServer: { register: (route: never) => { routes.push(route); return () => {} } },
    get: (key: string) => services[key],
    logger: { info: record, warn: record, error: record, debug: record },
  } as unknown as Context
  apply(ctx, options.config ?? {})

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]
    const route = routes.find(candidate => candidate.path === path)
    if (route === undefined) {
      res.statusCode = 404
      res.end()
      return
    }
    void Promise.resolve(route.handler(req, res as never)).catch(() => { if (!res.writableEnded) res.end() })
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', () => resolve()) })
  const port = (server.address() as AddressInfo).port
  let closed = false
  const host: Host = {
    port,
    calls,
    logs,
    aborts: () => abortCount,
    setScript: (next) => { script = next },
    close: async () => {
      if (closed) return
      closed = true
      server.closeAllConnections()
      await new Promise<void>(resolve => { server.close(() => resolve()) })
    },
  }
  running.add(host)
  return host
}

/** One reply, headers and body. */
interface Reply {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly text: string
}

/**
 * Send one request to a harness.
 *
 * The real caller is the panel, a same-origin `fetch`, so these requests carry a
 * matching `Origin` unless a test asks for the bare local caller with
 * `origin: null` — which is exactly what the default trust policy refuses.
 */
function ask(
  port: number,
  options: {
    readonly method?: string
    readonly headers?: Record<string, string>
    readonly body?: string
    readonly origin?: string | null
  } = {},
): Promise<Reply> {
  const { method = 'POST', headers = {}, body, origin } = options
  const originHeader = origin === null ? {} : { origin: origin ?? `http://127.0.0.1:${port}` }
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      method,
      path: SIDE_CHAT_ROUTE,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...originHeader,
        ...headers,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk as Buffer))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/** Ask one question and decode the frames that came back. */
async function frames(
  host: Host,
  options: {
    readonly question?: string
    readonly headers?: Record<string, string>
    readonly request?: unknown
    readonly origin?: string | null
  } = {},
): Promise<{ readonly status: number, readonly frames: SideChatFrame[] }> {
  const body = JSON.stringify(options.request ?? { question: options.question ?? 'hi', history: [] })
  const reply = await ask(host.port, { headers: options.headers, body, origin: options.origin })
  return { status: reply.status, frames: decodeFrames(reply.text).frames }
}

/** Wait for a condition the server reaches asynchronously. */
async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the host')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/** One session log offering both a route and something to fold. */
const SESSION_EVENTS = [
  { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'deepseek-flash' } } } },
  {
    type: 'user/message',
    data: { message: { id: 'm-1', role: 'user', content: [{ type: 'text', text: 'earlier question' }] } },
  },
  {
    type: 'assistant/message',
    data: { message: { id: 'm-2', role: 'assistant', content: [{ type: 'text', text: 'earlier answer' }] } },
  },
]

/** A request that resolves its route from the stubbed session log. */
const ROUTED = { question: 'hi', history: [], sessionId: 's-1' } as const

/** The same request as a raw body, for tests that bypass `frames()`. */
const ROUTED_BODY = JSON.stringify(ROUTED)

/** A `sessionQuery` stub that answers with one fixed log. */
const sessionQuery = { readSession: async () => ({ events: SESSION_EVENTS }) }

describe('what the route refuses before answering', () => {
  it('refuses a non-POST method and names the one it accepts', async () => {
    const host = await start()
    const reply = await ask(host.port, { method: 'GET' })
    expect(reply.status).toBe(405)
    expect(reply.headers.allow).toBe('POST')
    expect(JSON.parse(reply.text)).toEqual({ error: 'method-not-allowed' })
  })

  it('refuses a body that does not claim to be JSON', async () => {
    const host = await start()
    const reply = await ask(host.port, { body: '{"question":"hi"}', headers: { 'content-type': 'text/plain' } })
    expect(reply.status).toBe(415)
  })

  it('refuses malformed JSON and an empty question', async () => {
    const host = await start()
    expect((await ask(host.port, { body: '{' })).status).toBe(400)
    expect((await ask(host.port, { body: '{"question":"   "}' })).status).toBe(400)
    expect((await ask(host.port, { body: '[]' })).status).toBe(400)
  })

  it('refuses a body over the limit, streamed or declared', async () => {
    const host = await start({ config: { maxBodyBytes: 64 } })
    const oversized = JSON.stringify({ question: 'x'.repeat(500), history: [] })
    const streamed = await ask(host.port, { body: oversized })
    expect(streamed.status).toBe(413)
    expect(streamed.headers.connection).toBe('close')
    expect(JSON.parse(streamed.text)).toEqual({ error: 'body-too-large' })
    const declared = await ask(host.port, {
      body: oversized,
      headers: { 'content-length': String(oversized.length) },
    })
    expect(declared.status).toBe(413)
  })

  it('refuses one answer too many with 429, then admits the next', async () => {
    const host = await start({
      config: { maxConcurrent: 1, timeoutMs: 200 },
      script: hangs,
      services: { sessionQuery },
    })
    const first = ask(host.port, { body: ROUTED_BODY })
    await waitFor(() => host.calls.length === 1)
    const second = await ask(host.port, { body: ROUTED_BODY })
    expect(second.status).toBe(429)
    expect(JSON.parse(second.text)).toEqual({ error: 'too-many-side-chats' })
    // The slot is taken for exactly as long as the answer runs, and not a moment longer.
    await first
    host.setScript(answers)
    const third = await frames(host, { request: ROUTED })
    expect(third.status).toBe(200)
    expect(third.frames.at(-1)).toEqual({ type: 'done' })
  })
})

describe('answering', () => {
  it('streams the provider text and ends with exactly one done', async () => {
    const host = await start({ services: { sessionQuery } })
    const reply = await ask(host.port, {
      body: JSON.stringify({ question: 'why?', history: [{ role: 'user', text: 'earlier' }], sessionId: 's-1' }),
    })
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    const decoded = decodeFrames(reply.text).frames
    expect(decoded).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
      { type: 'done' },
    ])
  })

  it('folds the session context, the selection, and the temporary history into the call', async () => {
    const host = await start({ services: { sessionQuery } })
    await frames(host, {
      request: {
        question: 'why?',
        history: [{ role: 'assistant', text: 'a previous side-chat answer' }],
        sessionId: 's-1',
        selection: 'picked words',
      },
    })
    const call = host.calls[0]
    expect(call?.provider).toBe('deepseek')
    expect(call?.model).toBe('deepseek-flash')
    expect(call?.sessionId).toBe('s-1')
    expect(call?.system).toContain('side chat of DeepSeek Harness')
    const rendered = JSON.stringify(call?.messages)
    expect(rendered).toContain('earlier question')
    expect(rendered).toContain('<selected-text>')
    expect(rendered).toContain('a previous side-chat answer')
    expect(rendered.indexOf('earlier question')).toBeLessThan(rendered.indexOf('<selected-text>'))
  })

  it('prefers an explicit model override over everything else', async () => {
    const host = await start({ services: { sessionQuery, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } } })
    await frames(host, {
      request: { question: 'hi', history: [], sessionId: 's-1', model: { provider: 'other', model: 'other-model' } },
    })
    expect(host.calls[0]?.provider).toBe('other')
  })

  it('tells the user what to do when no model route exists at all', async () => {
    // A brand-new install: no session open, no default model, no config override.
    const host = await start()
    const answer = await frames(host)
    expect(answer.status).toBe(200)
    expect(answer.frames).toHaveLength(2)
    expect(answer.frames[0]).toMatchObject({ type: 'error', code: 'model-route-missing' })
    const message = answer.frames[0]?.type === 'error' ? answer.frames[0].message : ''
    expect(message).toContain('Open a conversation')
    expect(message).toContain('configuration')
    expect(answer.frames[1]).toEqual({ type: 'done' })
  })

  it('reports a Host with no model service instead of throwing', async () => {
    const host = await start({ services: { llm: undefined } })
    const answer = await frames(host)
    expect(answer.frames[0]).toMatchObject({ type: 'error', code: 'model-service-missing' })
    expect(answer.frames.at(-1)).toEqual({ type: 'done' })
  })

  it('falls back to the Host default when the session cannot be read', async () => {
    const host = await start({
      services: {
        sessionQuery: { readSession: async () => { throw new Error('session store is offline') } },
        agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-flash' }) },
      },
    })
    const answer = await frames(host, { request: { question: 'hi', history: [], sessionId: 'gone' } })
    expect(answer.status).toBe(200)
    expect(answer.frames.at(-1)).toEqual({ type: 'done' })
    expect(host.calls[0]?.provider).toBe('deepseek')
    expect(host.logs.some(line => line.includes('could not read session gone'))).toBe(true)
  })

  it('survives a default-model service that throws or has no selection', async () => {
    const throwing = await start({
      services: { agentDefaultModel: { currentSelection: () => { throw new Error('not configured') } } },
    })
    expect((await frames(throwing)).frames[0]).toMatchObject({ type: 'error', code: 'model-route-missing' })
    const empty = await start({ services: { agentDefaultModel: { currentSelection: () => ({ provider: '', model: '' }) } } })
    expect((await frames(empty)).frames[0]).toMatchObject({ type: 'error', code: 'model-route-missing' })
    const absent = await start({ services: { agentDefaultModel: { notAService: true } } })
    expect((await frames(absent)).frames[0]).toMatchObject({ type: 'error', code: 'model-route-missing' })
  })

  it('says so when the model returns no text', async () => {
    const host = await start({ script: silent, services: { sessionQuery } })
    const answer = await frames(host, { request: ROUTED })
    expect(answer.frames).toEqual([
      { type: 'notice', text: 'The model returned no text for this question.' },
      { type: 'done' },
    ])
  })

  it('says so when the provider ends its stream without a finish frame', async () => {
    const host = await start({
      script: async function* () {},
      services: { sessionQuery },
    })
    const answer = await frames(host, { request: ROUTED })
    expect(answer.frames).toEqual([
      { type: 'notice', text: 'The model returned no text for this question.' },
      { type: 'done' },
    ])
  })
})

describe('failures and limits', () => {
  it('forwards a provider failure, keeps its detail out of the log, and still ends with done', async () => {
    const host = await start({ script: refuses, services: { sessionQuery } })
    const answer = await frames(host, { request: ROUTED })
    expect(answer.frames).toEqual([
      { type: 'error', code: 'model-failed', message: 'invalid api key' },
      { type: 'done' },
    ])
    expect(host.logs.some(line => line.includes('unauthorized'))).toBe(true)
    expect(host.logs.some(line => line.includes('invalid api key'))).toBe(false)
  })

  it('turns an unexpected provider failure into a readable error, not a crash', async () => {
    const host = await start({ script: explodes, services: { sessionQuery } })
    const answer = await frames(host, { request: ROUTED })
    expect(answer.frames[0]).toMatchObject({ type: 'error', code: 'internal-error' })
    expect(answer.frames.at(-1)).toEqual({ type: 'done' })
    expect(host.logs.some(line => line.includes('provider exploded'))).toBe(true)
  })

  it('stops a hanging answer at the time limit and gives its slot back', async () => {
    const host = await start({ config: { maxConcurrent: 1, timeoutMs: 60 }, script: hangs, services: { sessionQuery } })
    const first = await frames(host, { request: ROUTED })
    expect(first.frames).toEqual([
      { type: 'error', code: 'request-timeout', message: expect.any(String) },
      { type: 'done' },
    ])
    expect(host.aborts()).toBe(1)
    // The slot came back: a second question is answered, not refused with 429.
    const second = await frames(host, { request: ROUTED })
    expect(second.status).toBe(200)
    expect(second.frames.at(-1)).toEqual({ type: 'done' })
  })

  it('reports the time limit even when text has already streamed', async () => {
    const host = await start({
      config: { timeoutMs: 60 },
      script: partialThenHangs,
      services: { sessionQuery },
    })
    const answer = await frames(host, { request: ROUTED })
    expect(answer.frames).toEqual([
      { type: 'text', text: 'partial' },
      { type: 'error', code: 'request-timeout', message: expect.any(String) },
      { type: 'done' },
    ])
  })

  it('gives the slot back when the caller disconnects mid-answer', async () => {
    const host = await start({ config: { maxConcurrent: 1 }, script: partialThenHangs, services: { sessionQuery } })
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port: host.port,
        method: 'POST',
        path: SIDE_CHAT_ROUTE,
        // A same-origin POST, as the panel sends it.
        headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${host.port}` },
      }, (res) => {
        res.once('data', () => {
          res.destroy()
          resolve()
        })
      })
      req.on('error', reject)
      req.end(ROUTED_BODY)
    })
    await waitFor(() => host.aborts() === 1)
    host.setScript(answers)
    const answer = await frames(host, { request: ROUTED })
    expect(answer.status).toBe(200)
    expect(answer.frames).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
      { type: 'done' },
    ])
  })
})

describe('the trust fence', () => {
  it('refuses exactly what the Host refuses', async () => {
    for (const status of [401, 403] as const) {
      const host = await start({ services: { connection: { requestRejection: () => status } } })
      const reply = await ask(host.port, { body: '{"question":"hi","history":[]}' })
      expect(reply.status, String(status)).toBe(status)
      expect(reply.text).toBe('')
      expect(host.calls).toHaveLength(0)
    }
  })

  it('hands the Host only headers, as its contract declares', async () => {
    const seen: unknown[] = []
    const host = await start({
      services: { connection: { requestRejection: (request: unknown) => { seen.push(request); return undefined } } },
    })
    await frames(host)
    expect(Object.keys(seen[0] as object)).toEqual(['headers'])
    const headers = (seen[0] as { headers: Record<string, unknown> }).headers
    expect(headers['content-type']).toBe('application/json')
    expect(headers['content-length']).toBeUndefined()
    expect(headers.host).toBe(`127.0.0.1:${host.port}`)
  })

  it('fails closed when the Host check itself throws', async () => {
    const host = await start({
      services: { connection: { requestRejection: () => { throw new Error('broken fence') } } },
    })
    const reply = await ask(host.port, { body: '{"question":"hi","history":[]}' })
    expect(reply.status).toBe(403)
    expect(host.calls).toHaveLength(0)
  })

  it('answers the panel and the desktop forwarder under the default policy', async () => {
    // Both real callers, in the shapes they actually arrive in: the web page's
    // same-origin POST, and the desktop app's forwarded request, which Electron
    // sends with the Host's cookie and — because it strips the header — no Origin.
    const host = await start({ services: { sessionQuery } })
    const webPage = await frames(host, { request: ROUTED })
    expect(webPage.status).toBe(200)
    expect(webPage.frames.at(-1)).toEqual({ type: 'done' })

    const desktop = await ask(host.port, { body: ROUTED_BODY, origin: null, headers: { cookie: 'dsh=token' } })
    expect(desktop.status).toBe(200)
    expect(decodeFrames(desktop.text).frames.at(-1)).toEqual({ type: 'done' })
    expect(host.calls).toHaveLength(2)
  })

  it('passes the Host\'s refusal of a request that carries no Origin', async () => {
    // The no-Origin branch defers to the Host's check, so a Host that refuses must
    // still be heard — the desktop cookie is not a bypass of it.
    for (const status of [401, 403] as const) {
      const host = await start({
        services: { sessionQuery, connection: { requestRejection: () => status } },
      })
      const bare = await ask(host.port, { body: ROUTED_BODY, origin: null, headers: { cookie: 'dsh=stale' } })
      expect(bare.status, String(status)).toBe(status)
      expect(bare.text).toBe('')
      expect(host.calls).toHaveLength(0)
    }
  })

  it('refuses a cross-site page under the default policy', async () => {
    const host = await start({ services: { sessionQuery } })
    for (const origin of ['https://evil.test', 'http://127.0.0.1:1', 'null']) {
      const reply = await ask(host.port, { body: ROUTED_BODY, headers: { origin } })
      expect(reply.status, origin).toBe(403)
    }
    expect(host.calls).toHaveLength(0)
  })

  it('refuses a caller from outside the machine under the default policy', async () => {
    // A remote peer cannot match the loopback requirement. The harness still binds
    // loopback, so this is checked where it is decided rather than over a socket.
    expect(decideTrust({
      mode: DEFAULT_TRUST,
      rejection: undefined,
      loopback: false,
      origin: 'http://127.0.0.1:19387',
      host: '127.0.0.1:19387',
    })).toEqual({ allowed: false, status: 403, basis: 'not-loopback' })
  })

  it('admits a local caller with no Origin once asked to defer to the Host', async () => {
    // The documented escape hatch for a browser that is not on this machine.
    const host = await start({ config: { trust: 'host' }, services: { sessionQuery } })
    const bare = await frames(host, { request: ROUTED, origin: null })
    expect(bare.status).toBe(200)
    expect(bare.frames.at(-1)).toEqual({ type: 'done' })
  })

  it('warns once when the Host admits a caller it never authenticated', async () => {
    const host = await start({ config: { trust: 'host' }, services: { sessionQuery } })
    expect((await frames(host, { request: ROUTED })).status).toBe(200)
    expect((await frames(host, { request: ROUTED })).status).toBe(200)
    const warnings = host.logs.filter(line => line.includes('does not authenticate the side-chat route'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('same-origin')
  })

  it('opens the route when the development switch says so, and config still outranks it', async () => {
    vi.stubEnv('DSH_SIDE_CHAT_ALLOW_LOOPBACK', '1')
    const open = await start({ services: { connection: { requestRejection: () => 401 } } })
    expect((await frames(open)).status).toBe(200)

    vi.stubEnv('DSH_SIDE_CHAT_ALLOW_LOOPBACK', '1')
    const pinned = await start({
      config: { trust: 'host' },
      services: { connection: { requestRejection: () => 401 } },
    })
    const reply = await ask(pinned.port, { body: '{"question":"hi","history":[]}' })
    expect(reply.status).toBe(401)
  })

  it('refuses an unknown trust value rather than guessing, and logs it', async () => {
    const host = await start({
      config: { trust: 'everyone' as unknown as Config['trust'] },
      services: { connection: { requestRejection: () => 401 } },
    })
    const reply = await ask(host.port, { body: '{"question":"hi","history":[]}' })
    expect(reply.status).toBe(401)
    expect(host.logs.some(line => line.includes('unknown trust'))).toBe(true)
  })
})

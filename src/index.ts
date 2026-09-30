/**
 * Side chat, Host half.
 *
 * One HTTP route, `POST /side-chat/ask`, that streams one answer back as
 * server-sent events. The route is deliberately stateless: the browser sends the
 * whole temporary conversation with each request, the Host only adds context
 * folded out of the Session the side chat was opened beside, and nothing is ever
 * written to a Session log or to disk. That is what makes the side chat
 * temporary — closing the app leaves no trace of it anywhere.
 *
 * The model call goes through the ordinary `llm` service, so whatever adapter,
 * route, and credentials the main conversation uses serve the side chat too.
 *
 * ## Who may call this route
 *
 * A side chat folds part of the user's own conversation into a model prompt, so
 * this route is not public. `Config.trust` decides who gets in:
 *
 * - `'same-origin'` — **the default**, and it decides in two directions:
 *   - a request **with** an `Origin` must name the very host it was addressed to.
 *     That admits the web page's own `fetch`, and refuses, with `403`, a page on
 *     another site (a cross-site `POST`, DNS rebinding) or an opaque
 *     `Origin: null`. A browser always sends `Origin` on a cross-site request and
 *     cannot be talked out of it, so this is a real fence for the browser.
 *   - a request **without** an `Origin` has no page behind it: the desktop app's
 *     Electron forwarder strips that header and re-adds only the Host's cookie,
 *     and a non-browser caller never sets one. Such a request is answered exactly
 *     as `trust: 'host'` would answer it — the Host's own `connection` check
 *     decides, and `undefined` (no authentication configured) admits it.
 *   So the desktop app and the web page both work, while a cross-site page never
 *   does — which is strictly more than `'host'` checks, since that mode looks at
 *   `Origin` not at all.
 *   **What it is not:** a local process can forge any header, so this is not a
 *   fence against a program that means to call this route — on a Harness without
 *   Connection authentication, a local program still gets in. What it stops is a
 *   web page using the user's browser, and accidental calls.
 * - `'host'` — defers entirely to the Harness' `connection` service:
 *   `requestRejection({ headers })` answers `401`/`403` to refuse and `undefined`
 *   to admit, whatever the `Origin` says. On the DSH versions measured here the
 *   Connection does require the signed browser credential, so a caller without
 *   it is refused — and because this mode never looks at `Origin`, a cross-site
 *   page that *does* carry a fresh credential would be admitted too. Only when
 *   Connection has no authentication configured does it answer `undefined` for
 *   every caller, admitting any process that can reach the port; that case logs
 *   one warning. Choose this mode to allow a cross-site page, or when another
 *   layer is already the trust boundary.
 * - `'open'` — skips every check: for a deployment that authenticates in front of
 *   the Harness, or for local development. Anyone who can reach the port gets in.
 *
 * Whatever the mode, this plugin cannot mint a credential of its own: anything it
 * wrote into the page could be read by the very local process it wants to keep
 * out. When `'host'` admits a caller on a Harness that never authenticated it,
 * the plugin logs one warning, so the situation is never silent.
 *
 * `DSH_SIDE_CHAT_ALLOW_LOOPBACK=1` keeps working as the development switch and
 * means `trust: 'open'`. An explicit `trust` in the profile always wins over it,
 * so a profile can pin its policy against the environment; the variable is read
 * once, when the plugin loads.
 *
 * ## Configuration
 *
 * The profile carries these under this entry's `config:` block. The module
 * exports a runtime Schemastery schema ({@link Config}, declared below), so the
 * Loader validates that block before `apply` runs — absent fields take the
 * documented defaults, and a value the schema refuses fails the plugin load with
 * a message naming the field instead of silently doing nothing — and the DSH
 * Config projection can render the fields for the user. Every field is
 * re-checked in `settingsOf` as well, because that is what stands between the
 * route and a value arriving by some other route (a test, a future Host, a
 * direct call).
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  buildPrompt,
  DEFAULT_CONTEXT_BUDGET,
  foldModelRoute,
  foldTranscript,
  type ContextBudget,
  type SessionEventLike,
} from './context.ts'
import { encodeFrame, SIDE_CHAT_ROUTE, type SideChatAskRequest, type SideChatFrame } from './protocol.ts'

/** Cordis plugin name. */
export const name = 'side-chat'

/** The route needs the web server; an answer needs a model route. */
export const inject = ['webServer', 'llm']

/** One token-level chunk of a model call, as this plugin reads it. */
interface LlmStreamChunk {
  readonly type: string
  readonly text?: string
  readonly reason?: {
    readonly kind?: string
    readonly failure?: { readonly message?: string, readonly code?: string, readonly status?: number }
  }
}

/** The slice of the `llm` service this plugin uses. */
interface LlmLike {
  stream(options: {
    readonly provider: string
    readonly model: string
    readonly system?: string
    readonly messages: readonly unknown[]
    /** The Session whose route is being used; adapters resolve request credentials from it. */
    readonly sessionId?: string
    readonly signal?: AbortSignal
  }): AsyncIterable<LlmStreamChunk>
}

/** The slice of the `webServer` service this plugin uses. */
interface WebServerLike {
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** The slice of the `sessionQuery` service this plugin uses. */
interface SessionQueryLike {
  readSession(sessionId: string): Promise<{ readonly events?: unknown }>
}

/** The Host's request trust check, exactly as the `connection` service declares it. */
interface ConnectionLike {
  requestRejection(request: { readonly headers: Record<string, string | string[] | undefined> }): 401 | 403 | undefined
}

/** The slice of the `agentDefaultModel` service this plugin uses. */
interface DefaultModelLike {
  currentSelection(): { readonly provider?: string, readonly model?: string }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    llm: LlmLike
    webServer: WebServerLike
  }
}

/** How the route decides whether a caller may use it. */
export type TrustMode = 'host' | 'same-origin' | 'open'

/** Every accepted {@link TrustMode}, for validation and documentation. */
export const TRUST_MODES: readonly TrustMode[] = ['host', 'same-origin', 'open']

/**
 * The policy an installation gets without saying anything.
 *
 * `'same-origin'` is the safe default: the browser half is the only intended
 * caller, and it always sends an `Origin` naming the page it runs on, so the
 * panel keeps working while a cross-site page and a bare local script do not.
 * See the module documentation for what it does and does not protect against,
 * and for the deployments that should choose `'host'` or `'open'` instead.
 */
export const DEFAULT_TRUST: TrustMode = 'same-origin'

/** Largest accepted request body, in bytes. */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024

/** Concurrent answers allowed across the whole Host. */
export const DEFAULT_MAX_CONCURRENT = 4

/**
 * Hard ceiling on one answer, in milliseconds.
 *
 * A wedged provider would otherwise hold its concurrency slot for the life of
 * the process; ten minutes is far beyond any answer a person waits for and still
 * guarantees the slot comes back. `0` disables the ceiling.
 */
export const DEFAULT_TIMEOUT_MS = 600_000

/** Longest selected text kept as context. */
export const MAX_SELECTION_CHARS = 8_000

/** Readable fallback shown when no model route can be resolved. */
export const NO_ROUTE_MESSAGE = 'Side chat cannot answer yet: no model is available. '
  + 'Open a conversation and send one message first, or set the provider and model in this plugin\'s '
  + 'configuration, then try again.'

/** Readable fallback shown when the Host carries no `llm` service. */
export const NO_MODEL_SERVICE_MESSAGE = 'This Harness has no model service for the side chat to use.'

/** Readable fallback shown when an answer passes its time limit. */
export const TIMEOUT_MESSAGE = 'The model did not finish in time, so this answer was stopped. '
  + 'You can raise the time limit in this plugin\'s settings.'

/** Readable fallback shown when something unexpected broke the turn. */
export const INTERNAL_ERROR_MESSAGE = 'The side chat ran into an unexpected problem and could not finish '
  + 'this answer. Please try again; if it keeps happening, check the Harness log.'

/**
 * Operator-tunable limits; every field has a working default.
 *
 * The profile carries these under this entry's `config:` block, and the Loader
 * validates that block against the runtime schema exported below before `apply`
 * runs. Because a value can still reach `apply` by another route, every field is
 * re-checked here too.
 */
export interface Config {
  /** Largest accepted request body, in bytes. Default `262144`. */
  readonly maxBodyBytes?: number
  /** Concurrent answers allowed across the whole Host. Default `4`. */
  readonly maxConcurrent?: number
  /** Most recent Session messages used as context when none are named. Default `20`. */
  readonly recentMessages?: number
  /** Longest single context message, in characters. Default `4000`. */
  readonly maxMessageChars?: number
  /** Longest whole context excerpt, in characters. Default `24000`. */
  readonly maxContextChars?: number
  /** Explicit model route override; absent follows the Session's own route. */
  readonly provider?: string
  readonly model?: string
  /**
   * Who may use the route: `'same-origin'` (the default), `'host'`, or `'open'`.
   *
   * `'same-origin'` refuses a cross-site `Origin` and otherwise defers to the
   * Host's own check, which is what makes the web page and the desktop app both
   * work — the desktop app's forwarded request carries no `Origin` at all. It is
   * not a fence against a local program that forges headers. Choose `'host'` to
   * skip the `Origin` comparison entirely, or `'open'` to skip every check. An
   * unrecognized value is refused by the schema, or falls back to the default with
   * a warning when it arrives by another route.
   */
  readonly trust?: TrustMode
  /** Hard ceiling on one answer, in milliseconds; `0` disables it. Default `600000`. */
  readonly timeoutMs?: number
}

/**
 * The runtime Config schema: what the Loader validates and what DSH projects.
 *
 * DSH's Config projection reports an entry only when its module exports a native
 * Schemastery schema — `Symbol.for('schemastery') === true`, a string `type`, and
 * a `meta` object — which is exactly what this export is. Without it the profile
 * block still reached `apply`, but nothing checked it and the plugin manager had
 * nothing to show; with it, `cordis.patch.yml` refuses a bad value with a message
 * naming the field, and the fields become visible configuration.
 *
 * Schemastery comes from `@deepseek-ai/schemastery`, the version the Cordis
 * Loader itself uses, and it is a `dependencies` entry rather than a dev one so
 * the package is honest about what it needs to build. **Nothing is required at
 * the user's end, though: `tsdown` inlines it into `lib/index.js`** (see
 * `INLINED_RUNTIME` in `tsdown.config.ts`), because a DSH profile has no reason
 * to hold Schemastery for a plugin's sake. The bare specifier is left in
 * `package.json` for the build, and the artifact imports nothing but its own
 * sibling module.
 */
export const Config = z.object({
  maxBodyBytes: z.natural().default(DEFAULT_MAX_BODY_BYTES)
    .description('Largest request body accepted, in bytes.'),
  maxConcurrent: z.natural().default(DEFAULT_MAX_CONCURRENT)
    .description('How many answers may run at once across the whole Harness.'),
  recentMessages: z.natural().default(DEFAULT_CONTEXT_BUDGET.recentMessages)
    .description('How many recent main-conversation messages become context when none are named.'),
  maxMessageChars: z.natural().default(DEFAULT_CONTEXT_BUDGET.maxMessageChars)
    .description('Longest single context message kept, in characters.'),
  maxContextChars: z.natural().default(DEFAULT_CONTEXT_BUDGET.maxContextChars)
    .description('Longest whole context excerpt kept, in characters.'),
  provider: z.string()
    .description('Model provider used for every answer; omit to follow the conversation you asked from.'),
  model: z.string()
    .description('Model id used for every answer; omit to follow the conversation you asked from.'),
  /**
   * Deliberately without `.default()`.
   *
   * The development switch `DSH_SIDE_CHAT_ALLOW_LOOPBACK=1` selects `'open'`
   * only while the profile says nothing about trust. A schema default would
   * materialize the default into every config block and silently outrank that
   * switch; the default lives in {@link DEFAULT_TRUST} and in this description
   * instead.
   */
  trust: z.union([z.const('host'), z.const('same-origin'), z.const('open')])
    .description('Who may call the route. same-origin (the default) refuses a cross-site Origin and otherwise defers '
      + 'to the Host\'s own check; host defers entirely to that check; open skips every check.'),
  timeoutMs: z.natural().default(DEFAULT_TIMEOUT_MS)
    .description('Hard ceiling on one answer, in milliseconds; 0 disables it.'),
})

/** One resolved model route. */
export interface ModelRoute {
  readonly provider: string
  readonly model: string
}

/** Everything the route needs, resolved once from operator config. */
export interface Settings {
  readonly maxBodyBytes: number
  readonly maxConcurrent: number
  readonly timeoutMs: number
  readonly trust: TrustMode
  /** Where {@link Settings.trust} came from, so the plugin can log the policy it runs. */
  readonly trustSource: 'config' | 'environment' | 'default'
  readonly budget: ContextBudget
  /** The `provider`/`model` override from config, when both are usable. */
  readonly route: ModelRoute | undefined
}

/** A counting integer, or the fallback when the configured value is unusable. */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/** A non-negative integer, or the fallback. */
function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

/** A usable non-empty string, or `undefined`. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/** Read a configured trust policy, or `undefined` for a missing or unusable one. */
export function normalizeTrust(value: unknown): TrustMode | undefined {
  if (typeof value !== 'string') return undefined
  return TRUST_MODES.find(mode => mode === value)
}

/**
 * Resolve operator config into the values one route instance runs with.
 * @param config - the profile's `config:` block, of unverified shape.
 * @param options - `allowLoopback` mirrors the development switch.
 * @returns bounded numbers, the effective trust policy, and an optional route.
 */
export function settingsOf(config: Config = {}, options: { readonly allowLoopback?: boolean } = {}): Settings {
  const configured = normalizeTrust(config.trust)
  const trust = configured ?? (options.allowLoopback === true ? 'open' : DEFAULT_TRUST)
  const trustSource = configured !== undefined ? 'config' : options.allowLoopback === true ? 'environment' : 'default'
  const provider = text(config.provider)
  const model = text(config.model)
  return {
    maxBodyBytes: positiveInt(config.maxBodyBytes, DEFAULT_MAX_BODY_BYTES),
    maxConcurrent: positiveInt(config.maxConcurrent, DEFAULT_MAX_CONCURRENT),
    timeoutMs: nonNegativeInt(config.timeoutMs, DEFAULT_TIMEOUT_MS),
    trust,
    trustSource,
    budget: {
      recentMessages: nonNegativeInt(config.recentMessages, DEFAULT_CONTEXT_BUDGET.recentMessages),
      maxMessageChars: nonNegativeInt(config.maxMessageChars, DEFAULT_CONTEXT_BUDGET.maxMessageChars),
      maxContextChars: nonNegativeInt(config.maxContextChars, DEFAULT_CONTEXT_BUDGET.maxContextChars),
    },
    route: provider !== undefined && model !== undefined ? { provider, model } : undefined,
  }
}

/** One caller's request, as the trust policy reads it. */
export interface TrustInput {
  /** The effective policy. */
  readonly mode: TrustMode
  /** What the Host's `connection` service answered, or `undefined` when it admitted the request. */
  readonly rejection: 401 | 403 | undefined
  /** Whether the request arrived over the loopback interface. */
  readonly loopback: boolean
  /** The request's `Origin` header, when it carried one. */
  readonly origin: string | undefined
  /** The request's `Host` header, when it carried one. */
  readonly host: string | undefined
}

/** The outcome of applying {@link TrustInput}. */
export type TrustDecision =
  | { readonly allowed: true, readonly basis: 'open' | 'host-accepted' | 'host-authenticated' | 'same-origin' }
  | {
      readonly allowed: false
      readonly status: 401 | 403
      readonly basis: 'host-rejection' | 'not-loopback' | 'origin-opaque' | 'origin-mismatch'
    }

/** Whether unauthenticated loopback callers are accepted by the development switch. */
function allowsLoopback(): boolean {
  return process.env.DSH_SIDE_CHAT_ALLOW_LOOPBACK === '1'
}

/**
 * Whether the request arrived over the loopback interface.
 *
 * Loopback is not a trust boundary on a shared machine: any local process can
 * reach this port, and this route can fold the user's own conversation into a
 * model answer. What actually keeps those processes out is the Host's own
 * credential — measured: a request without it is refused (401) before this route
 * is reached. The plugin's `trust` policy is the layer *after* that: `'host'`
 * leaves the decision entirely to Connection, and `'same-origin'` additionally
 * refuses a cross-site `Origin` and a non-loopback caller.
 */
export function isLoopback(req: IncomingMessage): boolean {
  const address = req.socket?.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Split a `Host`-style authority into a lowercased hostname and an explicit port. */
function splitAuthority(value: string): { readonly hostname: string, readonly port: string | undefined } | undefined {
  const text = value.trim()
  if (text.length === 0) return undefined
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    if (end < 0) return undefined
    const hostname = text.slice(1, end).toLowerCase()
    const rest = text.slice(end + 1)
    if (rest.length === 0) return { hostname, port: undefined }
    return rest.startsWith(':') ? { hostname, port: rest.slice(1) } : undefined
  }
  const colon = text.lastIndexOf(':')
  if (colon < 0) return { hostname: text.toLowerCase(), port: undefined }
  // A second colon means an unbracketed IPv6 literal, which a Host header may not carry.
  if (text.indexOf(':') !== colon) return undefined
  return { hostname: text.slice(0, colon).toLowerCase(), port: text.slice(colon + 1) }
}

/**
 * Whether an `Origin` header names the very authority the request was addressed to.
 *
 * Deliberately scheme-agnostic: the comparison is over hostname and effective
 * port, so `https://127.0.0.1:19387` matches a `Host` of `127.0.0.1:19387`. That
 * is intentional, not an oversight. What this check bounds is *which page* may
 * speak to the route — a browser puts its own origin in the header and cannot be
 * talked out of it — and a differing scheme does not give an attacker anything a
 * matching scheme would not: the `Host` header carries no scheme to compare
 * against, and a local process that can forge one header can forge the other
 * too. Requiring a scheme match would only reject honest callers behind a
 * TLS-terminating proxy.
 * @param origin - the request's `Origin`, as a URL.
 * @param hostHeader - the request's `Host`.
 * @returns true only for an http(s) origin whose hostname and effective port match.
 */
export function sameOrigin(origin: string, hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const expected = splitAuthority(hostHeader)
  if (expected === undefined) return false
  const fallbackPort = url.protocol === 'https:' ? '443' : '80'
  const urlHost = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  if (expected.hostname !== urlHost) return false
  return (expected.port ?? fallbackPort) === (url.port.length > 0 ? url.port : fallbackPort)
}

/**
 * Apply one trust policy to one request. Pure: every input is a value.
 *
 * `'same-origin'` reads the `Origin` header when there is one and defers to the
 * Host when there is not, in this order:
 *
 * 1. a Host rejection outranks everything;
 * 2. no `Origin` — the desktop app's Electron forwarder strips it and re-adds
 *    only the Host's cookie, and a non-browser caller never sends one — so the
 *    Host's own answer, already folded into {@link TrustInput.rejection}, is the
 *    authentication decision;
 * 3. an opaque `Origin: null` (a sandboxed iframe, a `data:` page) is refused;
 * 4. an `Origin` that does not name the addressed authority is refused — a
 *    cross-site page always sends its own, and cannot be talked out of it;
 * 5. otherwise the request is the panel's own.
 *
 * Step 2 is why the desktop app works at all, and it is still stricter than
 * `'host'`: that mode never looks at `Origin`, so it accepts a cross-site page
 * whenever the Host has no authentication configured. This one does not.
 * @param input - the policy, the Host's answer, and the headers the policy reads.
 * @returns whether the request may proceed, and on what basis.
 */
export function decideTrust(input: TrustInput): TrustDecision {
  if (input.mode === 'open') return { allowed: true, basis: 'open' }
  // A Host that answers at all outranks every plugin-side policy: its 401/403 is
  // the Harness' own authentication talking.
  if (input.rejection !== undefined) return { allowed: false, status: input.rejection, basis: 'host-rejection' }
  if (input.mode === 'host') return { allowed: true, basis: 'host-accepted' }
  if (!input.loopback) return { allowed: false, status: 403, basis: 'not-loopback' }
  if (input.origin === undefined) return { allowed: true, basis: 'host-authenticated' }
  if (input.origin.trim().toLowerCase() === 'null') return { allowed: false, status: 403, basis: 'origin-opaque' }
  if (!sameOrigin(input.origin, input.host)) return { allowed: false, status: 403, basis: 'origin-mismatch' }
  return { allowed: true, basis: 'same-origin' }
}

/** Read one single-valued header as text. */
function headerText(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const first = value[0]
    if (typeof first === 'string') return first
  }
  return undefined
}

/**
 * Ask the Host whether this request may reach the route.
 *
 * The contract is headers-only, so only headers are handed over. A check that
 * throws refuses the request: an unknown answer from the trust fence must not
 * read as an admission.
 */
function hostRejection(connection: unknown, req: IncomingMessage): 401 | 403 | undefined {
  if (connection === null || connection === undefined) return undefined
  const check = (connection as Partial<ConnectionLike>).requestRejection
  if (typeof check !== 'function') return undefined
  try {
    const answer = check.call(connection, { headers: req.headers })
    return answer === 401 || answer === 403 ? answer : undefined
  } catch {
    return 403
  }
}

/** Whether the request carries the JSON essence this route accepts. */
function isJson(req: IncomingMessage): boolean {
  const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return essence === 'application/json'
}

/** Why a body could not be used. */
type BodyFailure = 'too-large' | 'aborted'

/** One request body, or why it was refused. */
type BodyResult = { readonly ok: true, readonly text: string } | { readonly ok: false, readonly reason: BodyFailure }

/**
 * Read and bound a request body.
 *
 * A body over the limit stops the read immediately — the request is paused
 * rather than drained, so an oversized upload cannot spend the Host's bandwidth
 * — and the caller answers `413` while the connection is closed. A declared
 * `content-length` above the limit is refused without reading a byte.
 * @param req - the incoming request.
 * @param limit - largest body accepted, in bytes.
 * @returns the body text, or the reason it was refused.
 */
export function readBody(req: IncomingMessage, limit: number): Promise<BodyResult> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ ok: false, reason: 'too-large' })
      return
    }
    if (req.readableEnded) {
      resolve({ ok: true, text: '' })
      return
    }
    if (req.destroyed) {
      resolve({ ok: false, reason: 'aborted' })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (result: BodyResult): void => {
      if (settled) return
      settled = true
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onAborted)
      req.off('close', onClose)
      resolve(result)
    }
    const onData = (chunk: Buffer | string): void => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buffer.byteLength
      if (size > limit) {
        req.pause()
        settle({ ok: false, reason: 'too-large' })
        return
      }
      chunks.push(buffer)
    }
    const onEnd = (): void => { settle({ ok: true, text: Buffer.concat(chunks).toString('utf8') }) }
    const onError = (): void => { settle({ ok: false, reason: 'aborted' }) }
    const onAborted = (): void => { settle({ ok: false, reason: 'aborted' }) }
    const onClose = (): void => { settle({ ok: false, reason: 'aborted' }) }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('aborted', onAborted)
    req.on('close', onClose)
  })
}

/** Parse one request body into this route's request shape. */
export function parseRequest(body: string): SideChatAskRequest | undefined {
  let value: unknown
  try {
    value = JSON.parse(body) as unknown
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as {
    question?: unknown
    history?: unknown
    sessionId?: unknown
    messageIds?: unknown
    selection?: unknown
    model?: unknown
  }
  const question = text(record.question)
  if (question === undefined) return undefined
  const history: { role: 'user' | 'assistant', text: string }[] = []
  if (Array.isArray(record.history)) {
    for (const turn of record.history) {
      if (turn === null || typeof turn !== 'object') continue
      const candidate = turn as { role?: unknown, text?: unknown }
      if ((candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.text === 'string') {
        history.push({ role: candidate.role, text: candidate.text })
      }
    }
  }
  const messageIds = Array.isArray(record.messageIds)
    ? record.messageIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined
  const sessionId = text(record.sessionId)
  const selection = typeof record.selection === 'string' ? record.selection : undefined
  const model = record.model === null || typeof record.model !== 'object' ? undefined : record.model
  const provider = model === undefined ? undefined : text((model as { provider?: unknown }).provider)
  const modelId = model === undefined ? undefined : text((model as { model?: unknown }).model)
  return {
    question,
    history,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(messageIds !== undefined && messageIds.length > 0 ? { messageIds } : {}),
    ...(selection !== undefined && selection.trim().length > 0
      ? { selection: selection.slice(0, MAX_SELECTION_CHARS) }
      : {}),
    ...(provider !== undefined && modelId !== undefined ? { model: { provider, model: modelId } } : {}),
  }
}

/** Read one Session's logged events, or an empty log when it cannot be read. */
async function readSessionEvents(ctx: Context, sessionId: string | undefined): Promise<readonly SessionEventLike[]> {
  if (sessionId === undefined || sessionId.length === 0) return []
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  if (query === null || query === undefined || typeof query.readSession !== 'function') return []
  try {
    const snapshot = await query.readSession(sessionId)
    return Array.isArray(snapshot?.events) ? snapshot.events as SessionEventLike[] : []
  } catch (error: unknown) {
    ctx.logger?.warn?.(`side-chat: could not read session ${sessionId}`)
    ctx.logger?.warn?.(error)
    return []
  }
}

/** The Host's default model selection, when one is configured and readable. */
function defaultModelRoute(ctx: Context): ModelRoute | undefined {
  let defaults: DefaultModelLike | undefined
  try {
    defaults = ctx.get('agentDefaultModel') as DefaultModelLike | undefined
  } catch (error: unknown) {
    ctx.logger?.warn?.('side-chat: could not read agentDefaultModel')
    ctx.logger?.warn?.(error)
    return undefined
  }
  if (defaults === null || defaults === undefined || typeof defaults.currentSelection !== 'function') {
    return undefined
  }
  try {
    const selection = defaults.currentSelection()
    const provider = text(selection?.provider)
    const model = text(selection?.model)
    return provider !== undefined && model !== undefined ? { provider, model } : undefined
  } catch (error: unknown) {
    ctx.logger?.warn?.('side-chat: agentDefaultModel has no selection')
    ctx.logger?.warn?.(error)
    return undefined
  }
}

/**
 * Resolve the model route for one answer: an explicit override wins, then the
 * route the side-chatted Session itself last used, then the Host default.
 * @param ctx - Host context carrying the optional default-model service.
 * @param settings - the resolved `provider`/`model` override, if any.
 * @param request - the caller's request.
 * @param events - the Session log already read for this request.
 * @returns the route, or `undefined` when this Host cannot offer one.
 */
function resolveRoute(
  ctx: Context,
  settings: Settings,
  request: SideChatAskRequest,
  events: readonly SessionEventLike[],
): ModelRoute | undefined {
  if (request.model !== undefined) return request.model
  if (settings.route !== undefined) return settings.route
  const fromSession = foldModelRoute(events)
  if (fromSession !== undefined) return fromSession
  return defaultModelRoute(ctx)
}

/** Render prompt messages as the provider call's request messages. */
function toRequestMessages(
  messages: readonly { readonly role: 'user' | 'assistant', readonly content: string }[],
  route: ModelRoute,
): unknown[] {
  return messages.map((message, index) => message.role === 'user'
    ? { role: 'user', content: [{ type: 'text', text: message.content }] }
    : {
        id: `side-chat-${index}`,
        role: 'assistant',
        source: { kind: 'model', provider: route.provider, model: route.model },
        content: [{ type: 'text', text: message.content }],
      })
}

/** The name the context excerpt prints for messages the user wrote. */
const USER_LABEL = 'User'

/** Start one SSE response. */
function openStream(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
}

/** One answer's writes, made safe against a response that already finished. */
type FrameWriter = (frame: SideChatFrame) => void

/**
 * Answer one request, streaming frames until the turn settles.
 *
 * Every exit — a missing route, a provider failure, the time limit, an
 * unexpected throw — ends with exactly one `done` frame, and nothing is ever
 * written to a response that has already ended.
 * @param ctx - Host context carrying the model service.
 * @param settings - the resolved limits and route override.
 * @param request - the caller's request.
 * @param events - the Session log already read for this request.
 * @param res - the response being streamed.
 * @param outer - aborted when the caller goes away.
 */
async function answer(
  ctx: Context,
  settings: Settings,
  request: SideChatAskRequest,
  events: readonly SessionEventLike[],
  res: ServerResponse,
  outer: AbortSignal,
): Promise<void> {
  const write: FrameWriter = (frame) => {
    if (res.writableEnded || res.destroyed) return
    res.write(encodeFrame(frame))
  }
  const controller = new AbortController()
  const onOuterAbort = (): void => { controller.abort() }
  if (outer.aborted) controller.abort()
  else outer.addEventListener('abort', onOuterAbort, { once: true })
  let timedOut = false
  const timer = settings.timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true
        controller.abort()
      }, settings.timeoutMs)
    : undefined
  timer?.unref?.()

  let reported = false
  try {
    const llm = ctx.get('llm') as LlmLike | undefined
    if (llm === null || llm === undefined || typeof llm.stream !== 'function') {
      ctx.logger?.warn?.('side-chat: this Host has no llm service')
      reported = true
      write({ type: 'error', code: 'model-service-missing', message: NO_MODEL_SERVICE_MESSAGE })
      return
    }
    const route = resolveRoute(ctx, settings, request, events)
    if (route === undefined) {
      reported = true
      write({ type: 'error', code: 'model-route-missing', message: NO_ROUTE_MESSAGE })
      return
    }
    if (controller.signal.aborted) return

    const context = foldTranscript(events, {
      ...(request.messageIds !== undefined ? { messageIds: request.messageIds } : {}),
      budget: settings.budget,
    })
    const prompt = buildPrompt({
      question: request.question,
      history: request.history,
      context,
      ...(request.selection !== undefined ? { selection: request.selection } : {}),
      userLabel: USER_LABEL,
    })

    let answered = false
    let finished = false
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system: prompt.system,
      messages: toRequestMessages(prompt.messages, route),
      ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text.length > 0) {
        answered = true
        write({ type: 'text', text: chunk.text })
        continue
      }
      if (chunk.type === 'finish') {
        finished = true
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          const failure = chunk.reason?.failure
          // The provider's message can echo request text, so only its code and
          // status reach the Host log; the user sees the message in their own
          // panel, where it belongs.
          const where = [failure?.code ?? 'unknown', failure?.status === undefined ? undefined : `HTTP ${failure.status}`]
            .filter((part): part is string => part !== undefined)
            .join(', ')
          ctx.logger?.warn?.(`side-chat: model call failed (${kind}; ${where})`)
          if (timedOut) {
            reported = true
            write({ type: 'error', code: 'request-timeout', message: TIMEOUT_MESSAGE })
          } else if (!outer.aborted) {
            reported = true
            write({
              type: 'error',
              code: 'model-failed',
              message: String(failure?.message ?? failure?.code ?? kind),
            })
          }
        } else if (!answered) {
          write({ type: 'notice', text: 'The model returned no text for this question.' })
        }
      }
    }
    // An adapter that honours the signal may end its stream without a `finish`
    // frame; the time limit still has to be reported, and a stream that produced
    // nothing at all still has to say so.
    if (!reported && timedOut) {
      ctx.logger?.warn?.('side-chat: answer passed its time limit')
      reported = true
      write({ type: 'error', code: 'request-timeout', message: TIMEOUT_MESSAGE })
    } else if (!reported && !finished && !answered && !outer.aborted) {
      write({ type: 'notice', text: 'The model returned no text for this question.' })
    }
  } catch (error: unknown) {
    if (timedOut) {
      ctx.logger?.warn?.('side-chat: answer passed its time limit')
      if (!reported) write({ type: 'error', code: 'request-timeout', message: TIMEOUT_MESSAGE })
    } else if (!outer.aborted) {
      ctx.logger?.warn?.('side-chat: answer failed')
      ctx.logger?.warn?.(error)
      if (!reported) write({ type: 'error', code: 'internal-error', message: INTERNAL_ERROR_MESSAGE })
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    outer.removeEventListener('abort', onOuterAbort)
    write({ type: 'done' })
    if (!res.writableEnded && !res.destroyed) res.end()
  }
}

/**
 * One log line for the case the default policy cannot cover.
 *
 * `trust: 'host'` is the only mode that reaches this: `same-origin` sends a
 * request without an `Origin` back through the Host's own check, so it is only
 * reached here when that check had no opinion at all — a Host with no
 * authentication configured. Then, and only then, any process that can reach the
 * port is admitted.
 */
const NO_FENCE_WARNING = 'side-chat: this Host does not authenticate the side-chat route '
  + '(connection.requestRejection returned undefined), so under trust: "host" any process that can '
  + 'reach the local web server can use it. Refuse cross-site browser calls too with '
  + 'trust: "same-origin", or accept it deliberately with trust: "open".'

/**
 * Mount the side-chat route.
 * @param ctx - Host context carrying the web server and the model service.
 * @param config - operator limits, the trust policy, and the optional model override.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const settings = settingsOf(config, { allowLoopback: allowsLoopback() })
  if (normalizeTrust(config.trust) === undefined && config.trust !== undefined) {
    ctx.logger?.warn?.(`side-chat: unknown trust ${JSON.stringify(config.trust)}; using ${settings.trust}`)
  }
  ctx.logger?.info?.(`side-chat: trust=${settings.trust} (${settings.trustSource})`)
  let active = 0
  let warnedNoFence = false

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // A client that vanishes mid-answer must not raise an uncaught stream error.
    res.on('error', () => {})
    if (res.writableEnded || res.destroyed) return

    const connection = ctx.get('connection')
    const decision = decideTrust({
      mode: settings.trust,
      rejection: hostRejection(connection, req),
      loopback: isLoopback(req),
      origin: headerText(req, 'origin'),
      host: headerText(req, 'host'),
    })
    if (!decision.allowed) {
      res.statusCode = decision.status
      res.end()
      return
    }
    if (decision.basis === 'host-accepted' && !warnedNoFence) {
      warnedNoFence = true
      ctx.logger?.warn?.(NO_FENCE_WARNING)
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'method-not-allowed' }))
      return
    }
    if (!isJson(req)) {
      res.writeHead(415, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'content-type must be application/json' }))
      return
    }
    if (active >= settings.maxConcurrent) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'too-many-side-chats' }))
      return
    }
    const body = await readBody(req, settings.maxBodyBytes)
    if (!body.ok) {
      if (body.reason === 'aborted') {
        // The caller stopped sending: nothing to read, nothing to answer.
        if (!res.writableEnded) {
          res.statusCode = 400
          res.end()
        }
        return
      }
      res.writeHead(413, { connection: 'close', 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'body-too-large' }))
      return
    }
    const request = parseRequest(body.text)
    if (request === undefined) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalid-request' }))
      return
    }

    const controller = new AbortController()
    const onClose = (): void => {
      if (!res.writableEnded) controller.abort()
    }
    res.on('close', onClose)
    openStream(res)
    active += 1
    try {
      const events = await readSessionEvents(ctx, request.sessionId)
      await answer(ctx, settings, request, events, res, controller.signal)
    } catch (error: unknown) {
      ctx.logger?.warn?.('side-chat: request failed')
      ctx.logger?.warn?.(error)
      if (!res.writableEnded) res.end()
    } finally {
      active -= 1
      res.off('close', onClose)
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SIDE_CHAT_ROUTE,
    handler,
  }), `side-chat: POST ${SIDE_CHAT_ROUTE}`)
}

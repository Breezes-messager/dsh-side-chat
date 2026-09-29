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
 */
import type { Context } from '@deepseek-ai/cordis'
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
  readonly reason?: { readonly kind?: string, readonly failure?: { readonly message?: string, readonly code?: string } }
}

/** The slice of the `llm` service this plugin uses. */
interface LlmLike {
  stream(options: {
    readonly provider: string
    readonly model: string
    readonly system?: string
    readonly messages: readonly unknown[]
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

/** The slice of the `connection` service this plugin uses. */
interface ConnectionLike {
  requestRejection(req: IncomingMessage): number | undefined
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

/** Operator-tunable limits; every field has a working default. */
export interface Config {
  /** Largest accepted request body, in bytes. */
  readonly maxBodyBytes?: number
  /** Concurrent answers allowed across the whole Host. */
  readonly maxConcurrent?: number
  /** Most recent Session messages used as context when none are named. */
  readonly recentMessages?: number
  /** Longest single context message, in characters. */
  readonly maxMessageChars?: number
  /** Longest whole context excerpt, in characters. */
  readonly maxContextChars?: number
  /** Explicit model route override; absent follows the Session's own route. */
  readonly provider?: string
  readonly model?: string
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024
const DEFAULT_MAX_CONCURRENT = 4

/** Read and bound a request body; `undefined` when the client sent too much. */
async function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer
    size += buffer.byteLength
    if (size > limit) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Whether the request carries the JSON essence this route accepts. */
function isJson(req: IncomingMessage): boolean {
  const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return essence === 'application/json'
}

/** Parse one request body into this route's request shape. */
function parseRequest(text: string): SideChatAskRequest | undefined {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  const record = value as {
    question?: unknown
    history?: unknown
    sessionId?: unknown
    messageIds?: unknown
    model?: unknown
  }
  if (typeof record.question !== 'string' || record.question.trim().length === 0) return undefined
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
    ? record.messageIds.filter((id): id is string => typeof id === 'string')
    : undefined
  const request: SideChatAskRequest = {
    question: record.question,
    history,
    ...(typeof record.sessionId === 'string' ? { sessionId: record.sessionId } : {}),
    ...(messageIds !== undefined && messageIds.length > 0 ? { messageIds } : {}),
    ...(record.model !== undefined
      && typeof (record.model as { provider?: unknown }).provider === 'string'
      && typeof (record.model as { model?: unknown }).model === 'string'
      ? { model: record.model as { provider: string, model: string } }
      : {}),
  }
  return request
}

/** Read one Session's logged events, or an empty log when it cannot be read. */
async function readSessionEvents(ctx: Context, sessionId: string | undefined): Promise<readonly SessionEventLike[]> {
  if (sessionId === undefined || sessionId.length === 0) return []
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  if (query === undefined || typeof query.readSession !== 'function') return []
  try {
    const snapshot = await query.readSession(sessionId)
    return Array.isArray(snapshot.events) ? snapshot.events as SessionEventLike[] : []
  } catch (error: unknown) {
    ctx.logger?.warn?.(`side-chat: could not read session ${sessionId}`)
    ctx.logger?.warn?.(error)
    return []
  }
}

/**
 * Resolve the model route for one answer: an explicit override wins, then the
 * route the side-chatted Session itself last used, then the Host default.
 */
async function resolveRoute(
  ctx: Context,
  config: Config,
  request: SideChatAskRequest,
): Promise<{ provider: string, model: string } | undefined> {
  if (request.model !== undefined) return request.model
  if (config.provider !== undefined && config.model !== undefined) {
    return { provider: config.provider, model: config.model }
  }
  const events = await readSessionEvents(ctx, request.sessionId)
  const fromSession = foldModelRoute(events)
  if (fromSession !== undefined) return fromSession
  const defaults = ctx.get('agentDefaultModel') as DefaultModelLike | undefined
  const selection = defaults?.currentSelection?.()
  if (typeof selection?.provider === 'string' && typeof selection.model === 'string') {
    return { provider: selection.provider, model: selection.model }
  }
  return undefined
}

/** Render prompt messages as the provider call's request messages. */
function toRequestMessages(
  messages: readonly { readonly role: 'user' | 'assistant', readonly content: string }[],
  route: { readonly provider: string, readonly model: string },
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

/** Answer one request, streaming frames until the turn settles. */
async function answer(
  ctx: Context,
  config: Config,
  request: SideChatAskRequest,
  res: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  const frame = (value: SideChatFrame): void => { res.write(encodeFrame(value)) }
  const route = await resolveRoute(ctx, config, request)
  if (route === undefined) {
    frame({
      type: 'error',
      message: 'No model route is available for the side chat. Open a conversation first, or set provider/model in the plugin config.',
    })
    frame({ type: 'done' })
    res.end()
    return
  }

  const budget: ContextBudget = {
    recentMessages: config.recentMessages ?? DEFAULT_CONTEXT_BUDGET.recentMessages,
    maxMessageChars: config.maxMessageChars ?? DEFAULT_CONTEXT_BUDGET.maxMessageChars,
    maxContextChars: config.maxContextChars ?? DEFAULT_CONTEXT_BUDGET.maxContextChars,
  }
  const events = await readSessionEvents(ctx, request.sessionId)
  const context = foldTranscript(events, {
    ...(request.messageIds !== undefined ? { messageIds: request.messageIds } : {}),
    budget,
  })
  const prompt = buildPrompt({
    question: request.question,
    history: request.history,
    context,
    userLabel: USER_LABEL,
  })

  let answered = false
  try {
    const stream = ctx.llm.stream({
      provider: route.provider,
      model: route.model,
      system: prompt.system,
      messages: toRequestMessages(prompt.messages, route),
      signal,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text.length > 0) {
        answered = true
        frame({ type: 'text', text: chunk.text })
        continue
      }
      if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          const detail = chunk.reason?.failure?.message ?? chunk.reason?.failure?.code ?? kind
          frame({ type: 'error', message: String(detail) })
        } else if (!answered) {
          frame({ type: 'notice', text: 'The model returned no text for this question.' })
        }
      }
    }
  } catch (error: unknown) {
    frame({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  frame({ type: 'done' })
  res.end()
}

/**
 * Mount the side-chat route.
 * @param ctx - Host context carrying the web server and the model service.
 * @param config - operator limits and the optional model override.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const maxConcurrent = config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
  let active = 0

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const connection = ctx.get('connection') as ConnectionLike | undefined
    const rejection = connection?.requestRejection?.(req)
    if (typeof rejection === 'number') {
      res.statusCode = rejection
      res.end()
      return
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
    if (active >= maxConcurrent) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'too-many-side-chats' }))
      return
    }
    const body = await readBody(req, maxBodyBytes)
    if (body === undefined) {
      res.writeHead(413, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'body-too-large' }))
      return
    }
    const request = parseRequest(body)
    if (request === undefined) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalid-request' }))
      return
    }

    const controller = new AbortController()
    const onClose = (): void => { controller.abort() }
    res.on('close', onClose)
    openStream(res)
    active += 1
    try {
      await answer(ctx, config, request, res, controller.signal)
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

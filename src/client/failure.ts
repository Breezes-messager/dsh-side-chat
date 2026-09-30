/**
 * Turning a failed request into something a person can act on.
 *
 * A side chat fails for a handful of reasons that mean very different things to
 * the reader — no model is configured, the app is not running any more, too many
 * questions at once — and none of them is legible as `500 Internal Server Error`
 * or as a raw JSON body. This module is the single place that decides which
 * situation a failure is; the panel turns the code into localized copy and the
 * raw reason into a smaller second line.
 *
 * Pure and dependency-free (no DOM), so every branch is unit-tested.
 */
import type { SideChatErrorCode } from '../protocol.ts'
import { SideChatRequestError } from './transport.ts'

/**
 * The situations a turn can fail in.
 *
 * These are the codes the copy table is keyed by; adding one without adding its
 * copy is a compile error in `locales.ts`, not a raw code on screen.
 */
export type SideChatFailureCode =
  /** The app could not be reached at all: it is closing, or the page is offline. */
  | 'network'
  /** The user pressed Stop, or the panel closed mid-answer. */
  | 'cancelled'
  /** 401/403: the app refused this request. */
  | 'unauthorized'
  /** 429: too many answers at once. */
  | 'rate-limited'
  /** 413: the question, history, or selection was larger than the app accepts. */
  | 'too-long'
  /** 400/415: the request was rejected as malformed. */
  | 'bad-request'
  /** 404/405: the answering route is not mounted (the plugin's other half is missing). */
  | 'not-found'
  /** The app reached the model but has no route to use: no conversation, no default model. */
  | 'not-configured'
  /** The app has no model service at all, so nothing can answer. */
  | 'service-missing'
  /** The answer ran past the app's own time limit and was stopped. */
  | 'timeout'
  /** 5xx, or a status this plugin does not know: the app itself went wrong. */
  | 'server'
  /** The answer itself broke: the provider failed, or the app raised an error frame. */
  | 'host-error'
  /** The turn ended without any text. */
  | 'empty'

/** One classified failure: a situation plus the raw reason, when there is one. */
export interface SideChatFailure {
  readonly code: SideChatFailureCode
  /** The untranslated reason, shown as a smaller second line; absent when it adds nothing. */
  readonly detail?: string
}

/** Longest raw reason worth printing under the friendly line. */
const MAX_DETAIL_CHARS = 240

/** Reasons the app's own error envelope carries that the headline already says. */
const ENVELOPE_CODES = new Set([
  'too-many-side-chats',
  'body-too-large',
  'invalid-request',
  'method-not-allowed',
  'content-type must be application/json',
])

/**
 * Reduce a raw reason to what is worth showing a person.
 * @param detail - the response body, or a provider message.
 * @returns the printable reason, or `undefined` when it says nothing new.
 */
export function readableDetail(detail: string): string | undefined {
  const text = detail.trim()
  if (text.length === 0) return undefined
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown }
      const code = typeof parsed.error === 'string' ? parsed.error : undefined
      // The app answers its own refusals as `{"error":"..."}`; the headline for
      // the status already says the same thing in the reader's language.
      if (code !== undefined && ENVELOPE_CODES.has(code)) return undefined
    } catch {
      // Not JSON after all; fall through and show it as text.
    }
  }
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…` : text
}

/** Assemble a failure, dropping a detail that adds nothing. */
function failure(code: SideChatFailureCode, detail: string | undefined): SideChatFailure {
  const readable = detail === undefined ? undefined : readableDetail(detail)
  return readable === undefined ? { code } : { code, detail: readable }
}

/**
 * Classify the HTTP status of a refused request.
 * @param status - the response status.
 * @param detail - the response body, when there was one.
 * @returns the failure to show.
 */
export function classifyStatus(status: number, detail?: string): SideChatFailure {
  if (status === 401 || status === 403) return failure('unauthorized', detail)
  if (status === 404 || status === 405) return failure('not-found', detail)
  if (status === 413) return failure('too-long', detail)
  if (status === 400 || status === 415) return failure('bad-request', detail)
  if (status === 429) return failure('rate-limited', detail)
  return failure('server', detail)
}

/** Whether a thrown value is the platform's "this request was aborted". */
function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError'
}

/** The message of a thrown value, without assuming it is an `Error`. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

/**
 * Classify anything a request can throw.
 * @param error - whatever `fetch` or the stream reader threw.
 * @returns the failure to show.
 */
export function classifyThrown(error: unknown): SideChatFailure {
  if (error instanceof SideChatRequestError) return classifyStatus(error.status, error.detail)
  if (isAbort(error)) return { code: 'cancelled' }
  // `fetch` rejects a request it could not even send with a TypeError; that is
  // the app being unreachable, which is a different instruction than a 500.
  if (error instanceof TypeError) return failure('network', messageOf(error))
  return failure('host-error', messageOf(error))
}

/** Copy the app uses when it has no model route to answer with. */
const NOT_CONFIGURED_HINTS = [
  /no model route/i,
  /\bmodel route\b/i,
  /no (?:model|provider)\b/i,
  /\bnot configured\b/i,
  /没有(?:配置|可用)的?模型/,
]

/** Copy the app uses when the model produced nothing at all. */
const EMPTY_HINTS = [
  /returned no text/i,
  /no text (?:for|was)/i,
  /\bempty (?:answer|response|reply)\b/i,
  /没有(?:返回)?(?:任何)?(?:文本|回答|内容)/,
]

/** Whether any of `patterns` matches. */
function matches(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some(pattern => pattern.test(text))
}

/**
 * Classify an error frame the app streamed back.
 *
 * The frame carries a translatable code since protocol v0.1; a client that does
 * not know a code (an older or newer app) falls back to reading the message.
 * @param message - the frame's message, used as the raw reason.
 * @param code - the frame's error code, when the app sent one.
 * @returns the failure to show; the raw message stays as the second line.
 */
export function classifyHostError(message: string, code?: SideChatErrorCode): SideChatFailure {
  if (code !== undefined) return fromCode(code, message)
  if (matches(EMPTY_HINTS, message)) return failure('empty', undefined)
  if (matches(NOT_CONFIGURED_HINTS, message)) return failure('not-configured', undefined)
  return failure('host-error', message)
}

/** Turn one wire error code into the copy the reader needs. */
function fromCode(code: SideChatErrorCode, message: string): SideChatFailure {
  switch (code) {
    case 'model-route-missing':
      return { code: 'not-configured' }
    case 'model-service-missing':
      return { code: 'service-missing' }
    case 'request-timeout':
      return { code: 'timeout' }
    case 'internal-error':
      return failure('server', undefined)
    case 'model-failed':
    default:
      // The provider's own words are the only useful detail here.
      return failure('host-error', message)
  }
}

/**
 * Classify an informational frame, when it is really a failure in disguise.
 *
 * The app reports "the model returned no text" as a notice rather than an error,
 * but to the reader it is the same dead end as an error, so it gets the same
 * actionable copy.
 * @param message - the frame's text.
 * @returns the failure to show, or `undefined` when the notice is informational.
 */
export function failureFromNotice(message: string): SideChatFailure | undefined {
  return matches(EMPTY_HINTS, message) ? { code: 'empty' } : undefined
}

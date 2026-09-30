/**
 * Browser half's transport: one `POST` whose response body is a stream of
 * server-sent frames.
 *
 * `EventSource` cannot carry a request body, and the whole temporary
 * conversation travels with each question, so this reads the response body
 * directly and decodes the same `data:` framing the Host writes.
 *
 * Failures are thrown as typed errors carrying the status and the raw reason,
 * so the panel can tell "the app is not running" from "no model is configured"
 * without parsing an error string.
 */
import { decodeFrames, SIDE_CHAT_ROUTE, type SideChatAskRequest, type SideChatFrame } from '../protocol.ts'

/** The app answered this request with a refusal. */
export class SideChatRequestError extends Error {
  /** The HTTP status the app answered with. */
  readonly status: number
  /** The response body, when there was one. */
  readonly detail: string

  /**
   * @param status - the HTTP status.
   * @param statusText - the status line's reason phrase, when the app sent one.
   * @param detail - the response body.
   */
  constructor(status: number, statusText: string, detail: string) {
    super(`${status}${statusText.length > 0 ? ` ${statusText}` : ''}${detail.length > 0 ? ` — ${detail}` : ''}`)
    this.name = 'SideChatRequestError'
    this.status = status
    this.detail = detail
  }
}

/** The connection broke before the answer could be read. */
export class SideChatStreamError extends Error {
  /** @param message - what was missing. */
  constructor(message: string) {
    super(message)
    this.name = 'SideChatStreamError'
  }
}

/**
 * Ask one question and deliver frames as they arrive.
 * @param request - the question, the temporary history, and the context to fold.
 * @param onFrame - called once per decoded frame, in order.
 * @param signal - aborts the request from the panel's Stop control.
 * @throws {SideChatRequestError} when the app refuses the request.
 * @throws {SideChatStreamError} when the response carries no stream.
 * @throws when the connection itself fails or the caller aborts.
 */
export async function askSideChat(
  request: SideChatAskRequest,
  onFrame: (frame: SideChatFrame) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(SIDE_CHAT_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    // The Harness admits this route for the loopback peer either way; sending
    // the cookie keeps the call inside the same trust story as `/api`.
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new SideChatRequestError(response.status, response.statusText, detail)
  }
  if (response.body === null) throw new SideChatStreamError('the side-chat stream had no body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = decodeFrames(buffer)
      buffer = parsed.rest
      for (const frame of parsed.frames) onFrame(frame)
    }
    // The stream ended. Anything still buffered is either a frame the app did
    // not terminate with a blank line, or the tail of one that got cut off;
    // closing the buffer tells the decoder which of the two it is (a truncated
    // frame is not valid JSON and is dropped, a complete one is delivered).
    buffer += decoder.decode()
    const tail = decodeFrames(buffer.endsWith('\n\n') ? buffer : `${buffer}\n\n`)
    for (const frame of tail.frames) onFrame(frame)
  } finally {
    reader.releaseLock()
  }
}

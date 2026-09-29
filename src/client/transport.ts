/**
 * Browser half's transport: one `POST` whose response body is a stream of
 * server-sent frames.
 *
 * `EventSource` cannot carry a request body, and the whole temporary
 * conversation travels with each question, so this reads the response body
 * directly and decodes the same `data:` framing the Host writes.
 */
import { decodeFrames, SIDE_CHAT_ROUTE, type SideChatAskRequest, type SideChatFrame } from '../protocol.ts'

/**
 * Ask one question and deliver frames as they arrive.
 * @param request - the question, the temporary history, and the context to fold.
 * @param onFrame - called once per decoded frame, in order.
 * @param signal - aborts the request from the panel's Stop control.
 * @throws when the route refuses the request or the connection fails.
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
    throw new Error(`${response.status} ${response.statusText}${detail.length > 0 ? ` — ${detail}` : ''}`)
  }
  if (response.body === null) throw new Error('the side-chat stream had no body')

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
    buffer += decoder.decode()
    const tail = decodeFrames(buffer)
    for (const frame of tail.frames) onFrame(frame)
  } finally {
    reader.releaseLock()
  }
}

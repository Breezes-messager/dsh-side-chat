// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeFrame, type SideChatFrame } from '../src/protocol.ts'
import {
  askSideChat,
  SideChatRequestError,
  SideChatStreamError,
} from '../src/client/transport.ts'

/** A request body is irrelevant to these tests; the frame decoding is not. */
const REQUEST = { question: 'hi', history: [] }

/**
 * Answer one request with the given chunks, as the route would.
 * @param chunks - the body pieces, split at whatever boundary the test is about.
 * @param init - response status and headers.
 * @returns the response the transport will read.
 */
function bodyOf(chunks: readonly string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, init)
}

/** A response, or a factory for one when each call needs its own body. */
type ResponseSource = Response | (() => Response | Promise<Response>)

/** Replace `fetch` for one test and count the calls it saw. */
function stubFetch(response: ResponseSource): { readonly calls: number } {
  const state = { calls: 0 }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    state.calls += 1
    expect(input).toBe('/side-chat/ask')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('same-origin')
    // A request the caller already aborted must reject the way the platform does.
    if (init?.signal?.aborted === true) throw new DOMException('aborted', 'AbortError')
    return typeof response === 'function' ? await response() : response
  })
  return state
}

/** Collect the frames a run delivers, in order. */
async function collect(response: ResponseSource): Promise<SideChatFrame[]> {
  const frames: SideChatFrame[] = []
  stubFetch(response)
  await askSideChat(REQUEST, frame => { frames.push(frame) }, new AbortController().signal)
  return frames
}

afterEach(() => { vi.unstubAllGlobals() })

describe('side-chat transport', () => {
  it('decodes frames that arrive whole', async () => {
    const frames = await collect(bodyOf([
      encodeFrame({ type: 'text', text: 'hello' }),
      encodeFrame({ type: 'done' }),
    ]))
    expect(frames).toEqual([{ type: 'text', text: 'hello' }, { type: 'done' }])
  })

  it('decodes a frame split across chunk boundaries', async () => {
    const whole = encodeFrame({ type: 'text', text: 'split me' })
    // Cut INSIDE the JSON payload, the worst case for a naive line reader.
    const cut = Math.floor(whole.length / 2)
    const frames = await collect(bodyOf([whole.slice(0, cut), whole.slice(cut)]))
    expect(frames).toEqual([{ type: 'text', text: 'split me' }])
  })

  it('decodes several frames delivered in one chunk', async () => {
    const frames = await collect(bodyOf([
      encodeFrame({ type: 'text', text: 'a' })
      + encodeFrame({ type: 'text', text: 'b' })
      + encodeFrame({ type: 'done' }),
    ]))
    expect(frames).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'done' },
    ])
  })

  it('delivers a whole frame the stream ended without a blank line after', async () => {
    // A proxy that strips the trailing blank line must not swallow the answer.
    const frames = await collect(bodyOf([
      encodeFrame({ type: 'text', text: 'first' }),
      encodeFrame({ type: 'text', text: 'last' }).trimEnd(),
    ]))
    expect(frames).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'last' },
    ])
  })

  it('drops a frame that was cut off mid-payload instead of inventing text', async () => {
    const whole = encodeFrame({ type: 'text', text: 'truncated' })
    const frames = await collect(bodyOf([whole.slice(0, whole.length - 6)]))
    expect(frames).toEqual([])
  })

  it('drops a malformed frame and keeps reading the stream', async () => {
    const frames = await collect(bodyOf([
      'data: {not json}\n\n',
      encodeFrame({ type: 'done' }),
    ]))
    expect(frames).toEqual([{ type: 'done' }])
  })

  it('throws a typed error carrying the status and the body of a refusal', async () => {
    // A factory: each call needs its own body, since reading one consumes it.
    stubFetch(() => new Response(JSON.stringify({ error: 'too-many-side-chats' }), {
      status: 429,
      statusText: 'Too Many Requests',
    }))
    await expect(askSideChat(REQUEST, () => {}, new AbortController().signal))
      .rejects.toBeInstanceOf(SideChatRequestError)
    try {
      await askSideChat(REQUEST, () => {}, new AbortController().signal)
      expect.unreachable('the refusal should have thrown')
    } catch (error: unknown) {
      const typed = error as SideChatRequestError
      expect(typed.status).toBe(429)
      expect(typed.detail).toBe('{"error":"too-many-side-chats"}')
      expect(typed.message).toContain('429')
    }
  })

  it('throws a stream error when the response carries no body', async () => {
    stubFetch(new Response(null, { status: 200 }))
    await expect(askSideChat(REQUEST, () => {}, new AbortController().signal))
      .rejects.toBeInstanceOf(SideChatStreamError)
  })

  it('rejects with the platform abort error when the caller stops the request', async () => {
    const controller = new AbortController()
    stubFetch(new Response('', { status: 200 }))
    controller.abort()
    await expect(askSideChat(REQUEST, () => {}, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('releases the reader when a frame handler throws', async () => {
    // The handler is the panel; a bug in it must not leave the stream locked.
    const response = bodyOf([encodeFrame({ type: 'text', text: 'x' })])
    stubFetch(response)
    await expect(askSideChat(REQUEST, () => { throw new Error('handler exploded') }, new AbortController().signal))
      .rejects.toThrow('handler exploded')
    expect(response.body?.locked).toBe(false)
  })
})

/**
 * Host-side request handling: what this route accepts, and how a body that
 * breaks the rules is refused without ever being drained into memory.
 */
import { describe, expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { MAX_SELECTION_CHARS, parseRequest, readBody } from '../src/index.ts'

/** A stream that looks enough like an `IncomingMessage` for `readBody`. */
function bodyStream(chunks: readonly string[], headers: Record<string, string> = {}): IncomingMessage {
  const stream = new PassThrough()
  Object.assign(stream, { headers })
  for (const chunk of chunks) stream.write(chunk)
  stream.end()
  return stream as unknown as IncomingMessage
}

/** A stream that stays open, so the reader can be watched while it reads. */
function openStream(headers: Record<string, string> = {}): PassThrough & { headers: Record<string, string> } {
  const stream = new PassThrough() as PassThrough & { headers: Record<string, string> }
  stream.headers = headers
  return stream
}

describe('request body reading', () => {
  it('joins the chunks of a body inside the limit', async () => {
    const result = await readBody(bodyStream(['{"question":', '"hi"}']), 1024)
    expect(result).toEqual({ ok: true, text: '{"question":"hi"}' })
  })

  it('reads an empty body as empty text', async () => {
    await expect(readBody(bodyStream([]), 1024)).resolves.toEqual({ ok: true, text: '' })
    const ended = bodyStream([])
    await expect(readBody(ended, 1024)).resolves.toEqual({ ok: true, text: '' })
  })

  it('stops reading the moment the limit is passed', async () => {
    const stream = openStream()
    stream.write(Buffer.alloc(8))
    const reading = readBody(stream as unknown as IncomingMessage, 10)
    // The chunk that crosses the limit is refused, and the request is paused
    // rather than drained: an oversized upload must not keep spending bandwidth.
    await new Promise(resolve => setImmediate(resolve))
    stream.write(Buffer.alloc(8))
    await expect(reading).resolves.toEqual({ ok: false, reason: 'too-large' })
    expect(stream.isPaused()).toBe(true)
  })

  it('refuses a declared length above the limit without reading it', async () => {
    const stream = openStream({ 'content-length': '9999' })
    await expect(readBody(stream as unknown as IncomingMessage, 10)).resolves.toEqual({ ok: false, reason: 'too-large' })
    expect(stream.isPaused()).toBe(false)
  })

  it('reports a request that went away before its body arrived', async () => {
    const stream = openStream()
    const reading = readBody(stream as unknown as IncomingMessage, 1024)
    stream.emit('aborted')
    await expect(reading).resolves.toEqual({ ok: false, reason: 'aborted' })
    const failing = openStream()
    const second = readBody(failing as unknown as IncomingMessage, 1024)
    failing.emit('error', new Error('socket hang up'))
    await expect(second).resolves.toEqual({ ok: false, reason: 'aborted' })
  })
})

describe('request parsing', () => {
  it('accepts the documented shape and nothing more', () => {
    const request = parseRequest(JSON.stringify({
      question: 'why?',
      history: [
        { role: 'user', text: 'first' },
        { role: 'assistant', text: 'second' },
      ],
      sessionId: 's-1',
      messageIds: ['m-1', 'm-2'],
      selection: 'picked words',
      model: { provider: 'deepseek', model: 'deepseek-flash' },
      extra: 'ignored',
    }))
    expect(request).toEqual({
      question: 'why?',
      history: [
        { role: 'user', text: 'first' },
        { role: 'assistant', text: 'second' },
      ],
      sessionId: 's-1',
      messageIds: ['m-1', 'm-2'],
      selection: 'picked words',
      model: { provider: 'deepseek', model: 'deepseek-flash' },
    })
  })

  it('keeps the question verbatim as long as it says something', () => {
    expect(parseRequest('{"question":"  why?  "}')?.question).toBe('  why?  ')
  })

  it('keeps the bare minimum request', () => {
    expect(parseRequest('{"question":"hi","history":[]}')).toEqual({ question: 'hi', history: [] })
    expect(parseRequest('{"question":"hi"}')).toEqual({ question: 'hi', history: [] })
  })

  it('refuses malformed JSON and values that are not an object', () => {
    for (const body of ['', '{', 'not json', 'null', '42', '"text"', '[]', 'true']) {
      expect(parseRequest(body), body).toBeUndefined()
    }
  })

  it('refuses a missing or unusable question', () => {
    for (const body of ['{}', '{"question":""}', '{"question":"   "}', '{"question":42}', '{"question":null}']) {
      expect(parseRequest(body), body).toBeUndefined()
    }
  })

  it('drops history entries that are not a settled turn', () => {
    const request = parseRequest(JSON.stringify({
      question: 'hi',
      history: [
        { role: 'user', text: 'kept' },
        { role: 'system', text: 'dropped: unknown role' },
        { role: 'assistant', text: 42 },
        null,
        'string',
        { role: 'assistant', text: '' },
        { role: 'user', text: 'kept too', id: 'ignored' },
      ],
    }))
    expect(request?.history).toEqual([
      { role: 'user', text: 'kept' },
      { role: 'assistant', text: '' },
      { role: 'user', text: 'kept too' },
    ])
  })

  it('treats a non-array history as no history', () => {
    expect(parseRequest('{"question":"hi","history":"nope"}')?.history).toEqual([])
    expect(parseRequest('{"question":"hi","history":null}')?.history).toEqual([])
  })

  it('keeps only usable message ids and drops an empty selection of them', () => {
    const kept = parseRequest('{"question":"hi","messageIds":["a",1,null,"b",""]}')
    expect(kept?.messageIds).toEqual(['a', 'b'])
    expect(parseRequest('{"question":"hi","messageIds":[]}')).not.toHaveProperty('messageIds')
    expect(parseRequest('{"question":"hi","messageIds":[1,null]}')).not.toHaveProperty('messageIds')
    expect(parseRequest('{"question":"hi","messageIds":"a"}')).not.toHaveProperty('messageIds')
  })

  it('bounds a selection and ignores an empty one', () => {
    const long = 'x'.repeat(MAX_SELECTION_CHARS + 500)
    const request = parseRequest(JSON.stringify({ question: 'hi', selection: long }))
    expect(request?.selection).toHaveLength(MAX_SELECTION_CHARS)
    expect(parseRequest('{"question":"hi","selection":"   "}')).not.toHaveProperty('selection')
    expect(parseRequest('{"question":"hi","selection":42}')).not.toHaveProperty('selection')
  })

  it('accepts a model override only when it names both halves', () => {
    expect(parseRequest('{"question":"hi","model":{"provider":"p","model":"m"}}')?.model)
      .toEqual({ provider: 'p', model: 'm' })
    for (const body of [
      '{"question":"hi","model":{"provider":"p"}}',
      '{"question":"hi","model":{"model":"m"}}',
      '{"question":"hi","model":{"provider":"","model":"m"}}',
      '{"question":"hi","model":{"provider":1,"model":"m"}}',
      '{"question":"hi","model":null}',
      '{"question":"hi","model":"p/m"}',
    ]) {
      expect(parseRequest(body), body).not.toHaveProperty('model')
    }
  })

  it('ignores a session id that is not a usable string', () => {
    expect(parseRequest('{"question":"hi","sessionId":"s"}')?.sessionId).toBe('s')
    expect(parseRequest('{"question":"hi","sessionId":""}')).not.toHaveProperty('sessionId')
    expect(parseRequest('{"question":"hi","sessionId":7}')).not.toHaveProperty('sessionId')
  })
})

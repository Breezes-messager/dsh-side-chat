// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  classifyHostError,
  classifyStatus,
  classifyThrown,
  failureFromNotice,
  readableDetail,
  type SideChatFailureCode,
} from '../src/client/failure.ts'
import { SideChatRequestError, SideChatStreamError } from '../src/client/transport.ts'

describe('failure classification', () => {
  it('maps every refusal status to the instruction the reader needs', () => {
    expect(classifyStatus(401).code).toBe('unauthorized')
    expect(classifyStatus(403).code).toBe('unauthorized')
    expect(classifyStatus(404).code).toBe('not-found')
    expect(classifyStatus(405).code).toBe('not-found')
    expect(classifyStatus(413).code).toBe('too-long')
    expect(classifyStatus(400).code).toBe('bad-request')
    expect(classifyStatus(415).code).toBe('bad-request')
    expect(classifyStatus(429).code).toBe('rate-limited')
    expect(classifyStatus(500).code).toBe('server')
    expect(classifyStatus(502).code).toBe('server')
    expect(classifyStatus(418).code).toBe('server')
  })

  it('keeps the app error envelope out of the reader’s face', () => {
    expect(classifyStatus(429, JSON.stringify({ error: 'too-many-side-chats' }))).toEqual({ code: 'rate-limited' })
    expect(classifyStatus(413, JSON.stringify({ error: 'body-too-large' }))).toEqual({ code: 'too-long' })
    expect(classifyStatus(500, 'upstream exploded')).toEqual({ code: 'server', detail: 'upstream exploded' })
  })

  it('classifies a refused request through its typed error', () => {
    expect(classifyThrown(new SideChatRequestError(403, 'Forbidden', ''))).toEqual({ code: 'unauthorized' })
    expect(classifyThrown(new SideChatRequestError(500, 'Internal Server Error', 'boom')))
      .toEqual({ code: 'server', detail: 'boom' })
  })

  it('reads an unreachable app as a network failure, not a server bug', () => {
    expect(classifyThrown(new TypeError('Failed to fetch')).code).toBe('network')
    expect(classifyThrown(new SideChatStreamError('the side-chat stream had no body')).code).toBe('host-error')
  })

  it('reads an abort as the reader stopping, whatever threw it', () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(classifyThrown(abort)).toEqual({ code: 'cancelled' })
    expect(classifyThrown(new DOMException('aborted', 'AbortError'))).toEqual({ code: 'cancelled' })
  })

  it('survives a thrown non-error', () => {
    expect(classifyThrown('plain string')).toEqual({ code: 'host-error', detail: 'plain string' })
    expect(classifyThrown(undefined)).toEqual({ code: 'host-error' })
  })

  it('prefers the app’s error code over guessing from the message', () => {
    expect(classifyHostError('anything at all', 'model-route-missing')).toEqual({ code: 'not-configured' })
    expect(classifyHostError('anything at all', 'model-service-missing')).toEqual({ code: 'service-missing' })
    expect(classifyHostError('anything at all', 'request-timeout')).toEqual({ code: 'timeout' })
    expect(classifyHostError('anything at all', 'internal-error')).toEqual({ code: 'server' })
    expect(classifyHostError('invalid api key', 'model-failed'))
      .toEqual({ code: 'host-error', detail: 'invalid api key' })
  })

  it('still reads a message from an app that sends no code', () => {
    // Forward compatibility both ways: an older Host omits `code` entirely.
    expect(classifyHostError('No model route is available for the side chat.')).toEqual({ code: 'not-configured' })
    expect(classifyHostError('insufficient balance')).toEqual({ code: 'host-error', detail: 'insufficient balance' })
  })

  it('turns the app’s "no model" error frame into the setup instruction', () => {
    expect(classifyHostError('No model route is available for the side chat. Open a conversation first, or set provider/model in the plugin config.'))
      .toEqual({ code: 'not-configured' })
    expect(classifyHostError('No model route is configured').code).toBe('not-configured')
  })

  it('turns "the model returned no text" into the same dead end as an empty answer', () => {
    expect(classifyHostError('The model returned no text for this question.').code).toBe('empty')
    expect(failureFromNotice('The model returned no text for this question.')).toEqual({ code: 'empty' })
  })

  it('leaves an informational notice alone', () => {
    expect(failureFromNotice('The answer was shortened to fit the panel.')).toBeUndefined()
  })

  it('keeps a provider message as the second line of a host failure', () => {
    expect(classifyHostError('insufficient balance')).toEqual({
      code: 'host-error',
      detail: 'insufficient balance',
    })
  })

  it('caps and trims a raw reason', () => {
    expect(readableDetail('   ')).toBeUndefined()
    expect(readableDetail('  spaced  ')).toBe('spaced')
    expect(readableDetail('x'.repeat(400))?.length).toBe(241)
    expect(readableDetail('{"error":"unknown-code"}')).toBe('{"error":"unknown-code"}')
  })

  it('can actually reach every code the copy table defines', () => {
    // A dead entry in FAILURE_COPY would mean copy nobody can ever see, and a
    // code the classifiers emit but the table misses would be a raw identifier.
    const reachable = new Set<SideChatFailureCode>([
      classifyThrown(new TypeError('x')).code,
      classifyThrown(new DOMException('x', 'AbortError')).code,
      classifyStatus(401).code,
      classifyStatus(429).code,
      classifyStatus(413).code,
      classifyStatus(400).code,
      classifyStatus(404).code,
      classifyStatus(503).code,
      classifyHostError('no model route').code,
      classifyHostError('', 'model-service-missing').code,
      classifyHostError('', 'request-timeout').code,
      classifyHostError('insufficient balance', 'model-failed').code,
      classifyHostError('the model returned no text').code,
    ])
    expect([...reachable].sort()).toEqual([
      'bad-request', 'cancelled', 'empty', 'host-error', 'network', 'not-configured',
      'not-found', 'rate-limited', 'server', 'service-missing', 'timeout', 'too-long', 'unauthorized',
    ])
  })
})

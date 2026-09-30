/**
 * Trust policy: who may call `POST /side-chat/ask`.
 *
 * Every case is a pure decision, so these tests pin the policy itself —
 * including the default that a Harness without Connection authentication keeps
 * admitting local callers, which is the behaviour an installed copy already has.
 */
import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import {
  decideTrust,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TRUST,
  isLoopback,
  normalizeTrust,
  sameOrigin,
  settingsOf,
  TRUST_MODES,
  type TrustInput,
} from '../src/index.ts'

/** A request whose only interesting property is where it came from. */
function from(address: string | undefined): IncomingMessage {
  return { socket: { remoteAddress: address } } as unknown as IncomingMessage
}

/** One trust decision input, with the common case filled in. */
function input(overrides: Partial<TrustInput> = {}): TrustInput {
  return { mode: 'host', rejection: undefined, loopback: true, origin: undefined, host: '127.0.0.1:19387', ...overrides }
}

describe('trust policy settings', () => {
  it('defaults to same-origin', () => {
    // The panel is the only intended caller and a same-origin POST always carries
    // a matching Origin, so this is the safe default that still works out of the
    // box; a cross-site page and a bare local script are refused.
    expect(DEFAULT_TRUST).toBe('same-origin')
    expect(TRUST_MODES).toEqual(['host', 'same-origin', 'open'])
  })

  it('accepts exactly the three documented modes', () => {
    expect(normalizeTrust('host')).toBe('host')
    expect(normalizeTrust('same-origin')).toBe('same-origin')
    expect(normalizeTrust('open')).toBe('open')
    expect(normalizeTrust('Host')).toBeUndefined()
    expect(normalizeTrust('loopback')).toBeUndefined()
    expect(normalizeTrust('')).toBeUndefined()
    expect(normalizeTrust(true)).toBeUndefined()
    expect(normalizeTrust(undefined)).toBeUndefined()
  })

  it('resolves every limit to a working default', () => {
    const settings = settingsOf({})
    expect(settings.maxBodyBytes).toBe(DEFAULT_MAX_BODY_BYTES)
    expect(settings.maxConcurrent).toBe(DEFAULT_MAX_CONCURRENT)
    expect(settings.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(settings.trust).toBe('same-origin')
    expect(settings.trustSource).toBe('default')
    expect(settings.route).toBeUndefined()
    expect(settings.budget).toEqual({ recentMessages: 20, maxMessageChars: 4_000, maxContextChars: 24_000 })
  })

  it('keeps usable values and ignores unusable ones', () => {
    const settings = settingsOf({
      maxBodyBytes: 1024,
      maxConcurrent: 2,
      timeoutMs: 0,
      recentMessages: 0,
      maxMessageChars: 10,
      maxContextChars: 20,
      provider: 'deepseek',
      model: 'deepseek-flash',
      trust: 'same-origin',
    })
    expect(settings.maxBodyBytes).toBe(1024)
    expect(settings.maxConcurrent).toBe(2)
    expect(settings.timeoutMs).toBe(0)
    expect(settings.budget).toEqual({ recentMessages: 0, maxMessageChars: 10, maxContextChars: 20 })
    expect(settings.route).toEqual({ provider: 'deepseek', model: 'deepseek-flash' })
    expect(settings.trust).toBe('same-origin')
    expect(settings.trustSource).toBe('config')
  })

  it('falls back instead of trusting a malformed config block', () => {
    // A value can still reach `settingsOf` without passing the runtime schema
    // (a test, a future Host, a direct call), so junk must degrade, never throw.
    const settings = settingsOf({
      maxBodyBytes: -1,
      maxConcurrent: 1.5,
      timeoutMs: Number.NaN,
      recentMessages: -3,
      maxMessageChars: Number.POSITIVE_INFINITY,
      maxContextChars: 'lots' as unknown as number,
      provider: '   ',
      model: 'deepseek-flash',
      trust: 'anything' as unknown as 'host',
    })
    expect(settings.maxBodyBytes).toBe(DEFAULT_MAX_BODY_BYTES)
    expect(settings.maxConcurrent).toBe(DEFAULT_MAX_CONCURRENT)
    expect(settings.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(settings.budget.recentMessages).toBe(20)
    expect(settings.budget.maxMessageChars).toBe(4_000)
    expect(settings.budget.maxContextChars).toBe(24_000)
    expect(settings.trust).toBe('same-origin')
    expect(settings.trustSource).toBe('default')
    // A half-configured route is no route at all.
    expect(settings.route).toBeUndefined()
  })

  it('lets the development switch select open, and lets config outrank it', () => {
    expect(settingsOf({}, { allowLoopback: true })).toMatchObject({ trust: 'open', trustSource: 'environment' })
    expect(settingsOf({ trust: 'host' }, { allowLoopback: true }))
      .toMatchObject({ trust: 'host', trustSource: 'config' })
    expect(settingsOf({ trust: 'same-origin' }, { allowLoopback: false }))
      .toMatchObject({ trust: 'same-origin', trustSource: 'config' })
  })
})

describe('loopback detection', () => {
  it('recognizes the shapes a local socket reports', () => {
    expect(isLoopback(from('127.0.0.1'))).toBe(true)
    expect(isLoopback(from('::1'))).toBe(true)
    expect(isLoopback(from('::ffff:127.0.0.1'))).toBe(true)
    expect(isLoopback(from('192.168.1.20'))).toBe(false)
    expect(isLoopback(from(undefined))).toBe(false)
  })
})

describe('same-origin comparison', () => {
  it('matches a host and its effective port', () => {
    expect(sameOrigin('http://127.0.0.1:19387', '127.0.0.1:19387')).toBe(true)
    expect(sameOrigin('http://localhost', 'localhost')).toBe(true)
    expect(sameOrigin('http://localhost', 'localhost:80')).toBe(true)
    expect(sameOrigin('https://localhost', 'localhost:443')).toBe(true)
    expect(sameOrigin('http://LOCALHOST:80', 'localhost')).toBe(true)
    expect(sameOrigin('http://[::1]:19387', '[::1]:19387')).toBe(true)
  })

  it('refuses a different authority, scheme, or opaque origin', () => {
    expect(sameOrigin('http://127.0.0.1:19387', '127.0.0.1:19388')).toBe(false)
    expect(sameOrigin('http://localhost:8080', 'localhost')).toBe(false)
    // A Host header carries no scheme, so an https origin and the https default
    // port are read as the same authority.
    expect(sameOrigin('https://localhost', 'localhost')).toBe(true)
    expect(sameOrigin('https://localhost:8443', 'localhost:8443')).toBe(true)
    expect(sameOrigin('http://evil.test', '127.0.0.1:19387')).toBe(false)
    expect(sameOrigin('http://127.0.0.1:19387', 'evil.test')).toBe(false)
    expect(sameOrigin('file:///tmp/x', '127.0.0.1')).toBe(false)
    expect(sameOrigin('null', '127.0.0.1:19387')).toBe(false)
    expect(sameOrigin('not a url', '127.0.0.1:19387')).toBe(false)
    expect(sameOrigin('http://127.0.0.1:19387', undefined)).toBe(false)
    expect(sameOrigin('http://127.0.0.1:19387', '')).toBe(false)
    expect(sameOrigin('http://127.0.0.1:19387', '::1:19387')).toBe(false)
  })
})

describe('the decision itself', () => {
  it('lets the Host outrank every policy except open', () => {
    expect(decideTrust(input({ rejection: 401 }))).toEqual({ allowed: false, status: 401, basis: 'host-rejection' })
    expect(decideTrust(input({ rejection: 403 })))
      .toEqual({ allowed: false, status: 403, basis: 'host-rejection' })
    expect(decideTrust(input({ mode: 'same-origin', rejection: 401, loopback: true })))
      .toEqual({ allowed: false, status: 401, basis: 'host-rejection' })
  })

  it('admits what an unauthenticated Host admits, once asked to defer to it', () => {
    // On the shipped desktop profile Connection has no authentication, so in
    // `host` mode every caller — loopback or not, browser or not — is admitted.
    // This is the documented escape hatch for a browser that is not on this
    // machine, not the default.
    expect(decideTrust(input())).toEqual({ allowed: true, basis: 'host-accepted' })
    expect(decideTrust(input({ loopback: false }))).toEqual({ allowed: true, basis: 'host-accepted' })
    expect(decideTrust(input({ origin: 'https://evil.test' }))).toEqual({ allowed: true, basis: 'host-accepted' })
  })

  it('skips the Host entirely when told to', () => {
    expect(decideTrust(input({ mode: 'open', rejection: 401, loopback: false })))
      .toEqual({ allowed: true, basis: 'open' })
  })

  it('admits the panel, defers a bare local caller to the Host', () => {
    // The two callers the default has to keep working: the web page's own
    // same-origin POST, and the desktop app's forwarded request. Electron strips
    // `Origin` and re-adds only the Host's cookie, so a desktop request carries no
    // Origin at all — that branch is therefore the Host's authentication decision,
    // not a refusal.
    const panel = input({ mode: DEFAULT_TRUST, origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' })
    expect(decideTrust(panel)).toEqual({ allowed: true, basis: 'same-origin' })
    expect(decideTrust({ ...panel, origin: undefined })).toEqual({ allowed: true, basis: 'host-authenticated' })
  })

  it('listens to the Host when a request carries no Origin', () => {
    // The no-Origin branch is a fallback to the Host's own check, not a bypass of
    // it: a Host that refuses still gets its refusal through.
    for (const status of [401, 403] as const) {
      expect(decideTrust(input({ mode: DEFAULT_TRUST, origin: undefined, rejection: status })))
        .toEqual({ allowed: false, status, basis: 'host-rejection' })
    }
  })

  it('refuses a cross-site page under the default policy', () => {
    // The drive-by case the default exists for: a page on another site posting to
    // the loopback port. The browser sets Origin itself and the page cannot lie.
    const crossSite = input({
      mode: DEFAULT_TRUST,
      loopback: true,
      origin: 'https://evil.test',
      host: '127.0.0.1:19387',
    })
    expect(decideTrust(crossSite)).toEqual({ allowed: false, status: 403, basis: 'origin-mismatch' })
  })

  it('refuses a cross-site page even when the Host has no opinion', () => {
    // What makes the default stricter than `trust: 'host'`: that mode never reads
    // Origin, so it admits the very same request when the Host has no authentication.
    const crossSite = input({ mode: DEFAULT_TRUST, origin: 'https://evil.test', rejection: undefined })
    expect(decideTrust(crossSite)).toEqual({ allowed: false, status: 403, basis: 'origin-mismatch' })
    expect(decideTrust({ ...crossSite, mode: 'host' })).toEqual({ allowed: true, basis: 'host-accepted' })
  })

  it('refuses a caller from outside the machine whatever its Origin says', () => {
    const remote = input({ mode: DEFAULT_TRUST, loopback: false, origin: undefined })
    expect(decideTrust(remote)).toEqual({ allowed: false, status: 403, basis: 'not-loopback' })
    expect(decideTrust({ ...remote, origin: 'http://127.0.0.1:19387' }))
      .toEqual({ allowed: false, status: 403, basis: 'not-loopback' })
  })

  it('narrows to same-origin in each direction it promises', () => {
    const matching = input({
      mode: 'same-origin',
      loopback: true,
      origin: 'http://127.0.0.1:19387',
      host: '127.0.0.1:19387',
    })
    expect(decideTrust(matching)).toEqual({ allowed: true, basis: 'same-origin' })
    expect(decideTrust({ ...matching, loopback: false }))
      .toEqual({ allowed: false, status: 403, basis: 'not-loopback' })
    // A request with no Origin goes to the Host, which admitted it here.
    expect(decideTrust({ ...matching, origin: undefined }))
      .toEqual({ allowed: true, basis: 'host-authenticated' })
    expect(decideTrust({ ...matching, origin: ' null ' }))
      .toEqual({ allowed: false, status: 403, basis: 'origin-opaque' })
    expect(decideTrust({ ...matching, origin: 'https://evil.test' }))
      .toEqual({ allowed: false, status: 403, basis: 'origin-mismatch' })
    expect(decideTrust({ ...matching, host: undefined }))
      .toEqual({ allowed: false, status: 403, basis: 'origin-mismatch' })
  })
})

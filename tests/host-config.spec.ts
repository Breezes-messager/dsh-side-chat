/**
 * The runtime Config schema, and the two contracts it has to satisfy.
 *
 * DSH reports a plugin's configuration only for a *native* Schemastery schema
 * (`Symbol.for('schemastery')`, a string `type`, an object `meta` — see
 * `isNativeConfigSchema` in `@deepseek-ai/dsh-app-boot`), and Cordis validates
 * the profile's `config:` block through `Config['~standard'].validate` before the
 * plugin starts (`resolveConfig` in `@deepseek-ai/cordis`). Both are pinned here,
 * because swapping this export for a hand-written validator would silently turn
 * the configuration back into something no user can see.
 */
import { describe, expect, it } from 'vitest'
import {
  Config,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TRUST,
  settingsOf,
  TRUST_MODES,
  type Config as ConfigShape,
} from '../src/index.ts'

/** One Standard Schema validation result, in the shape the schema returns. */
interface Validation {
  readonly value?: Record<string, unknown>
  readonly issues?: readonly { readonly message: string, readonly path?: readonly PropertyKey[] }[]
}

/** Validate one profile config block exactly as Cordis does. */
function validate(input: unknown): Validation {
  const schema = Config as unknown as { '~standard': { validate(value: unknown): Validation } }
  return schema['~standard'].validate(input)
}

/** The defaults a profile that configures nothing must receive. */
const DEFAULTS = {
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  maxConcurrent: DEFAULT_MAX_CONCURRENT,
  recentMessages: 20,
  maxMessageChars: 4_000,
  maxContextChars: 24_000,
  timeoutMs: DEFAULT_TIMEOUT_MS,
}

describe('the shape DSH projects', () => {
  it('is a native Schemastery schema', () => {
    // The exact predicate from dsh-app-boot:2163 — without it the entry shows as
    // `absent` in the plugin manager and nothing validates the profile block.
    const candidate = Config as unknown as object
    const meta = Reflect.get(candidate, 'meta')
    expect(Reflect.get(candidate, Symbol.for('schemastery'))).toBe(true)
    expect(typeof Reflect.get(candidate, 'type')).toBe('string')
    expect(meta).not.toBeNull()
    expect(typeof meta).toBe('object')
  })

  it('validates through the Standard Schema interface Cordis calls', () => {
    const schema = Config as unknown as { '~standard'?: { version?: number, validate?: unknown } }
    expect(typeof schema['~standard']?.validate).toBe('function')
  })
})

describe('a profile that configures nothing', () => {
  it('receives every documented default', () => {
    // `undefined` and `null` are what an entry without a `config:` block yields.
    expect(validate(undefined).value).toEqual(DEFAULTS)
    expect(validate(null).value).toEqual(DEFAULTS)
    expect(validate({}).value).toEqual(DEFAULTS)
  })

  it('falls back to the same numbers the route would have used anyway', () => {
    // If these two ever drift, an install with a config block would behave
    // differently from one without.
    expect(settingsOf(validate({}).value as ConfigShape)).toEqual(settingsOf({}))
  })

  it('leaves trust unset so the development switch still applies', () => {
    // A `.default()` on trust would materialize into every config block and
    // silently outrank DSH_SIDE_CHAT_ALLOW_LOOPBACK.
    expect(validate({}).value?.trust).toBeUndefined()
    expect(DEFAULT_TRUST).toBe('same-origin')
    expect(settingsOf(validate({}).value as ConfigShape, { allowLoopback: true }).trust).toBe('open')
    expect(settingsOf(validate({}).value as ConfigShape, { allowLoopback: false }).trust).toBe('same-origin')
    // A profile that does name a policy still outranks the switch.
    const pinned = validate({ trust: 'host' }).value as ConfigShape
    expect(settingsOf(pinned, { allowLoopback: true })).toMatchObject({ trust: 'host', trustSource: 'config' })
  })
})

describe('a profile that configures something', () => {
  it('accepts every documented trust policy', () => {
    for (const mode of TRUST_MODES) expect(validate({ trust: mode }).value?.trust, mode).toBe(mode)
  })

  it('accepts the documented numeric limits, including nought', () => {
    const result = validate({ maxBodyBytes: 1024, maxConcurrent: 1, timeoutMs: 0, recentMessages: 0 })
    expect(result.issues).toBeUndefined()
    expect(result.value).toMatchObject({ maxBodyBytes: 1024, maxConcurrent: 1, timeoutMs: 0, recentMessages: 0 })
  })

  it('accepts a model override and leaves the other fields at their defaults', () => {
    const result = validate({ provider: 'deepseek', model: 'deepseek-flash' })
    expect(result.value).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash', ...DEFAULTS })
    expect(result.value?.trust).toBeUndefined()
  })

  it('keeps a profile that names a field this plugin does not know', () => {
    // Schemastery ignores unknown keys rather than rejecting them, so a typo can
    // never stop the plugin from loading; it just does nothing, and the projected
    // schema is what tells the user which names exist.
    const result = validate({ trust: 'open', maxConcurrentt: 2 })
    expect(result.issues).toBeUndefined()
    expect(result.value).toMatchObject({ trust: 'open', maxConcurrentt: 2 })
  })
})

describe('a profile the schema refuses', () => {
  it('names the field it refuses instead of letting it through', () => {
    const trust = validate({ trust: 'Host' })
    expect(trust.issues).toHaveLength(1)
    expect(trust.issues?.[0]?.message).toContain('trust')
    expect(trust.issues?.[0]?.path).toEqual(['trust'])
    expect(trust.value).toBeUndefined()
  })

  it('refuses negative and fractional limits', () => {
    expect(validate({ timeoutMs: -1 }).issues).toBeTruthy()
    expect(validate({ maxBodyBytes: 1.5 }).issues).toBeTruthy()
    expect(validate({ maxConcurrent: 'many' }).issues).toBeTruthy()
  })

  it('refuses a config block that is not an object at all', () => {
    expect(validate('nonsense').issues).toBeTruthy()
    expect(validate([]).issues).toBeTruthy()
  })
})

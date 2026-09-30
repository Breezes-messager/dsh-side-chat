// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { en, FAILURE_COPY, fallbackTranslate, zh, type SideChatKey } from '../src/client/locales.ts'

describe('side-chat dictionaries', () => {
  it('ships the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has no empty or placeholder text in either language', () => {
    for (const [key, text] of [...Object.entries(zh), ...Object.entries(en)]) {
      expect(text.trim().length, `${key} is empty`).toBeGreaterThan(0)
      expect(text, `${key} is still a placeholder`).not.toMatch(/TODO|FIXME|XXX|待翻译|英文原文/)
    }
  })

  it('has copy for every failure the panel can draw', () => {
    const keys = Object.keys(FAILURE_COPY) as (keyof typeof FAILURE_COPY)[]
    const codes = [
      'network', 'cancelled', 'unauthorized', 'rate-limited', 'too-long',
      'bad-request', 'not-found', 'not-configured', 'service-missing', 'timeout',
      'server', 'host-error', 'empty',
    ]
    expect(keys.sort()).toEqual(codes.sort())
    for (const key of Object.values(FAILURE_COPY)) expect(zh[key].length).toBeGreaterThan(0)
  })

  it('keeps the two languages distinguishable, so a dictionary pasted over the other is caught', () => {
    // Every key is Chinese in one table and English in the other; a table that
    // was copied instead of translated would show up here immediately.
    const identical = (Object.keys(zh) as SideChatKey[]).filter(key => zh[key] === en[key])
    expect(identical).toEqual([])
  })

  it('translates to the language the browser asks for, and returns the key otherwise', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(fallbackTranslate('composer.send')).toBe(zh['composer.send'])
    vi.stubGlobal('navigator', { language: 'fr' })
    expect(fallbackTranslate('composer.send')).toBe(en['composer.send'])
    expect(fallbackTranslate('no.such.key')).toBe('no.such.key')
    vi.unstubAllGlobals()
  })
})

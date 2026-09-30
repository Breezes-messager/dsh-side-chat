// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CLASS, PANEL_CSS } from '../src/client/styles.ts'

/**
 * Every design token this plugin draws with, as the live Harness theme names
 * them (`client/Theme.listTokens` on a running page lists exactly these names).
 *
 * The list is exhaustive on purpose: a token that is not in it is either a typo
 * or a token from another design system, and both render as the fallback colour
 * on someone else's machine while looking fine on the author's.
 */
const THEME_TOKENS = [
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
] as const

/** Every `var(--dsw-…)` this sheet references. */
function referencedTokens(): string[] {
  return [...new Set([...PANEL_CSS.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map(match => match[1] ?? ''))].sort()
}

describe('side-chat panel stylesheet', () => {
  it('uses only tokens the Harness theme actually defines', () => {
    const unknown = referencedTokens().filter(token => !(THEME_TOKENS as readonly string[]).includes(token))
    expect(unknown).toEqual([])
  })

  it('uses every token in the documented list, so the list cannot drift', () => {
    expect(referencedTokens()).toEqual([...THEME_TOKENS].sort())
  })

  it('gives every token a fallback, so a missing one never renders transparent', () => {
    const withoutFallback = [...PANEL_CSS.matchAll(/var\((--dsw-[a-z0-9-]+)\)/g)].map(match => match[1] ?? '')
    expect(withoutFallback).toEqual([])
  })

  it('keeps every selector inside the plugin’s own namespace', () => {
    const selectors = PANEL_CSS
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .map(block => block.split('{')[0]?.trim() ?? '')
      .filter(selector => selector.length > 0 && !selector.startsWith('@') && !selector.startsWith('.sc-'))
    expect(selectors).toEqual([])
  })

  it('names a class for every element the panel draws', () => {
    for (const [name, className] of Object.entries(CLASS)) {
      expect(className, `${name} is not namespaced`).toMatch(/^sc-/)
    }
  })

  it('defines a rule for each of the failure and notice classes the panel uses', () => {
    for (const className of [
      CLASS.failure, CLASS.failureError, CLASS.failureDetail, CLASS.partial,
      CLASS.notice, CLASS.noticeText, CLASS.noticeClose, CLASS.emptyHint,
    ]) {
      expect(PANEL_CSS, `${className} has no rule`).toContain(`.${className}`)
    }
  })

  it('respects a reduced-motion preference for the streaming caret', () => {
    expect(PANEL_CSS).toContain('prefers-reduced-motion')
  })
})

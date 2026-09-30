// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { en } from '../src/client/locales.ts'
import { composerKey, escapeAction, SideChatBody } from '../src/client/panel.tsx'
import { storeFor } from '../src/client/store.ts'

/** Render the panel for a store only this test touches. */
function renderPanel(sessionId: string, tab?: { navigation: { params?: unknown, revision?: number }, visible?: boolean }): string {
  return renderToStaticMarkup(
    <SideChatBody sessionId={sessionId} t={(key: string) => en[key as keyof typeof en] ?? key} tab={tab} />,
  )
}

let counter = 0
/** A store no other test can see. */
function isolated(): string {
  counter += 1
  return `panel-session-${counter}`
}

describe('side-chat composer keyboard contract', () => {
  it('sends on a plain Enter', () => {
    expect(composerKey({ key: 'Enter', shiftKey: false })).toBe('send')
  })

  it('inserts a newline on Shift+Enter', () => {
    expect(composerKey({ key: 'Enter', shiftKey: true })).toBe('newline')
  })

  it('never sends the Enter that confirms an input-method candidate', () => {
    // The Chinese/Japanese/Korean case: sending here cuts the sentence in half.
    expect(composerKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe('ignore')
    expect(composerKey({ key: 'Enter', shiftKey: false, keyCode: 229 })).toBe('ignore')
  })

  it('leaves every other key to the textarea', () => {
    expect(composerKey({ key: 'a', shiftKey: false })).toBe('ignore')
    expect(composerKey({ key: 'Escape', shiftKey: false })).toBe('ignore')
  })
})

describe('side-chat escape contract', () => {
  it('stops the answer that is running', () => {
    expect(escapeAction(true, true)).toBe('stop')
    expect(escapeAction(true, false)).toBe('stop')
  })

  it('closes the panel when nothing is running', () => {
    expect(escapeAction(false, true)).toBe('close')
  })

  it('does nothing when the tab handed the body no close action', () => {
    expect(escapeAction(false, false)).toBe('none')
  })
})

describe('side-chat panel markup', () => {
  it('promises what the empty panel does and how to start', () => {
    const html = renderPanel(isolated())
    expect(html).toContain(en['empty.title'])
    expect(html).toContain(en['empty.body'])
    expect(html).toContain(en['empty.example'])
    expect(html).toContain(en['composer.placeholder'])
  })

  it('labels the composer and the transcript for assistive technology', () => {
    const sessionId = isolated()
    expect(renderPanel(sessionId)).toContain(`aria-label="${en['a11y.question']}"`)
    storeFor(sessionId).begin('a question')
    const html = renderPanel(sessionId)
    expect(html).toContain(`aria-label="${en['a11y.transcript']}"`)
    expect(html).toContain('role="log"')
    expect(html).toContain('aria-live="polite"')
  })

  it('disables Send until there is something to send', () => {
    expect(renderPanel(isolated())).toContain('disabled')
  })

  it('offers Stop instead of Send while an answer streams', () => {
    const sessionId = isolated()
    storeFor(sessionId).begin('a question')
    const html = renderPanel(sessionId)
    expect(html).toContain(en['composer.stop'])
    expect(html).toContain(`aria-label="${en['a11y.stop']}"`)
    expect(html).toContain('aria-busy="true"')
  })

  it('names the tab action for the close button it cannot draw itself', () => {
    const sessionId = isolated()
    storeFor(sessionId).setContextMessageId('m1')
    const html = renderPanel(sessionId)
    expect(html).toContain(`aria-label="${en['context.clear']}"`)
    expect(html).toContain(en['context.quoted'])
  })

  it('shows the actionable sentence for a failure, with the raw reason beneath it', () => {
    const sessionId = isolated()
    const store = storeFor(sessionId)
    const answerId = store.begin('a question')
    store.append(answerId, 'half an answer')
    store.fail(answerId, { code: 'not-configured', detail: 'no model route' })
    const html = renderPanel(sessionId)
    expect(html).toContain(en['error.not-configured'])
    expect(html).toContain('no model route')
    expect(html).toContain('half an answer')
    expect(html).toContain('role="alert"')
    expect(html).toContain('sc-failure-error')
  })

  it('shows an empty answer as a failure instead of a blank bubble', () => {
    const sessionId = isolated()
    const answerId = storeFor(sessionId).begin('a question')
    storeFor(sessionId).settle(answerId)
    const html = renderPanel(sessionId)
    expect(html).toContain(en['error.empty'])
  })

  it('says a stopped answer was stopped, without painting it as an error', () => {
    const sessionId = isolated()
    const answerId = storeFor(sessionId).begin('a question')
    storeFor(sessionId).fail(answerId, { code: 'cancelled' })
    const html = renderPanel(sessionId)
    expect(html).toContain(en['error.cancelled'])
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('sc-failure-error')
  })

  it('shows a timed-out answer with the app’s own error code', () => {
    const sessionId = isolated()
    const answerId = storeFor(sessionId).begin('a long question')
    storeFor(sessionId).fail(answerId, { code: 'timeout' })
    expect(renderPanel(sessionId)).toContain(en['error.timeout'])
  })

  it('shows an app with no model service as its own instruction', () => {
    const sessionId = isolated()
    const answerId = storeFor(sessionId).begin('a question')
    storeFor(sessionId).fail(answerId, { code: 'service-missing' })
    expect(renderPanel(sessionId)).toContain(en['error.service-missing'])
  })

  it('never renders a raw dictionary key when the locale service is missing', () => {
    const sessionId = isolated()
    const html = renderToStaticMarkup(<SideChatBody sessionId={sessionId} />)
    expect(html).not.toMatch(/>(?:error|context|composer|a11y)\.[a-z-]+</)
  })
})

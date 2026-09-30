// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissNotice,
  getNotice,
  publishNotice,
  subscribeNotice,
} from '../src/client/notice.ts'

afterEach(() => {
  dismissNotice()
  vi.useRealTimers()
})

describe('side-chat frame-wide notice', () => {
  it('starts with nothing on screen', () => {
    expect(getNotice()).toBeUndefined()
  })

  it('publishes the message and tells every subscriber once', () => {
    const seen: (string | undefined)[] = []
    const stop = subscribeNotice(() => { seen.push(getNotice()?.key) })
    publishNotice({ key: 'notice.openFailed' })
    stop()
    expect(seen).toEqual(['notice.openFailed'])
    expect(getNotice()).toEqual({ key: 'notice.openFailed' })
  })

  it('keeps a raw reason alongside the message', () => {
    publishNotice({ key: 'notice.openFailed', detail: 'no session surface' })
    expect(getNotice()?.detail).toBe('no session surface')
  })

  it('takes itself down after the time-to-live', () => {
    vi.useFakeTimers()
    publishNotice({ key: 'notice.openFailed' }, 5_000)
    expect(getNotice()).toBeDefined()
    vi.advanceTimersByTime(4_999)
    expect(getNotice()).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(getNotice()).toBeUndefined()
  })

  it('restarts the countdown when a newer message replaces the old one', () => {
    vi.useFakeTimers()
    publishNotice({ key: 'notice.openFailed' }, 5_000)
    vi.advanceTimersByTime(4_000)
    publishNotice({ key: 'notice.openFailed', detail: 'again' }, 5_000)
    vi.advanceTimersByTime(4_000)
    expect(getNotice()).toBeDefined()
    vi.advanceTimersByTime(1_000)
    expect(getNotice()).toBeUndefined()
  })

  it('stays until it is dismissed when the time-to-live is zero', () => {
    vi.useFakeTimers()
    publishNotice({ key: 'notice.openFailed' }, 0)
    vi.advanceTimersByTime(60_000)
    expect(getNotice()).toBeDefined()
  })

  it('notifies nobody when there was nothing to dismiss', () => {
    const listener = vi.fn()
    subscribeNotice(listener)
    dismissNotice()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying an unsubscribed listener', () => {
    const listener = vi.fn()
    const stop = subscribeNotice(listener)
    publishNotice({ key: 'notice.openFailed' })
    stop()
    publishNotice({ key: 'notice.openFailed', detail: 'second' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

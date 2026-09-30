// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { historyOf, storeFor, type SideChatStore } from '../src/client/store.ts'

/** Every store is keyed by session and lives for the page; give each test its own. */
let counter = 0
function freshStore(): SideChatStore {
  counter += 1
  return storeFor(`test-session-${counter}`)
}

/** Collect the snapshots a subscriber sees, to prove changes are published. */
function snapshotLog(store: SideChatStore): { readonly seen: number[]; readonly stop: () => void } {
  const seen: number[] = []
  const stop = store.subscribe(() => { seen.push(store.getSnapshot().revision) })
  return { seen, stop }
}

describe('side-chat store', () => {
  it('buckets state per session instead of sharing one transcript', () => {
    const first = storeFor('session-a')
    const second = storeFor('session-b')
    expect(first).not.toBe(second)
    first.begin('question for a')
    expect(first.getSnapshot().messages).toHaveLength(2)
    expect(second.getSnapshot().messages).toHaveLength(0)
    expect(storeFor('session-a')).toBe(first)
  })

  it('appends the question and a pending answer, and reports streaming', () => {
    const store = freshStore()
    const answerId = store.begin('what is this?')
    const state = store.getSnapshot()
    expect(state.messages.map(message => message.role)).toEqual(['user', 'assistant'])
    expect(state.messages[0]?.text).toBe('what is this?')
    expect(state.messages[1]?.pending).toBe(true)
    expect(state.streaming).toBe(true)
    expect(answerId).toBe(state.messages[1]?.id)
  })

  it('accumulates streamed text into the pending answer only', () => {
    const store = freshStore()
    const first = store.begin('one')
    store.append(first, 'a')
    store.append(first, 'b')
    expect(store.getSnapshot().messages[1]?.text).toBe('ab')
    expect(store.getSnapshot().messages[0]?.text).toBe('one')
  })

  it('ignores an empty delta so a stalled stream does not churn the snapshot', () => {
    const store = freshStore()
    const answerId = store.begin('one')
    const before = store.getSnapshot().revision
    store.append(answerId, '')
    expect(store.getSnapshot().revision).toBe(before)
  })

  it('settles a finished answer and stops streaming', () => {
    const store = freshStore()
    const answerId = store.begin('one')
    store.append(answerId, 'done')
    store.settle(answerId)
    const state = store.getSnapshot()
    expect(state.streaming).toBe(false)
    expect(state.messages[1]?.pending).toBe(false)
    expect(state.messages[1]?.failure).toBeUndefined()
  })

  it('fails an answer that produced no text at all', () => {
    const store = freshStore()
    const answerId = store.begin('one')
    store.settle(answerId)
    expect(store.getSnapshot().messages[1]?.failure).toEqual({ code: 'empty' })
  })

  it('keeps the real reason when a stream failed after streaming some text', () => {
    const store = freshStore()
    const answerId = store.begin('one')
    store.append(answerId, 'half an ans')
    store.fail(answerId, { code: 'host-error', detail: 'provider refused' })
    store.settle(answerId)
    const answer = store.getSnapshot().messages[1]
    expect(answer?.text).toBe('half an ans')
    expect(answer?.failure).toEqual({ code: 'host-error', detail: 'provider refused' })
    expect(answer?.pending).toBe(false)
    expect(store.getSnapshot().streaming).toBe(false)
  })

  it('keeps the classified reason when a turn is stopped mid-stream', () => {
    const store = freshStore()
    const answerId = store.begin('one')
    store.fail(answerId, { code: 'cancelled' })
    expect(store.getSnapshot().messages[1]?.failure).toEqual({ code: 'cancelled' })
  })

  it('ignores a settle or append for an answer that no longer exists', () => {
    const store = freshStore()
    store.begin('one')
    const before = store.getSnapshot()
    store.append('side-chat-answer-999', 'stray')
    store.settle('side-chat-answer-999')
    expect(store.getSnapshot().messages).toEqual(before.messages)
  })

  it('records a second turn while the first still streams, and reports one shared streaming flag', () => {
    const store = freshStore()
    store.begin('first')
    store.begin('second')
    const state = store.getSnapshot()
    // The panel refuses to submit while streaming; the store still records the
    // turn it was given rather than dropping it on the floor, and both turns
    // settle through the same flag.
    expect(state.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(state.streaming).toBe(true)
  })

  it('clears the transcript and the context together', () => {
    const store = freshStore()
    store.setContextMessageId('m1')
    store.setSelection('some text')
    const answerId = store.begin('one')
    store.append(answerId, 'answer')
    store.settle(answerId)
    store.clear()
    const state = store.getSnapshot()
    expect(state.messages).toEqual([])
    expect(state.streaming).toBe(false)
    expect(state.contextMessageId).toBeUndefined()
    expect(state.selection).toBeUndefined()
  })

  it('keeps context changes out of the message list', () => {
    const store = freshStore()
    store.setSelection('picked')
    expect(store.getSnapshot().messages).toEqual([])
    expect(store.getSnapshot().selection).toBe('picked')
  })

  it('notifies subscribers once per change and publishes a new revision each time', () => {
    const store = freshStore()
    const log = snapshotLog(store)
    const answerId = store.begin('one')
    store.append(answerId, 'x')
    store.settle(answerId)
    log.stop()
    expect(log.seen).toEqual([1, 2, 3])
  })

  it('does not notify when setting the same context again', () => {
    const store = freshStore()
    store.setSelection('picked')
    const log = snapshotLog(store)
    store.setSelection('picked')
    store.setContextMessageId(undefined)
    expect(log.seen).toEqual([])
  })
})

describe('side-chat history folding', () => {
  it('carries only settled turns with text', () => {
    const store = freshStore()
    const first = store.begin('q1')
    store.append(first, 'a1')
    store.settle(first)
    const second = store.begin('q2')
    store.append(second, 'partial')
    store.fail(second, { code: 'network' })
    const state = store.getSnapshot()
    expect(historyOf(state)).toEqual([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ])
  })

  it('drops a trailing question whose answer never arrived', () => {
    const store = freshStore()
    const first = store.begin('q1')
    store.append(first, 'a1')
    store.settle(first)
    store.begin('q2 that fails')
    // The retry must continue from the answered part, not from a question the
    // model never answered.
    expect(historyOf(store.getSnapshot())).toEqual([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ])
  })

  it('keeps a whole answered turn and drops only what follows the last answer', () => {
    const store = freshStore()
    for (const [question, answer] of [['q1', 'a1'], ['q2', 'a2']] as const) {
      const id = store.begin(question)
      store.append(id, answer)
      store.settle(id)
    }
    store.begin('q3')
    expect(historyOf(store.getSnapshot()).map(turn => turn.text)).toEqual(['q1', 'a1', 'q2', 'a2'])
  })

  it('drops a whitespace-only answer, and the question it never answered with it', () => {
    const store = freshStore()
    const answerId = store.begin('q')
    store.append(answerId, '   \n ')
    store.settle(answerId)
    expect(historyOf(store.getSnapshot())).toEqual([])
  })

  it('drops the dangling question even when nothing was ever answered', () => {
    const store = freshStore()
    store.begin('q1')
    expect(historyOf(store.getSnapshot())).toEqual([])
  })

  it('is empty for a fresh store', () => {
    expect(historyOf(freshStore().getSnapshot())).toEqual([])
  })
})

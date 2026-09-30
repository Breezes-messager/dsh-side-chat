/**
 * The temporary conversation's only home: process memory in the browser tab.
 *
 * Nothing here is persisted, nothing is sent anywhere except to the Host route
 * that answers one question at a time, and the store dies with the page. That is
 * the entire implementation of "closing the app makes it disappear".
 */
import type { SideChatFailure } from './failure.ts'
import type { SideChatTurn } from '../protocol.ts'

/** One message drawn in the panel. */
export interface SideChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  /** True while the answer is still arriving. */
  readonly pending?: boolean
  /** Set when the turn failed instead of answering; the panel turns it into copy. */
  readonly failure?: SideChatFailure
}

/** One session's side-chat state. */
export interface SideChatState {
  readonly messages: readonly SideChatMessage[]
  /** True while an answer streams. */
  readonly streaming: boolean
  /** The message the panel was opened on, when it was opened from a message. */
  readonly contextMessageId: string | undefined
  /** Text selected in the original conversation, when the panel was opened on a selection. */
  readonly selection: string | undefined
  /** Monotonic counter; the store's snapshot identity. */
  readonly revision: number
}

/** Mutable face the panel and the transport drive. */
export interface SideChatStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): SideChatState
  /** Remember which message the panel was opened on. */
  setContextMessageId(messageId: string | undefined): void
  /** Remember the text the panel was opened on, or drop it. */
  setSelection(selection: string | undefined): void
  /** Append the user's question and a pending answer; returns the answer's id. */
  begin(question: string): string
  /** Append streamed text to a pending answer. */
  append(answerId: string, text: string): void
  /** Settle a pending answer that finished normally; an answer with no text fails as empty. */
  settle(answerId: string): void
  /** Settle a pending answer that failed, keeping the reason on screen. */
  fail(answerId: string, failure: SideChatFailure): void
  /** Drop every message, keeping the panel where it is. */
  clear(): void
}

/** Build one independent store. */
function createStore(): SideChatStore {
  let state: SideChatState = {
    messages: [],
    streaming: false,
    contextMessageId: undefined,
    selection: undefined,
    revision: 0,
  }
  const listeners = new Set<() => void>()
  let nextId = 0

  const publish = (next: Omit<SideChatState, 'revision'>): void => {
    state = { ...next, revision: state.revision + 1 }
    for (const listener of listeners) listener()
  }

  /** Replace one message; a fresh array keeps the snapshot identity honest. */
  const patch = (answerId: string, change: (message: SideChatMessage) => SideChatMessage): void => {
    publish({
      ...state,
      messages: state.messages.map(message => message.id === answerId ? change(message) : message),
    })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    setContextMessageId(messageId) {
      if (state.contextMessageId === messageId) return
      publish({ ...state, contextMessageId: messageId })
    },
    setSelection(selection) {
      if (state.selection === selection) return
      publish({ ...state, selection })
    },
    begin(question) {
      nextId += 1
      const answerId = `side-chat-answer-${nextId}`
      publish({
        ...state,
        streaming: true,
        messages: [
          ...state.messages,
          { id: `side-chat-question-${nextId}`, role: 'user', text: question },
          { id: answerId, role: 'assistant', text: '', pending: true },
        ],
      })
      return answerId
    },
    append(answerId, text) {
      if (text.length === 0) return
      patch(answerId, message => ({ ...message, text: message.text + text }))
    },
    settle(answerId) {
      const target = state.messages.find(message => message.id === answerId)
      const empty = target !== undefined && target.failure === undefined && target.text.trim().length === 0
      publish({
        ...state,
        streaming: false,
        messages: state.messages.map(message => message.id === answerId
          ? { ...message, pending: false, ...(empty ? { failure: { code: 'empty' as const } } : {}) }
          : message),
      })
    },
    fail(answerId, failure) {
      patch(answerId, message => ({ ...message, pending: false, failure }))
      publish({ ...state, streaming: false })
    },
    clear() {
      publish({ messages: [], streaming: false, contextMessageId: undefined, selection: undefined })
    },
  }
}

const stores = new Map<string, SideChatStore>()

/**
 * The store for one session; created on first use and kept for the page's life.
 * @param sessionId - the Session the panel is mounted for.
 * @returns that Session's store.
 */
export function storeFor(sessionId: string): SideChatStore {
  const existing = stores.get(sessionId)
  if (existing !== undefined) return existing
  const created = createStore()
  stores.set(sessionId, created)
  return created
}

/**
 * Fold the settled turns a request carries as history.
 *
 * A question whose answer never arrived — failed, stopped, or still streaming —
 * is not part of the conversation the next question continues from, so it is
 * dropped rather than sent as a dangling user turn.
 * @param state - the session's current state.
 * @returns the settled turns, oldest first.
 */
export function historyOf(state: SideChatState): SideChatTurn[] {
  const history: SideChatTurn[] = []
  for (const message of state.messages) {
    if (message.pending === true || message.failure !== undefined) continue
    if (message.text.trim().length === 0) continue
    history.push({ role: message.role, text: message.text })
  }
  while (history.length > 0 && history[history.length - 1]?.role === 'user') history.pop()
  return history
}

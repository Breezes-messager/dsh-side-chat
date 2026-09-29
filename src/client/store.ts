/**
 * The temporary conversation's only home: process memory in the browser tab.
 *
 * Nothing here is persisted, nothing is sent anywhere except to the Host route
 * that answers one question at a time, and the store dies with the page. That is
 * the entire implementation of "closing the app makes it disappear".
 */
import type { SideChatTurn } from '../protocol.ts'

/** One message drawn in the panel. */
export interface SideChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  /** True while the answer is still arriving. */
  readonly pending?: boolean
  /** Set when the turn failed instead of answering. */
  readonly failed?: boolean
}

/** One session's side-chat state. */
export interface SideChatState {
  readonly messages: readonly SideChatMessage[]
  /** True while an answer streams. */
  readonly streaming: boolean
  /** The message the panel was opened on, when it was opened from a message. */
  readonly contextMessageId: string | undefined
  /** Monotonic counter; the store's snapshot identity. */
  readonly revision: number
}

/** Mutable face the panel and the transport drive. */
export interface SideChatStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): SideChatState
  /** Remember which message the panel was opened on. */
  setContextMessageId(messageId: string | undefined): void
  /** Append the user's question and a pending answer; returns the answer's id. */
  begin(question: string): string
  /** Append streamed text to a pending answer. */
  append(answerId: string, text: string): void
  /** Settle a pending answer. */
  settle(answerId: string, failure?: string): void
  /** Drop every message, keeping the panel where it is. */
  clear(): void
}

/** Build one independent store. */
function createStore(): SideChatStore {
  let state: SideChatState = { messages: [], streaming: false, contextMessageId: undefined, revision: 0 }
  const listeners = new Set<() => void>()
  let nextId = 0

  const publish = (next: Omit<SideChatState, 'revision'>): void => {
    state = { ...next, revision: state.revision + 1 }
    for (const listener of listeners) listener()
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
      publish({
        ...state,
        messages: state.messages.map(message =>
          message.id === answerId ? { ...message, text: message.text + text } : message),
      })
    },
    settle(answerId, failure) {
      publish({
        ...state,
        streaming: false,
        messages: state.messages.map(message => message.id === answerId
          ? failure === undefined
            ? { ...message, pending: false }
            : { ...message, pending: false, failed: true, text: message.text }
          : message),
      })
    },
    clear() {
      publish({ messages: [], streaming: false, contextMessageId: undefined })
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

/** Fold the settled turns a request carries as history. */
export function historyOf(state: SideChatState): SideChatTurn[] {
  const history: SideChatTurn[] = []
  for (const message of state.messages) {
    if (message.pending === true || message.failed === true) continue
    if (message.text.trim().length === 0) continue
    history.push({ role: message.role, text: message.text })
  }
  return history
}

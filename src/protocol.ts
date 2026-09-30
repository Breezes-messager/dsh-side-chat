/**
 * Wire contract shared by the Side chat Host half and its browser half.
 *
 * Everything here is plain JSON-shaped data with no runtime dependency, so the
 * same module compiles into the Node half and into the `window.__ModuleLoader__`
 * browser bundle without dragging either environment's types along.
 */

/** Host route the browser half streams one answer from. */
export const SIDE_CHAT_ROUTE = '/side-chat/ask'

/** Right-Sidebar tab kind this plugin owns. */
export const SIDE_CHAT_KIND = 'side-chat'

/**
 * The tab type's identity in the tab system. It is also the key the body
 * registers under in the `sidebar.right.pane.tab` seat, so it must be unique
 * across every registration in the process — the package name is the value the
 * tab kit documents for this.
 */
export const SIDE_CHAT_TAB_ID = 'dsh-side-chat-plugin'

/** Copy namespace registered with the client locale service. */
export const SIDE_CHAT_NS = 'sideChat'

/** Slot entry ids; a fresh id appends an action, reusing one replaces it. */
export const HEADER_ACTION_ID = 'side-chat'
export const MESSAGE_ACTION_ID = 'side-chat'
export const SELECTION_ACTION_ID = 'side-chat'

/** One participant in the temporary conversation. */
export type SideChatRole = 'user' | 'assistant'

/** One completed turn of the temporary conversation, held by the browser only. */
export interface SideChatTurn {
  readonly role: SideChatRole
  readonly text: string
}

/**
 * One request for one answer.
 *
 * The conversation history travels with every request and is never stored on the
 * host: that is what makes the temporary chat temporary. Nothing about a side
 * chat outlives the browser tab, and nothing is written to the Session log.
 */
export interface SideChatAskRequest {
  /** What the user typed. */
  readonly question: string
  /** Every settled turn before this question, oldest first. */
  readonly history: readonly SideChatTurn[]
  /** Session whose conversation supplies context, when one is open. */
  readonly sessionId?: string
  /** Exact messages the user asked about; absent means "the recent conversation". */
  readonly messageIds?: readonly string[]
  /**
   * Text the user selected in the original conversation and asked about.
   *
   * Travels with the request rather than living anywhere: it is the same kind of
   * temporary input as the question itself.
   */
  readonly selection?: string
  /** Explicit route override; absent lets the Host follow the Session's own model. */
  readonly model?: { readonly provider: string; readonly model: string }
}

/**
 * Why an answer stopped, as a value the browser can translate.
 *
 * `message` on the same frame is a readable English fallback; a client that has
 * its own copy asks the dictionary for `code` and falls back to `message` when
 * it does not know the code yet.
 */
export type SideChatErrorCode =
  /** No provider/model could be resolved: nothing is configured and no Session offers a route. */
  | 'model-route-missing'
  /** The Host has no `llm` service to call. */
  | 'model-service-missing'
  /** The provider itself refused or failed the call. */
  | 'model-failed'
  /** The answer exceeded the configured time limit and was stopped. */
  | 'request-timeout'
  /** Anything unexpected; the detail goes to the Host log, not to the panel. */
  | 'internal-error'

/** One server-sent frame of an answer. */
export type SideChatFrame =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'notice'; readonly text: string }
  | { readonly type: 'error'; readonly message: string; readonly code?: SideChatErrorCode }
  | { readonly type: 'done' }

/** Encode one frame as an SSE event. */
export function encodeFrame(frame: SideChatFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`
}

/**
 * Parse the frames out of a chunk-decoded SSE buffer.
 * @param buffer - accumulated text; frames without a terminator stay in it.
 * @returns the decoded frames plus the unconsumed remainder.
 */
export function decodeFrames(buffer: string): { readonly frames: SideChatFrame[]; readonly rest: string } {
  const frames: SideChatFrame[] = []
  let rest = buffer
  for (;;) {
    const boundary = rest.indexOf('\n\n')
    if (boundary < 0) break
    const block = rest.slice(0, boundary)
    rest = rest.slice(boundary + 2)
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload.length === 0) continue
      try {
        frames.push(JSON.parse(payload) as SideChatFrame)
      } catch {
        // A truncated or malformed frame is dropped: the stream itself carries
        // the authoritative `done`/`error` frame that ends the turn.
      }
    }
  }
  return { frames, rest }
}

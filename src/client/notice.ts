/**
 * One page-wide message the user has to see, for the failures that happen
 * before the panel exists.
 *
 * The three ways into the panel are buttons in someone else's surface: the
 * conversation header, a message's action row, and the floating selection
 * action. When opening the column fails — there is no conversation open to hold
 * it — the click has to say so somewhere. A `console.warn` is invisible to the
 * person who clicked, so the same event also publishes here and the frame-wide
 * overlay draws it.
 *
 * The state is a module singleton on purpose: the button that fails and the
 * overlay that shows the reason live in different registrations with no shared
 * parent, and this is the one channel between them.
 */

/** What the overlay is currently saying. */
export interface SideChatNotice {
  /** Dictionary key of the message. */
  readonly key: string
  /** Raw reason, shown smaller, when there is one. */
  readonly detail?: string
}

/** How long a notice stays up before it takes itself down. */
const DEFAULT_TTL_MS = 8_000

let current: SideChatNotice | undefined
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

/** Tell every subscriber the notice changed. */
function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Subscribe to notice changes.
 * @param listener - called after every change.
 * @returns the unsubscribe function.
 */
export function subscribeNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The notice on display, or `undefined`. */
export function getNotice(): SideChatNotice | undefined {
  return current
}

/**
 * Put one message on screen, replacing whatever was there.
 * @param notice - the message to show.
 * @param ttlMs - how long to leave it up; `0` keeps it until it is dismissed.
 */
export function publishNotice(notice: SideChatNotice, ttlMs: number = DEFAULT_TTL_MS): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  current = notice
  if (ttlMs > 0) {
    timer = setTimeout(() => { dismissNotice() }, ttlMs)
    // A notice must never hold a Node process (or a test run) open.
    const handle = timer as unknown as { unref?: () => void }
    handle.unref?.()
  }
  notify()
}

/** Take the notice down. */
export function dismissNotice(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  if (current === undefined) return
  current = undefined
  notify()
}

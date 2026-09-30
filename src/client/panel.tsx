/**
 * The side-chat panel: the temporary conversation in a right-Sidebar tab.
 *
 * The panel owns no persistent state at all. Its transcript lives in a
 * page-memory store keyed by Session, its context is re-read from the Host on
 * every question, and closing the app takes both with it — which is exactly what
 * the empty state promises the reader.
 *
 * The composer is always mounted, including over the empty state: the panel is
 * opened to ask something, so the thing you type into must never be the part
 * that is missing.
 *
 * Keyboard contract, which is also what the automated tests assert on:
 * - `Enter` sends, `Shift+Enter` starts a new line, and an Enter that belongs to
 *   an input method (Chinese/Japanese/Korean composition) never sends.
 * - `Escape` stops the answer that is streaming, or closes the panel otherwise.
 * - The caret lands in the composer as soon as the panel is on screen, so
 *   opening it is enough to start typing.
 *
 * Reading contract: the transcript follows the newest text while the reader is
 * at the bottom, and stops following the moment the reader scrolls up — a long
 * answer must never yank the page back down mid-sentence.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SideChatAskRequest } from '../protocol.ts'
import { messageIdOf, selectionOf, type TabBodyProps } from './contract.ts'
import { classifyHostError, classifyThrown, failureFromNotice, type SideChatFailure } from './failure.ts'
import { SideChatGlyph } from './icons.tsx'
import { FAILURE_COPY, fallbackTranslate } from './locales.ts'
import { Markdown } from './Markdown.tsx'
import { CLASS, ensureStyles } from './styles.ts'
import { historyOf, storeFor, type SideChatState } from './store.ts'
import { askSideChat } from './transport.ts'

/** How much of a selected fragment the context row shows. */
const SELECTION_PREVIEW_CHARS = 60

/** Tallest the composer grows before it scrolls instead. */
const COMPOSER_MAX_HEIGHT = 160

/** Distance from the bottom, in pixels, that still counts as "at the bottom". */
const STICK_THRESHOLD = 24

/** What one key pressed in the composer means. */
export type ComposerKeyAction = 'send' | 'newline' | 'ignore'

/** The parts of a key event the composer cares about. */
export interface ComposerKeyEvent {
  readonly key: string
  readonly shiftKey: boolean
  /** Set by the browser while an input method is composing. */
  readonly isComposing?: boolean
  /** The legacy marker an input method sets on the Enter that confirms a candidate. */
  readonly keyCode?: number
}

/**
 * Decide what the composer does with one key press.
 *
 * Pure so the whole keyboard contract is testable without a DOM — including the
 * input-method case, which is the one that silently breaks a Chinese, Japanese,
 * or Korean sentence in half if it is missed.
 * @param event - the key event.
 * @returns whether to send, insert a newline, or leave it alone.
 */
export function composerKey(event: ComposerKeyEvent): ComposerKeyAction {
  if (event.key !== 'Enter') return 'ignore'
  if (event.shiftKey) return 'newline'
  if (event.isComposing === true || event.keyCode === 229) return 'ignore'
  return 'send'
}

/** What one `Escape` means while the panel is open. */
export type EscapeAction = 'stop' | 'close' | 'none'

/**
 * Decide what `Escape` does.
 * @param streaming - whether an answer is arriving.
 * @param canClose - whether the tab handed the body a close action.
 * @returns stop the answer first; close the panel when nothing is running.
 */
export function escapeAction(streaming: boolean, canClose: boolean): EscapeAction {
  if (streaming) return 'stop'
  return canClose ? 'close' : 'none'
}

/**
 * Draw one answer that has something to say about how it ended.
 * @param props - the failure and the copy function.
 * @returns the failure line, or nothing.
 */
function FailureNote({ failure, t }: { readonly failure: SideChatFailure; readonly t: (key: string) => string }) {
  // A stop the reader asked for is not an error: it says what happened without
  // painting the panel red.
  const stopped = failure.code === 'cancelled'
  return (
    <div
      className={stopped ? CLASS.failure : `${CLASS.failure} ${CLASS.failureError}`}
      {...(stopped ? {} : { role: 'alert' })}
    >
      <span>{t(FAILURE_COPY[failure.code])}</span>
      {failure.detail === undefined
        ? null
        : <span className={CLASS.failureDetail}>{failure.detail}</span>}
    </div>
  )
}

/**
 * Draw the side-chat panel for one Session.
 * @param props - the standard Session props plus the tab record's navigation.
 * @returns the panel.
 */
export function SideChatBody(props: TabBodyProps) {
  ensureStyles()
  const sessionId = props.sessionId ?? ''
  const store = useMemo(() => storeFor(sessionId), [sessionId])
  const state: SideChatState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const t = props.t ?? fallbackTranslate

  const [draft, setDraft] = useState('')
  const abort = useRef<AbortController | null>(null)
  const transcript = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  /** Whether the transcript should keep following the newest text. */
  const stick = useRef(true)

  // The tab kit delivers the tab record through an injected hook. Whether the
  // hook is present is fixed for a given installation, so this conditional call
  // is stable across every render of one mounted panel.
  const useTabInfo = props.useTabInfo
  const tab = typeof useTabInfo === 'function' ? useTabInfo().tab : props.tab

  // The tab's navigation params name what the panel was opened on — a message,
  // or text selected in the original conversation. They are re-read on every
  // navigation, so asking about something else retargets a panel that is already
  // open instead of opening a second one.
  const params = tab?.navigation?.params
  const revision = tab?.navigation?.revision
  useEffect(() => {
    store.setContextMessageId(messageIdOf(params))
    store.setSelection(selectionOf(params))
  }, [store, params, revision])

  // Arriving with context means the question is about to be typed, so the caret
  // belongs in the composer. So does opening an empty panel: the panel is opened
  // to ask something, and a click that lands nowhere reads as a broken button.
  const visible = tab?.visible !== false
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || !visible) return
    if (state.messages.length > 0 && state.contextMessageId === undefined && state.selection === undefined) return
    focused.current = true
    input.current?.focus()
  }, [visible, state.messages.length, state.contextMessageId, state.selection])

  useEffect(() => {
    const element = transcript.current
    if (element === null || !stick.current) return
    element.scrollTop = element.scrollHeight
  }, [state.revision])

  // Grow the composer with what is in it, up to a limit: a long question has to
  // stay readable while it is being written.
  useEffect(() => {
    const element = input.current
    if (element === null) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }, [draft])

  useEffect(() => () => { abort.current?.abort() }, [])

  /** Remember whether the reader is still at the bottom of the transcript. */
  const onTranscriptScroll = useCallback((): void => {
    const element = transcript.current
    if (element === null) return
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD
  }, [])

  const submit = useCallback((): void => {
    const question = draft.trim()
    if (question.length === 0 || state.streaming) return
    const history = historyOf(store.getSnapshot())
    setDraft('')
    stick.current = true
    const answerId = store.begin(question)
    const controller = new AbortController()
    abort.current = controller
    const request: SideChatAskRequest = {
      question,
      history,
      ...(sessionId.length > 0 ? { sessionId } : {}),
      ...(state.contextMessageId !== undefined ? { messageIds: [state.contextMessageId] } : {}),
      ...(state.selection !== undefined ? { selection: state.selection } : {}),
    }
    void askSideChat(request, (frame) => {
      if (frame.type === 'text') store.append(answerId, frame.text)
      else if (frame.type === 'notice') {
        // An empty answer arrives as a notice, not an error, but it is the same
        // dead end for the reader, so it gets the same actionable copy.
        const failure = failureFromNotice(frame.text)
        if (failure === undefined) store.append(answerId, frame.text)
        else store.fail(answerId, failure)
      } else if (frame.type === 'error') store.fail(answerId, classifyHostError(frame.message, frame.code))
    }, controller.signal)
      .then(() => {
        // Stopping is an ending too: the reader asked for it, and the panel
        // says so instead of leaving a half answer looking finished.
        if (controller.signal.aborted) store.fail(answerId, { code: 'cancelled' })
        else store.settle(answerId)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          store.fail(answerId, { code: 'cancelled' })
          return
        }
        // The panel is the only place the reason can surface; a silent failure
        // would read as "the side chat does not work".
        console.warn('dsh-side-chat: request failed', error)
        store.fail(answerId, classifyThrown(error))
      })
      .finally(() => {
        if (abort.current === controller) abort.current = null
      })
  }, [draft, sessionId, state.contextMessageId, state.selection, state.streaming, store])

  const stop = useCallback((): void => { abort.current?.abort() }, [])

  /** `Escape` stops a running answer, or closes the panel when nothing runs. */
  const onKeyDown = useCallback((event: { key: string, preventDefault: () => void }): void => {
    if (event.key !== 'Escape') return
    const action = escapeAction(state.streaming, typeof tab?.actions?.close === 'function')
    if (action === 'stop') {
      event.preventDefault()
      stop()
      return
    }
    if (action === 'close') {
      event.preventDefault()
      tab?.actions?.close?.()
    }
  }, [state.streaming, stop, tab])

  const selectionPreview = state.selection === undefined
    ? ''
    : state.selection.length > SELECTION_PREVIEW_CHARS
      ? `${state.selection.slice(0, SELECTION_PREVIEW_CHARS)}…`
      : state.selection

  const contextLabel = state.selection !== undefined
    ? t('context.selection')
    : state.contextMessageId === undefined
      ? t('context.recent')
      : t('context.quoted')

  return (
    <div className={CLASS.root} onKeyDown={onKeyDown}>
      {state.messages.length === 0
        ? (
            <div className={CLASS.empty}>
              <span className={CLASS.emptyIcon}><SideChatGlyph size={34} /></span>
              <h2 className={CLASS.emptyTitle}>{t('empty.title')}</h2>
              <p className={CLASS.emptyBody}>{t('empty.body')}</p>
              <p className={CLASS.emptyHint}>{t('empty.example')}</p>
            </div>
          )
        : (
            <div
              className={CLASS.transcript}
              ref={transcript}
              onScroll={onTranscriptScroll}
              role="log"
              aria-live="polite"
              aria-busy={state.streaming}
              aria-label={t('a11y.transcript')}
            >
              {state.messages.map(message => (
                <div
                  key={message.id}
                  className={message.role === 'user' ? `${CLASS.turn} ${CLASS.turnUser}` : CLASS.turn}
                >
                  {message.role === 'user'
                    ? <div className={CLASS.userBubble}>{message.text}</div>
                    : (
                        <div className={CLASS.assistant}>
                          {message.text.length === 0
                            ? null
                            : message.failure === undefined
                              ? <Markdown text={message.text} />
                              : <span className={CLASS.partial}>{message.text}</span>}
                          {message.failure === undefined
                            ? null
                            : <FailureNote failure={message.failure} t={t} />}
                          {message.pending === true ? <span className={CLASS.caret} /> : null}
                        </div>
                      )}
                </div>
              ))}
            </div>
          )}

      <div className={CLASS.context}>
        <SideChatGlyph size={13} />
        <span className={CLASS.contextText}>
          {contextLabel}
          {selectionPreview.length > 0 ? `${t('context.join')}${selectionPreview}` : ''}
        </span>
        {state.selection === undefined && state.contextMessageId === undefined
          ? null
          : (
              <button
                type="button"
                className={CLASS.contextClear}
                title={t('context.clear')}
                aria-label={t('context.clear')}
                onClick={() => {
                  store.setContextMessageId(undefined)
                  store.setSelection(undefined)
                }}
              >×</button>
            )}
      </div>

      <div className={CLASS.composer}>
        <textarea
          ref={input}
          className={CLASS.input}
          value={draft}
          placeholder={t('composer.placeholder')}
          aria-label={t('a11y.question')}
          rows={1}
          onChange={(event) => { setDraft(event.currentTarget.value) }}
          onKeyDown={(event) => {
            const action = composerKey({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
              keyCode: event.keyCode,
            })
            if (action !== 'send') return
            event.preventDefault()
            submit()
          }}
        />
        {state.streaming
          ? (
              <button
                type="button"
                className={CLASS.send}
                onClick={stop}
                aria-label={t('a11y.stop')}
              >{t('composer.stop')}</button>
            )
          : (
              <button
                type="button"
                className={CLASS.send}
                disabled={draft.trim().length === 0}
                onClick={submit}
                aria-label={t('a11y.send')}
              >{t('composer.send')}</button>
            )}
      </div>

      <div className={CLASS.footer}>
        <span role="status">{state.streaming ? t('status.thinking') : t('notice.temporary')}</span>
        {state.messages.length === 0
          ? null
          : <button type="button" className={CLASS.ghost} onClick={() => { store.clear() }}>{t('action.clear')}</button>}
      </div>
    </div>
  )
}

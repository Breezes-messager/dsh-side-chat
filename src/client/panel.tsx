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
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SideChatAskRequest } from '../protocol.ts'
import { messageIdOf, selectionOf, type TabBodyProps } from './contract.ts'
import { SideChatGlyph } from './icons.tsx'
import { fallbackTranslate } from './locales.ts'
import { CLASS, ensureStyles } from './styles.ts'
import { historyOf, storeFor, type SideChatState } from './store.ts'
import { askSideChat } from './transport.ts'

/** How much of a selected fragment the context row shows. */
const SELECTION_PREVIEW_CHARS = 60

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

  // Arriving with context means the question is about to be typed, so the
  // caret belongs in the composer.
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current) return
    if (state.contextMessageId === undefined && state.selection === undefined) return
    focused.current = true
    input.current?.focus()
  }, [state.contextMessageId, state.selection])

  useEffect(() => {
    const element = transcript.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [state.revision])

  useEffect(() => () => { abort.current?.abort() }, [])

  const submit = useCallback((): void => {
    const question = draft.trim()
    if (question.length === 0 || state.streaming) return
    const history = historyOf(store.getSnapshot())
    setDraft('')
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
      else if (frame.type === 'notice') store.append(answerId, frame.text)
      else if (frame.type === 'error') store.fail(answerId, frame.message)
    }, controller.signal)
      .then(() => { store.settle(answerId) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          store.settle(answerId)
          return
        }
        // The panel is the only place the reason can surface; a silent failure
        // would read as "the side chat does not work".
        console.warn('dsh-side-chat: request failed', error)
        store.fail(answerId, error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (abort.current === controller) abort.current = null
      })
  }, [draft, sessionId, state.contextMessageId, state.selection, state.streaming, store])

  const stop = useCallback((): void => { abort.current?.abort() }, [])

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
    <div className={CLASS.root}>
      {state.messages.length === 0
        ? (
            <div className={CLASS.empty}>
              <span className={CLASS.emptyIcon}><SideChatGlyph size={34} /></span>
              <h2 className={CLASS.emptyTitle}>{t('empty.title')}</h2>
              <p className={CLASS.emptyBody}>{t('empty.body')}</p>
            </div>
          )
        : (
            <div className={CLASS.transcript} ref={transcript}>
              {state.messages.map(message => (
                <div
                  key={message.id}
                  className={message.role === 'user' ? `${CLASS.turn} ${CLASS.turnUser}` : CLASS.turn}
                >
                  {message.role === 'user'
                    ? <div className={CLASS.userBubble}>{message.text}</div>
                    : (
                        <div className={message.failed === true ? `${CLASS.assistant} ${CLASS.error}` : CLASS.assistant}>
                          {message.failed === true ? `${t('error.prefix')}${message.text}` : message.text}
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
          {selectionPreview.length > 0 ? `：${selectionPreview}` : ''}
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
          rows={1}
          onChange={(event) => { setDraft(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {state.streaming
          ? <button type="button" className={CLASS.send} onClick={stop}>{t('composer.stop')}</button>
          : (
              <button
                type="button"
                className={CLASS.send}
                disabled={draft.trim().length === 0}
                onClick={submit}
              >{t('composer.send')}</button>
            )}
      </div>

      <div className={CLASS.footer}>
        <span>{state.streaming ? t('status.thinking') : t('notice.temporary')}</span>
        {state.messages.length === 0
          ? null
          : <button type="button" className={CLASS.ghost} onClick={() => { store.clear() }}>{t('action.clear')}</button>}
      </div>
    </div>
  )
}

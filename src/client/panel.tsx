/**
 * The side-chat panel: the temporary conversation in a right-Sidebar tab.
 *
 * The panel owns no persistent state at all. Its transcript lives in a
 * page-memory store keyed by Session, its context is re-read from the Host on
 * every question, and closing the app takes both with it — which is exactly what
 * the empty state promises the reader.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SideChatAskRequest } from '../protocol.ts'
import { messageIdOf, type TabBodyProps } from './contract.ts'
import { SideChatGlyph } from './icons.tsx'
import { fallbackTranslate } from './locales.ts'
import { CLASS, ensureStyles } from './styles.ts'
import { historyOf, storeFor, type SideChatState } from './store.ts'
import { askSideChat } from './transport.ts'

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

  // The tab kit delivers the tab record through an injected hook. Whether the
  // hook is present is fixed for a given installation, so this conditional call
  // is stable across every render of one mounted panel.
  const useTabInfo = props.useTabInfo
  const tab = typeof useTabInfo === 'function' ? useTabInfo().tab : props.tab

  // The tab's navigation params name the message the panel was opened on. They
  // are re-read on every navigation, so "ask about this one" retargets a panel
  // that is already open instead of opening a second one.
  const params = tab?.navigation?.params
  const revision = tab?.navigation?.revision
  useEffect(() => {
    store.setContextMessageId(messageIdOf(params))
  }, [store, params, revision])

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
    }
    void askSideChat(request, (frame) => {
      if (frame.type === 'text') store.append(answerId, frame.text)
      else if (frame.type === 'notice') store.append(answerId, frame.text)
      else if (frame.type === 'error') store.settle(answerId, frame.message)
    }, controller.signal)
      .then(() => { store.settle(answerId) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          store.settle(answerId)
          return
        }
        store.settle(answerId, error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (abort.current === controller) abort.current = null
      })
  }, [draft, sessionId, state.contextMessageId, state.streaming, store])

  const stop = useCallback((): void => { abort.current?.abort() }, [])

  if (state.messages.length === 0) {
    return (
      <div className={CLASS.root}>
        <div className={CLASS.empty}>
          <span className={CLASS.emptyIcon}><SideChatGlyph size={34} /></span>
          <h2 className={CLASS.emptyTitle}>{t('empty.title')}</h2>
          <p className={CLASS.emptyBody}>{t('empty.body')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={CLASS.root}>
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

      <div className={CLASS.context}>
        <SideChatGlyph size={13} />
        <span>{state.contextMessageId === undefined ? t('context.recent') : t('context.quoted')}</span>
      </div>

      <div className={CLASS.composer}>
        <textarea
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
        <button type="button" className={CLASS.ghost} onClick={() => { store.clear() }}>{t('action.clear')}</button>
      </div>
    </div>
  )
}

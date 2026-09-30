/**
 * The frame-wide notice: the one place a click can explain itself when the
 * panel it was supposed to open could not be opened.
 *
 * It rides the `shell.overlay` layer beside the selection action, because that
 * is the only seat this plugin owns that exists before (and without) any
 * conversation being open.
 */
import { useSyncExternalStore } from 'react'
import { fallbackTranslate } from './locales.ts'
import { dismissNotice, getNotice, subscribeNotice } from './notice.ts'
import { CLASS, ensureStyles } from './styles.ts'

/** Props of {@link SideChatNoticeBar}. */
export interface NoticeBarProps {
  readonly t?: (key: string) => string
}

/**
 * Draw the current notice, if there is one.
 * @param props - the copy function.
 * @returns the notice bar, or nothing.
 */
export function SideChatNoticeBar({ t = fallbackTranslate }: NoticeBarProps) {
  ensureStyles()
  const notice = useSyncExternalStore(subscribeNotice, getNotice, getNotice)
  if (notice === undefined) return null
  return (
    <div className={CLASS.notice} role="status" aria-live="polite">
      <span className={CLASS.noticeText}>{t(notice.key)}</span>
      <button
        type="button"
        className={CLASS.noticeClose}
        title={t('notice.dismiss')}
        aria-label={t('notice.dismiss')}
        onClick={dismissNotice}
      >×</button>
    </div>
  )
}

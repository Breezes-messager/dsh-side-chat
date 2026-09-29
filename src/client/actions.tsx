/**
 * The two ways into a side chat, short of opening its tab from the guide:
 * a control in the conversation header, and one action on every finished
 * assistant message.
 *
 * Neither renders a transcript of its own — both are buttons whose click opens
 * (or retargets) the panel, which is where the conversation actually lives.
 */
import { fallbackTranslate } from './locales.ts'
import { SideChatGlyph } from './icons.tsx'
import { CLASS, ensureStyles } from './styles.ts'

/** Props of {@link SideChatHeaderButton}. */
export interface HeaderButtonProps {
  readonly t?: (key: string) => string
  /** Opens the side-chat tab for the mounted Session. */
  readonly open?: () => void
}

/**
 * The conversation header's side-chat control.
 * @param props - copy and the injected open action.
 * @returns the header button.
 */
export function SideChatHeaderButton({ t = fallbackTranslate, open }: HeaderButtonProps) {
  ensureStyles()
  return (
    <button
      type="button"
      className={CLASS.headerButton}
      title={t('header.open')}
      onClick={() => { open?.() }}
    >
      <SideChatGlyph size={15} />
      <span>{t('header.open')}</span>
    </button>
  )
}

/** Props of {@link AskInSideChatAction}. */
export interface AskActionProps {
  /** The message this entry was rendered for, supplied by the slot's owner. */
  readonly messageId?: string
  readonly t?: (key: string) => string
  /** Opens the side chat with this message attached as context. */
  readonly askAbout?: (messageId: string) => void
}

/**
 * The "ask in side chat" entry in a finished assistant message's action row.
 * @param props - the message identity, copy, and the injected action.
 * @returns the action button, or nothing when the slot passed no message.
 */
export function AskInSideChatAction({ messageId, t = fallbackTranslate, askAbout }: AskActionProps) {
  ensureStyles()
  if (messageId === undefined) return null
  return (
    <button
      type="button"
      className={CLASS.messageAction}
      title={t('action.ask')}
      aria-label={t('action.ask')}
      onClick={() => { askAbout?.(messageId) }}
    >
      <SideChatGlyph size={15} />
    </button>
  )
}

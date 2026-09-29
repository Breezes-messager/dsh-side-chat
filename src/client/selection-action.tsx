/**
 * "Ask in side chat" for a selection made in the original conversation.
 *
 * DeepSeek Harness has no selection-menu seat, so this rides the frame-wide
 * `shell.overlay` layer instead: it watches the document selection, and while a
 * non-empty selection sits outside the side chat's own panel it draws one
 * floating button just above it. Pressing the button opens (or retargets) the
 * side-chat tab with that text as context.
 *
 * The layer itself stays click-through; only the button takes pointer events.
 */
import { useEffect, useState } from 'react'
import { fallbackTranslate } from './locales.ts'
import { SideChatGlyph } from './icons.tsx'
import { CLASS, ensureStyles } from './styles.ts'

/** Shortest selection worth offering the action for. */
const MIN_SELECTION_CHARS = 2

/** Where the button sits, in viewport coordinates. */
interface Anchor {
  readonly x: number
  readonly y: number
  readonly text: string
}

/** Props of {@link SideChatSelectionAction}. */
export interface SelectionActionProps {
  readonly t?: (key: string) => string
  /** Opens the side chat with this text as context. */
  readonly openWithSelection?: (text: string) => void
}

/**
 * Read the current selection when it is one this action should offer.
 * @returns the anchor and text, or `undefined`.
 */
function readSelection(): Anchor | undefined {
  if (typeof window === 'undefined') return undefined
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined
  const text = selection.toString().trim()
  if (text.length < MIN_SELECTION_CHARS) return undefined
  const node = selection.anchorNode
  const element = node instanceof Element ? node : node?.parentElement ?? null
  // A selection inside the side chat itself, or inside any editable surface, is
  // not "the original conversation".
  if (element === null || element.closest('.sc-root, input, textarea, [contenteditable="true"]') !== null) {
    return undefined
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  const x = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90)
  const y = Math.max(rect.top - 6, 44)
  return { x, y, text }
}

/**
 * Draw the floating selection action while a conversation selection exists.
 * @param props - copy and the injected open action.
 * @returns the button, or nothing while no selection is offered.
 */
export function SideChatSelectionAction({ t = fallbackTranslate, openWithSelection }: SelectionActionProps) {
  ensureStyles()
  const [anchor, setAnchor] = useState<Anchor | undefined>(undefined)

  useEffect(() => {
    const read = (): void => { setAnchor(readSelection()) }
    const clear = (): void => { setAnchor(undefined) }
    document.addEventListener('selectionchange', read)
    document.addEventListener('mouseup', read, true)
    document.addEventListener('keyup', read, true)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('resize', clear)
    return () => {
      document.removeEventListener('selectionchange', read)
      document.removeEventListener('mouseup', read, true)
      document.removeEventListener('keyup', read, true)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('resize', clear)
    }
  }, [])

  if (anchor === undefined) return null
  return (
    <button
      type="button"
      className={CLASS.selectionButton}
      style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
      // Keeping the selection alive keeps the context the user just chose.
      onMouseDown={(event) => { event.preventDefault() }}
      onClick={() => {
        openWithSelection?.(anchor.text)
        window.getSelection()?.removeAllRanges()
        setAnchor(undefined)
      }}
    >
      <SideChatGlyph size={14} />
      <span>{t('action.ask')}</span>
    </button>
  )
}

/**
 * The panel's one glyph: a speech bubble carrying a plus, the mark the side chat
 * is opened by and recognised as.
 */

/** Props of {@link SideChatGlyph}. */
export interface GlyphProps {
  /** Rendered edge length in pixels. */
  readonly size?: number
}

/**
 * Draw the side-chat mark.
 * @param props - the rendered size.
 * @returns the inline SVG.
 */
export function SideChatGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 3.2c-4.86 0-8.8 3.5-8.8 7.83 0 2.5 1.32 4.72 3.4 6.15v3.02c0 .43.5.65.82.36l2.9-2.7c.53.09 1.1.13 1.68.13 4.86 0 8.8-3.5 8.8-7.83C20.8 6.7 16.86 3.2 12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8.05v5.5M9.25 10.8h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
